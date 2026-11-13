// RS-01..RS-02: the resonance facet, run in Node against the real guest.
// No network. Learning is a stand-in that follows PrismLearning's spec rules
// (app/specs/learning/spec.json, first match), read from the spec itself.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GUEST, openGuest } from './guest.mjs';
import { FIELDS, ANSWERS, GUARANTEES, MAX_LINE, START, judge, line as lineOf } from './table.mjs';
import { DEFAULTS, makeResonance, paramsOf, persist, replay, restore } from './resonance.mjs';

const here = new URL('./', import.meta.url);
const bytes = new Uint8Array(await readFile(new URL(GUEST.path, here)));
const decide = await openGuest(bytes, GUEST.sha256);
let checks = 0;
const ok = (cond, message) => { assert.ok(cond, message); checks += 1; };

const tampered = bytes.slice();
tampered[tampered.length - 1] ^= 1;
await assert.rejects(openGuest(tampered, GUEST.sha256), /guest refused/);
checks += 1;

// RS-01: every request, against the generated mirror and the ten guarantees.
const product = (lists) => lists.reduce((acc, list) => acc.flatMap((a) => list.map((b) => [...a, b])), [[]]);
const names = FIELDS.map(([name]) => name);
let total = 0;
for (const values of product(FIELDS.map(([, v]) => v))) {
  const r = Object.fromEntries(names.map((n, i) => [n, values[i]]));
  const answer = await decide(lineOf(r));
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
assert.equal(total, 1920);
for (const bad of ['', 'dwell', 'Dwell calm near day confirmed open no', 'dwell calm near day confirmed open no extra', 'x'.repeat(MAX_LINE + 1)]) {
  ok((await decide(bad)) === 'invalid', `invalid: ${bad.slice(0, 40)}`);
}

// RS-02: the loop. Gestures are answered by the guest, learning follows its spec.
const learningSpec = JSON.parse(await readFile(new URL('../../app/specs/learning/spec.json', import.meta.url), 'utf8'));
const test = (c, r) => {
  const v = r[c.field];
  return c.op === 'is' ? v === c.value : c.op === 'is not' ? v !== c.value : c.op === '>=' ? v >= c.value : c.op === '<=' ? v <= c.value : false;
};
const learnLine = (rest) => {
  const [state, weight, signal] = rest.split(' ');
  const r = { state, weight: Number(weight), signal };
  return learningSpec.rules.find((rule) => rule.when.every((c) => test(c, r)))?.then ?? 'hold';
};
const asked = [];
const line = async (text) => {
  asked.push(text);
  const [facet, ...rest] = text.split(' ');
  if (facet === 'resonance') return decide(rest.join(' '));
  if (facet === 'learn') return learnLine(rest.join(' '));
  return 'invalid request';
};
const store = new Map();
const keep = { get: () => store.get('snap') ?? null, set: (t) => store.set('snap', t) };
let clock = Date.UTC(2026, 10, 13, 12);
let halted = 'no';
let attention = 'open';
const res = await makeResonance({ line, keep, halted: () => halted, attention: () => attention, now: () => clock, hourOf: () => 14 });
const events = [];
res.onResonance((e) => events.push(e));
const near = { address: 'k1:aa', at: clock };
const far = { address: 'k1:bb', at: clock - 30 * 24 * 3600000 };
const step = async (item, kind, opts) => { clock += 20000; return res.gesture(item, kind, opts); };

// A calm, long stay with a thing of today brings it forward and raises its weight.
let e = await step(near, 'open', { dwellMs: 6000 });
ok(e.gesture === 'dwell' && e.pace === 'still' && e.salience === 'near' && e.phase === 'day', 'derived fields');
ok(e.answer === 'bloom' && e.learned === 'raise' && res.beliefOf(near.address).weight === START.weight + 1, 'dwell blooms and raises');
// A glance chimes and teaches nothing.
e = await step(near, 'open');
ok(e.answer === 'chime' && e.learned === 'none', 'a glance chimes');
// Staying again and again consolidates at weight 10; then it gathers a chorus.
while (res.beliefOf(near.address).belief === 'inferred') await step(near, 'open', { dwellMs: 6000 });
ok(res.beliefOf(near.address).belief === 'consolidated' && res.beliefOf(near.address).weight === 10, 'consolidated at 10');
e = await step(near, 'open', { dwellMs: 6000 });
ok(e.answer === 'chorus', 'a consolidated belief gathers a chorus');
// Hurried: never more.
clock += 1;
e = await res.gesture(near, 'open', { dwellMs: 6000 });
ok(e.pace === 'hurried' && e.answer === 'whisper' && e.learned === 'none', 'hurried is met with a whisper');
// A dismissal recedes and lowers.
const before = res.beliefOf(far.address).weight;
e = await step(far, 'dismiss');
ok(e.answer === 'recede' && res.beliefOf(far.address).weight === before - 1, 'dismiss recedes and lowers');
// Quiet keeps everything soft; halted stills everything and learns nothing.
attention = 'quiet';
e = await step(near, 'keep');
ok(e.answer === 'whisper' && e.learned === 'none', 'quiet: a whisper');
attention = 'open';
halted = 'yes';
const w = res.beliefOf(near.address).weight;
e = await step(near, 'dismiss');
ok(e.answer === 'rest' && e.learned === 'none' && res.beliefOf(near.address).weight === w, 'halted: rest, nothing learned');
halted = 'no';
// Only the owner confirms or rejects; a rejected thing never comes forward again.
ok((await res.reject(far)) === 'reject' && res.beliefOf(far.address).belief === 'rejected', 'owner rejects');
e = await step(far, 'keep');
ok(!['bloom', 'chorus'].includes(e.answer), 'rejected never brought forward');
ok(res.order([far, near])[0] === near, 'order: what resonates first');
ok(events.length === asked.filter((a) => a.startsWith('resonance ')).length, 'one signal per gesture');
ok(asked.every((a) => /^(resonance|learn) /.test(a)), 'only the resonance and learn facets are asked');

// Anamnesis: restore(persist(S)) = S, and a tampered or malformed snapshot restores nothing.
await res.settled();
const snap = store.get('snap');
const back = await restore(snap);
ok(back && (await persist(back)) === snap && (await res.snapshot()) === snap, 'zero drift round trip');
const again = await makeResonance({ line, keep, now: () => clock, hourOf: () => 14 });
ok(again.beliefOf(near.address).weight === res.beliefOf(near.address).weight && again.beliefOf(far.address).belief === 'rejected', 'a reload remembers');
const parsed = JSON.parse(snap);
parsed.rows[0][2] = parsed.rows[0][2] === 16 ? 15 : parsed.rows[0][2] + 1;
ok((await restore(JSON.stringify(parsed))) === null, 'tampered weight refused');
ok((await restore('not json')) === null && (await restore(JSON.stringify({ v: 2, rows: [], seal: '' }))) === null, 'malformed refused');

// Tunables: modeled bounds and order, or refused.
assert.throws(() => paramsOf({ dwellMs: 999 }), /outside/); checks += 1;
assert.throws(() => paramsOf({ hurriedGapMs: 10000, calmGapMs: 20000, dwellMs: 4000 }) && paramsOf({ dayHour: 11, duskHour: 16, dawnHour: 8, nightHour: 20 }) && paramsOf({ dawnHour: 8, dayHour: 7 }), /order|outside/); checks += 1;
ok(paramsOf({}).dwellMs === DEFAULTS.dwellMs, 'defaults');
assert.throws(() => res.tune({ dwellMs: 1 }), /outside/); checks += 1;
ok(res.params().dwellMs === DEFAULTS.dwellMs, 'a refused tune keeps the old tunables');
ok(res.tune({ ...DEFAULTS, dwellMs: 12000 }).dwellMs === 12000, 'tune');
e = await step({ address: 'k1:cc', at: clock }, 'open', { dwellMs: 6000 });
ok(e.gesture === 'open', 'tuned dwell applies from the next gesture');
res.tune(DEFAULTS);

// Replay: the same answers, pure, under a candidate's tunables.
const r0 = replay(DEFAULTS, events);
ok(r0.defect === 0 && r0.brought > 0 && r0.dissonant === 1 && r0.interruptions === 0, `replay ${JSON.stringify(r0)}`);
const dismissedAfterBloom = [...events.slice(0, 1), { ...events[0], raw: { ...events[0].raw, kind: 'dismiss' } }];
ok(replay(DEFAULTS, dismissedAfterBloom).dissonant === 1, 'dismissing what was brought forward is dissonance');
const longer = replay({ ...DEFAULTS, dwellMs: 8000 }, events.slice(0, 1));
ok(longer.brought === 0, 'a longer dwell threshold brings less forward');

console.log(`resonance: ${checks} checks`);
