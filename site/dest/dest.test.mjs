// DS-01..DS-02: the destinations facet, run in Node against the real guest.
// No network: the Boundary is a stand-in that follows its proved rules for
// the cases used here, and every hand-off is recorded, never performed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GUEST, openGuest } from './guest.mjs';
// The decision as the model states it (app/specs/dest/spec.json): the guest
// built from it must answer every request as the spec's own tree does.
const SPEC = JSON.parse(await readFile(new URL('../../app/specs/dest/spec.json', import.meta.url), 'utf8'));
const FIELDS = SPEC.fields.map((f) => [f.name, f.values]);
const ANSWERS = SPEC.outcomes;
const GUARANTEES = SPEC.guarantees.map((g, i) => ({ id: `INV-${String(i + 1).padStart(3, '0')}`, ...g }));
const MAX_LINE = FIELDS.reduce((n, [, v]) => n + Math.max(...v.map((x) => x.length)), FIELDS.length - 1);
const walk = (t, r) => (typeof t === 'string' ? t : walk(r[t.if[0]] === t.if[1] ? t.then : t.else, r));
const judge = (r) => walk(SPEC.tree, r);
const lineOf = (r) => FIELDS.map(([name]) => r[name]).join(' ');
import { makeRouter, toneOf, sealOf, buildMail, buildEvent, buildShare } from './dest.mjs';
import { example } from '../../test/oracle/examples.mjs';

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
for (const [request, expected] of SPEC.examples) ok((await dest(request)) === expected, `example ${request} -> ${expected}`);
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

// The reply is RFC 5322's own (Appendix A.2): Mary Smith's answer to John Doe.
const field = (raw, name) => new RegExp(`^${name}: (.*)\\r$`, 'm').exec(raw)?.[1];
const A2 = example('rfc5322-6');
const A2body = A2.slice(A2.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '');
const reply = { target: 'mail', source: 'vault:abc', text: A2body, payload: { to: field(A2, 'To'), subject: field(A2, 'Subject'), body: A2body, inReplyTo: field(A2, 'In-Reply-To') } };
const prepared = await router.prepare(reply);
ok(prepared.answer === 'draft' && handed.length === 0, `the Prism only drafts on its own: ${prepared.answer}`);
const sent = await router.send(reply, prepared.seal);
ok(sent.answer === 'deliver' && sent.delivered && handed.length === 1 && handed[0].target === 'mail', `the owner's act on the seen words delivers: ${sent.answer}`);
ok(['To', 'Subject', 'In-Reply-To', 'References'].every((name) => field(handed[0].out.bytes, name) === field(A2, name)) && handed[0].out.bytes.endsWith(A2body), 'the reply is RFC 5322 with its thread, field for field as RFC 5322 writes it');

const edited = { ...reply, payload: { ...reply.payload, body: `${A2body} ${A2body}` } };
ok((await router.send(edited, prepared.seal)).answer === 'draft' && handed.length === 1, 'changed words go back to the owner (Satya)');
ok((await router.send(reply, null)).answer === 'draft' && handed.length === 1, 'a send without the seal of what was seen does not deliver');

// Coercive words are the urgency and scarcity lines Mathur et al. (CSCW 2019)
// found on shopping sites, from the oracle corpus.
const { corpus } = await import('../../test/oracle/examples.mjs');
const pressure = corpus.filter((c) => c.kind === 'coercive').map((c) => JSON.parse(c.raw).text);
const pushy = { ...reply, text: pressure[0] };
const pushySeal = (await router.prepare(pushy)).seal;
ok((await router.send(pushy, pushySeal)).answer === 'draft' && handed.length === 1, 'coercive words never leave (Ahimsa)');

ok((await router.send({ ...reply, source: undefined }, prepared.seal)).answer === 'refuse', 'an item with no cause is refused');
ok((await router.send({ ...reply, label: 'restricted' }, prepared.seal)).answer === 'refuse', 'restricted content never leaves');
ok((await router.send({ ...reply, target: 'elsewhere' }, prepared.seal)).answer === 'refuse', 'unmodeled destinations are refused');
haltedNow = 'yes';
ok((await router.send(reply, prepared.seal)).answer === 'refuse' && handed.length === 1, 'nothing leaves while halted');
haltedNow = 'no';

// The event is RFC 5545's own (section 4, the conference in Atlanta): its
// text, unescaped, must come back escaped exactly as RFC 5545 wrote it.
const E2 = example('rfc5545-2').replace(/\r\n[ \t]/g, '');
const prop = (raw, name) => new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)\\r$`, 'm').exec(raw)?.[1];
const unescape = (v) => v.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
const utc = (v) => v.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z');
const event = { target: 'calendar', cause: 'owner', text: unescape(prop(E2, 'SUMMARY')), payload: { uid: prop(E2, 'UID'), start: utc(prop(E2, 'DTSTART')), end: utc(prop(E2, 'DTEND')), summary: unescape(prop(E2, 'SUMMARY')), description: unescape(prop(E2, 'DESCRIPTION')) } };
const ev = await router.prepare(event);
ok((await router.send(event, ev.seal)).answer === 'deliver', 'the owner adds an event to their own calendar');
const built = handed.at(-1).out.bytes;
ok(['UID', 'DTSTART', 'DTEND', 'SUMMARY', 'DESCRIPTION'].every((name) => prop(built.replace(/\r\n[ \t]/g, ''), name) === prop(E2, name)), 'as iCalendar, each property as RFC 5545 writes it, its text escaped the same');
ok(built.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'every line folded at 75 octets (RFC 5545 3.1)');
ok(built.includes('METHOD:PUBLISH\r\n'), 'the event invites no one');
assert.throws(() => buildEvent({ uid: 'x', start: '2026-11-13T18:00:00Z', end: '2026-11-13T17:00:00Z', summary: 's' }), /ends after it starts/);
checks += 1;

// The owner as a destination: shown, or held while quiet; never delivered.
const note = { target: 'owner', source: 'vault:def', text: A2body };
ok((await router.prepare(note)).answer === 'show', 'the owner is shown what is theirs');
paceNow = 'quiet';
ok((await router.prepare(note)).answer === 'hold', 'quiet is kept');
ok((await router.prepare({ ...note, urgency: 'urgent' })).answer === 'show', 'only what the owner marked urgent breaks quiet');
paceNow = 'open';
ok((await router.prepare({ ...note, text: pressure[1] })).answer === 'hold', 'coercive content waits, never pushed');
ok(asked.filter((t) => t.startsWith('dest ')).every((t) => t.split(' ').length === 10), 'every dest request has its nine fields');

// The detectors and builders.
ok(pressure.length > 100 && toneOf(pressure.at(-1)) === 'coercive', 'tone check');
// Every message the specifications publish reads calm: none is held as coercive.
ok(corpus.filter((c) => c.kind === 'message').every((c) => toneOf(c.raw.slice(c.raw.search(/\r?\n\r?\n/))) === 'calm'), 'no example message of RFC 5322 or RFC 6047 is coercive');
ok((await sealOf('abc')) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'seal is SHA-256');
const m = buildMail({ to: 'a@example.org\r\nBcc: x@example.org', subject: 'Hi', body: 'x' });
ok(!m.bytes.includes('\r\nBcc:') && m.href.startsWith('mailto:a%40example.org'), 'header injection is flattened');
ok(buildShare({ title: 't', text: 'w' }).share.text === 'w', 'share');

console.log(`dest: ${checks} checks passed`);
