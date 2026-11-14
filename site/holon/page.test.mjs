// HL-03 on the page's own wiring (site/holon/page.mjs): the real resonance
// engine and its guest, the holon, curate and kappa guests, and the page's
// observer between them. No network, no owner data. Learning is a stand-in
// that follows PrismLearning's spec rules, as site/resonance/resonance.test.mjs does.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GUESTS, openGuest } from './guest.mjs';
import { GUEST as RES_GUEST, openGuest as openRes } from '../resonance/guest.mjs';
import { GUEST as KAPPA_GUEST, openGuest as openKappa } from '../kappa/guest.mjs';
import { makeResonance, paramsOf, DEFAULTS } from '../resonance/resonance.mjs';
import { observe } from './page.mjs';

const here = new URL('./', import.meta.url);
const open = async (opener, g, base) => opener(new Uint8Array(await readFile(new URL(g.path, base))), g.sha256);
const guest = {
  holon: await open(openGuest, GUESTS.holon, here),
  curate: await open(openGuest, GUESTS.curate, here),
  resonance: await open(openRes, RES_GUEST, new URL('../resonance/', here)),
  kappa: await open(openKappa, KAPPA_GUEST, new URL('../kappa/', here)),
};
const learningSpec = JSON.parse(await readFile(new URL('../../app/specs/learning/spec.json', here), 'utf8'));
const test = (c, r) => {
  const v = r[c.field];
  return c.op === 'is' ? v === c.value : c.op === 'is not' ? v !== c.value : c.op === '>=' ? v >= c.value : c.op === '<=' ? v <= c.value : false;
};
const learn = (rest) => {
  const [state, weight, signal] = rest.split(' ');
  const r = { state, weight: Number(weight), signal };
  return learningSpec.rules.find((rule) => rule.when.every((c) => test(c, r)))?.then ?? 'hold';
};
const asked = [];
const line = async (text) => {
  asked.push(text);
  const [facet, ...rest] = text.split(' ');
  if (facet === 'learn') return learn(rest.join(' '));
  return guest[facet] ? guest[facet](rest.join(' ')) : 'invalid request';
};
// A browser's local storage, for the observer's own state.
const local = new Map();
globalThis.localStorage = { getItem: (k) => local.get(k) ?? null, setItem: (k, v) => local.set(k, String(v)) };

let checks = 0;
const ok = (cond, message) => { assert.ok(cond, message); checks += 1; };

let clock = Date.UTC(2026, 10, 13, 12);
let halted = 'no';
const made = await makeResonance({ line, halted: () => halted, now: () => clock, hourOf: () => 14 });
const tuned = [];
const tune = made.tune;
made.tune = (p) => { tuned.push(p); return tune(p); };
const observer = await observe({ line, halted: () => halted, made, place: () => 'today' });
ok(JSON.stringify(made.params()) === JSON.stringify(paramsOf(DEFAULTS)), 'a first visit runs the floor');

// The owner opens things briefly and dismisses what the engine brings forward.
for (let i = 0; i < 48; i++) {
  const item = { address: `k1:${i.toString(16).padStart(2, '0')}`, at: clock };
  clock += 20000;
  await made.gesture(item, 'open', { dwellMs: 6000 });
  clock += 20000;
  await made.gesture(item, i % 3 ? 'dismiss' : 'keep');
}
await observer.settled();
ok(asked.some((a) => a.startsWith('holon ')), 'the page asks the holon facet');
ok(asked.filter((a) => a.startsWith('holon ')).every((a) => a.split(' ').length === 7), 'every holon line has its six fields');
ok(asked.filter((a) => a.startsWith('curate ')).every((a) => a.split(' ').length === 11), 'every curate line has its ten fields');
ok(asked.filter((a) => a.startsWith('kappa ')).every((a) => /^kappa sha256:[0-9a-f]{64} match$/.test(a)), 'every claim is named on sha256 by the kappa facet');
for (const p of tuned) ok((() => { try { paramsOf(p); return true; } catch { return false; } })(), `tuned within the spec: ${JSON.stringify(p)}`);
const card = observer.scorecard();
ok(card.find((c) => c.id === 'today')?.kpi !== null, 'the place the owner was in is measured');
ok(card.find((c) => c.id === 'resonance')?.verdict, 'the engine has a verdict');

// What was adopted runs again on the next visit.
const again = await makeResonance({ line, now: () => clock, hourOf: () => 14 });
await (await observe({ line, halted: () => 'no', made: again, place: () => 'today' })).settled();
ok(JSON.stringify(again.params()) === JSON.stringify(made.params()), 'adopted parameters survive a reload');

// Halted: the observer asks, is refused, and tunes nothing.
halted = 'yes';
const before = tuned.length;
asked.length = 0;
for (let i = 0; i < 16; i++) { clock += 20000; await made.gesture({ address: 'k1:ff', at: clock }, 'open', { dwellMs: 6000 }); }
await observer.settled();
ok(tuned.length === before && !asked.some((a) => a.startsWith('curate ')), 'halted: nothing is curated or tuned');

console.log(`holon page: ${checks} checks, ${tuned.length} tunings`);
