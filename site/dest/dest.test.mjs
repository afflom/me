// DS-01..DS-02: the destinations facet, run in Node against the real guest.
// No network: the Boundary is a stand-in that follows its proved rules for
// the cases used here, and every hand-off is recorded, never performed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GUEST, openGuest } from './guest.mjs';
import { FIELDS, ANSWERS, GUARANTEES, MAX_LINE, judge, line as lineOf } from './table.mjs';
import { makeRouter, toneOf, sealOf, buildMail, buildEvent, buildShare } from './dest.mjs';

const here = new URL('./', import.meta.url);
const bytes = new Uint8Array(await readFile(new URL(GUEST.path, here)));
const dest = await openGuest(bytes, GUEST.sha256);
let checks = 0;
const ok = (cond, message) => { assert.ok(cond, message); checks += 1; };

// A guest whose bytes are not the pinned fingerprint is refused before it compiles.
const tampered = bytes.slice();
tampered[tampered.length - 1] ^= 1;
await assert.rejects(openGuest(tampered, GUEST.sha256), /guest refused/);
checks += 1;

// DS-01: every request, against the generated mirror and the eleven guarantees.
const product = (lists) => lists.reduce((acc, list) => acc.flatMap((a) => list.map((b) => [...a, b])), [[]]);
const names = FIELDS.map(([name]) => name);
let total = 0;
for (const values of product(FIELDS.map(([, v]) => v))) {
  const r = Object.fromEntries(names.map((n, i) => [n, values[i]]));
  const answer = await dest(lineOf(r));
  const why = `${lineOf(r)} -> ${answer}`;
  ok(ANSWERS.includes(answer), why);
  ok(answer === judge(r), `mirror ${why}`);
  for (const g of GUARANTEES) {
    if (!g.when.every(([f, v]) => r[f] === v)) continue;
    if (g.always) ok(answer === g.always, `${g.id} ${why}`);
    if (g.never) ok(!g.never.includes(answer), `${g.id} ${why}`);
  }
  total += 1;
}
assert.equal(total, 2560);
for (const bad of ['', 'mail', 'Mail allow grounded owner seen calm open normal no', 'mail allow grounded owner seen calm open normal no extra', 'x'.repeat(MAX_LINE + 1)]) {
  ok((await dest(bad)) === 'invalid', `invalid: ${bad.slice(0, 40)}`);
}

// DS-02: the router asks the Boundary and PrismDest, and hands off only on deliver.
const boundary = (rest) => {
  const [label, detector, where, approval, identifier, halted] = rest.split(' ');
  if (halted === 'yes' || detector !== 'none') return 'deny';
  if (where === 'browser') return label === 'restricted' ? 'hashonly' : 'allow';
  if (identifier === 'yes') return 'deny';
  if (label === 'restricted') return 'deny';
  if (label === 'public') return 'allow';
  return approval === 'owner' ? 'allow' : 'ask';
};
const asked = [];
const handed = [];
let haltedNow = 'no';
let paceNow = 'open';
const router = makeRouter({
  line: async (text) => {
    asked.push(text);
    const [facet, ...rest] = text.split(' ');
    return facet === 'boundary' ? boundary(rest.join(' ')) : facet === 'dest' ? dest(rest.join(' ')) : 'invalid request';
  },
  halted: () => haltedNow,
  pace: () => paceNow,
  handoff: async (out, target) => { handed.push({ out, target }); },
});

const reply = { target: 'mail', source: 'vault:abc', text: 'Thank you, Thursday works for me.', payload: { to: 'friend@example.org', subject: 'Re: Thursday', body: 'Thank you, Thursday works for me.', inReplyTo: '<m1@example.org>' } };
const prepared = await router.prepare(reply);
ok(prepared.answer === 'draft' && handed.length === 0, `the Prism only drafts on its own: ${prepared.answer}`);
const sent = await router.send(reply, prepared.seal);
ok(sent.answer === 'deliver' && sent.delivered && handed.length === 1 && handed[0].target === 'mail', `the owner's act on the seen words delivers: ${sent.answer}`);
ok(handed[0].out.bytes.includes('In-Reply-To: <m1@example.org>\r\n') && handed[0].out.bytes.endsWith('Thursday works for me.'), 'the reply is RFC 5322 with its thread');

const edited = { ...reply, payload: { ...reply.payload, body: 'Thursday works. Bring the contract.' } };
ok((await router.send(edited, prepared.seal)).answer === 'draft' && handed.length === 1, 'changed words go back to the owner (Satya)');
ok((await router.send(reply, null)).answer === 'draft' && handed.length === 1, 'a send without the seal of what was seen does not deliver');

const pushy = { ...reply, text: 'Last chance: reply now or else.' };
const pushySeal = (await router.prepare(pushy)).seal;
ok((await router.send(pushy, pushySeal)).answer === 'draft' && handed.length === 1, 'coercive words never leave (Ahimsa)');

ok((await router.send({ ...reply, source: undefined }, prepared.seal)).answer === 'refuse', 'an item with no cause is refused');
ok((await router.send({ ...reply, label: 'restricted' }, prepared.seal)).answer === 'refuse', 'restricted content never leaves');
ok((await router.send({ ...reply, target: 'elsewhere' }, prepared.seal)).answer === 'refuse', 'unmodeled destinations are refused');
haltedNow = 'yes';
ok((await router.send(reply, prepared.seal)).answer === 'refuse' && handed.length === 1, 'nothing leaves while halted');
haltedNow = 'no';

const event = { target: 'calendar', cause: 'owner', text: 'Walk', payload: { uid: 'u1@me', start: '2026-11-13T17:00:00Z', end: '2026-11-13T18:00:00Z', summary: 'Walk; then tea, maybe' } };
const ev = await router.prepare(event);
ok((await router.send(event, ev.seal)).answer === 'deliver' && handed.at(-1).out.bytes.includes('SUMMARY:Walk\\; then tea\\, maybe\r\n'), 'the owner adds an event to their own calendar as iCalendar');
ok(handed.at(-1).out.bytes.includes('METHOD:PUBLISH\r\n') && handed.at(-1).out.bytes.includes('DTSTART:20261113T170000Z\r\n'), 'the event invites no one and is in UTC');
assert.throws(() => buildEvent({ uid: 'x', start: '2026-11-13T18:00:00Z', end: '2026-11-13T17:00:00Z', summary: 's' }), /ends after it starts/);
checks += 1;

// The owner as a destination: shown, or held while quiet; never delivered.
const note = { target: 'owner', source: 'vault:def', text: 'Your sister wrote about Sunday.' };
ok((await router.prepare(note)).answer === 'show', 'the owner is shown what is theirs');
paceNow = 'quiet';
ok((await router.prepare(note)).answer === 'hold', 'quiet is kept');
ok((await router.prepare({ ...note, urgency: 'urgent' })).answer === 'show', 'only what the owner marked urgent breaks quiet');
paceNow = 'open';
ok((await router.prepare({ ...note, text: 'Final notice: pay immediately or else.' })).answer === 'hold', 'coercive content waits, never pushed');
ok(asked.filter((t) => t.startsWith('dest ')).every((t) => t.split(' ').length === 10), 'every dest request has its nine fields');

// The detectors and builders.
ok(toneOf('Only 3 seats left, act now!') === 'coercive' && toneOf('Thanks, see you soon.') === 'calm', 'tone check');
ok((await sealOf('abc')) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'seal is SHA-256');
const m = buildMail({ to: 'a@example.org\r\nBcc: x@example.org', subject: 'Hi', body: 'x' });
ok(!m.bytes.includes('\r\nBcc:') && m.href.startsWith('mailto:a%40example.org'), 'header injection is flattened');
ok(buildShare({ title: 't', text: 'w' }).share.text === 'w', 'share');

console.log(`dest: ${checks} checks passed`);
