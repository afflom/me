// HL-01..HL-03: the observer's facets, run in Node against the real guests,
// and the observer itself on synthetic gestures. No network, no owner data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GUESTS, openGuest } from './guest.mjs';
import { HOLON, CURATE, FACETS, BANDS, RULE30, CLAIM } from './table.mjs';
import { rule30, lane, dominance, measure, kpiOf, tunableWord, floorOf, propose, neighbours, makeObserver, memoryKeep, claimForm, claimLabel } from './holon.mjs';
import { GUEST as KAPPA_GUEST, openGuest as openKappa } from '../kappa/guest.mjs';
import { makeKappa } from '../kappa/kappa.mjs';

const here = new URL('./', import.meta.url);
const spec = async (name) => JSON.parse(await readFile(new URL(`../../app/specs/${name}/spec.json`, here), 'utf8'));
let checks = 0;
const ok = (cond, message) => { assert.ok(cond, message); checks += 1; };

const guests = {};
for (const [name, g] of Object.entries(GUESTS)) {
  const bytes = new Uint8Array(await readFile(new URL(g.path, here)));
  const tampered = bytes.slice();
  tampered[tampered.length - 1] ^= 1;
  await assert.rejects(openGuest(tampered, g.sha256), /guest refused/);
  checks += 1;
  guests[name] = await openGuest(bytes, g.sha256);
}
const kappaBytes = new Uint8Array(await readFile(new URL(`../kappa/${KAPPA_GUEST.path}`, here)));
const kappa = makeKappa({ decide: await openKappa(kappaBytes, KAPPA_GUEST.sha256) });

// HL-01 and HL-02: every request of each facet against its mirror and its guarantees.
function every(facet) {
  let combos = [{}];
  for (const [n, vs] of facet.fields) combos = combos.flatMap((c) => vs.map((v) => ({ ...c, [n]: v })));
  return combos;
}
for (const [name, facet] of [['holon', HOLON], ['curate', CURATE]]) {
  const decide = guests[name];
  for (const [line, expected] of (await spec(name)).examples) ok((await decide(line)) === expected, `${name} example ${line} -> ${expected}`);
  const combos = every(facet);
  for (const r of combos) {
    const line = facet.line(r);
    const got = await decide(line);
    ok(got === facet.judge(r), `${name} mirror ${line} -> ${got}`);
    for (const g of facet.guarantees) {
      if (!g.when.every(([f, v]) => r[f] === v)) continue;
      if (g.always) ok(got === g.always, `${name} ${g.id} ${line} -> ${got}`);
      if (g.never) ok(!g.never.includes(got), `${name} ${g.id} ${line} -> ${got}`);
    }
  }
  const longest = facet.line(Object.fromEntries(facet.fields.map(([n, vs]) => [n, vs.reduce((a, b) => (b.length > a.length ? b : a))])));
  ok(longest.length === facet.maxLine, `${name} longest line is the limit`);
  for (const bad of ['', name, facet.line(combos[0]) + ' ', ' ' + facet.line(combos[0]), facet.line(combos[0]).toUpperCase(), facet.line(combos[0]).split(' ').slice(1).join(' '), 'x'.repeat(facet.maxLine + 1)]) {
    ok((await decide(bad)) === 'invalid', `${name} invalid: ${bad.slice(0, 40)}`);
  }
  console.log(`${name}: ${combos.length} requests`);
}

// HL-03: the observer.
for (const [from, to] of RULE30.vectors) ok(rule30(BigInt(from)) === BigInt(to), `rule30(${from}) = ${to}`);
ok(rule30(0n) === rule30(BigInt(RULE30.seed)), 'the all-zero register is seeded first');
const l = lane(0xff_ffn, 0);
ok(l.pick === 15 && l.up && l.steps === 4, 'lane bits');
ok(dominance({ dissonant: 1, missed: 0, interruptions: 0 }, { dissonant: 2, missed: 0, interruptions: 0 }) === 'dominates', 'dominates');
ok(dominance({ dissonant: 1, missed: 0, interruptions: 0 }, { dissonant: 1, missed: 0, interruptions: 0 }) === 'equal', 'equal');
ok(dominance({ dissonant: 3, missed: 0, interruptions: 0 }, { dissonant: 1, missed: 0, interruptions: 0 }) === 'dominated', 'dominated');
ok(dominance({ dissonant: 0, missed: 1, interruptions: 0 }, { dissonant: 1, missed: 0, interruptions: 0 }) === 'incomparable', 'incomparable');

const m = measure([
  { kappa: 'a', gesture: 'open', answer: 'bloom' },
  { kappa: 'a', gesture: 'dismiss', answer: 'recede' },
  { kappa: 'b', gesture: 'open', answer: 'whisper' },
  { kappa: 'b', gesture: 'keep', answer: 'chime' },
  { kappa: 'c', gesture: 'open', answer: 'chorus' },
  { kappa: 'c', gesture: 'keep', answer: 'bloom' },
]);
ok(m.brought === 2 && m.dissonant === 1 && m.keeps === 2 && m.missed === 1, `measure ${JSON.stringify(m)}`);
ok(kpiOf({ kind: 'facet' }, m) === 500 && kpiOf({ kind: 'owner' }, m) === 500, 'kpi');

ok(FACETS.some((f) => f.kind === 'owner') && FACETS.some((f) => f.kind === 'prism'), 'the owner and the Prism are facets');
ok(FACETS.every((f) => f.directive && f.objective && f.kpi && f.floor > 0 && f.floor <= 1000), 'every facet has a directive, an objective, a KPI and a floor');
ok(new Set(FACETS.map((f) => f.id)).size === FACETS.length, 'facet ids are unique');

// A synthetic engine: an item is brought forward when its salience reaches
// `near`; the owner keeps what is salient at 12 or more and dismisses the
// rest. Bringing forward below 2 is a humane defect.
const engine = { id: 'resonance', kind: 'facet', floor: 800, name: 'test', directive: 'd', objective: 'o', kpi: 'k',
  tunable: [{ name: 'near', min: 1, max: 16, step: 1, initial: 8 }, { name: 'gap', min: 0, max: 4, step: 2, initial: 2 }] };
const owner = FACETS.find((f) => f.kind === 'owner');
const prism = FACETS.find((f) => f.kind === 'prism');
const facets = [engine, owner, prism];
const answerOf = (p, s) => (s >= p.near ? 'bloom' : 'whisper');
function replay(p, signals) {
  let dissonant = 0, missed = 0, interruptions = 0, brought = 0, defect = 0;
  const seen = new Set();
  for (const s of signals) {
    if (s.gesture !== 'open' || seen.has(s.kappa)) continue;
    seen.add(s.kappa);
    const a = answerOf(p, s.raw.salience);
    const kept = s.raw.salience >= 12;
    if (a === 'bloom') { brought++; if (!kept) dissonant++; if (s.raw.hurried) interruptions++; }
    else if (kept) missed++;
    if (a === 'bloom' && p.near < 2) defect++;
  }
  return { brought, dissonant, missed, interruptions, defect };
}
let item = 0;
function round(p, n = BANDS.every / 2) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const salience = (item * 7) % 17;
    const k = `item${item++}`;
    const a = answerOf(p, salience);
    out.push({ kappa: k, place: 'today', gesture: 'open', answer: a, raw: { salience, hurried: salience % 5 === 0 } });
    out.push({ kappa: k, place: 'today', gesture: salience >= 12 ? 'keep' : 'dismiss', answer: salience >= 12 ? 'bloom' : 'recede', raw: { salience } });
  }
  return out;
}
const decide = { holon: guests.holon, curate: guests.curate };
const applied = [];
const keep = memoryKeep();
let obs = makeObserver({ decide, kappa, replay, keep, facets, apply: (id, p) => applied.push([id, { ...p }]) });
ok(JSON.stringify(obs.params('resonance')) === JSON.stringify(floorOf(engine)), 'a new observer runs the floor');
let last = replay(obs.params('resonance'), round(obs.params('resonance'), 32));
const before = last;
for (let r = 0; r < 24; r++) {
  const p = obs.params('resonance');
  for (const s of round(p)) await obs.observe(s);
  const now = obs.params('resonance');
  ok(tunableWord(engine, now) === 'yes', `round ${r}: params stay tunable ${JSON.stringify(now)}`);
}
const after = replay(obs.params('resonance'), round(obs.params('resonance'), 32));
ok(applied.length > 0, 'the observer adopted something on the owner\'s gestures');
ok(after.dissonant < before.dissonant && after.defect === 0, `dismissals eased ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
const ledger = obs.ledger('resonance');
ok(ledger.length > 0 && new Set(ledger).size === ledger.length && ledger.every((x) => /^sha256:[0-9a-f]{64}$/.test(x)), 'every claim is a kappa label, minted once');
ok(ledger.length <= CLAIM.ledger, 'the ledger is bounded');
const card = obs.scorecard();
ok(card.length === facets.length && card.every((c) => c.verdict !== undefined), 'every facet has a verdict');

// State survives a reload.
const again = makeObserver({ decide, kappa, replay, keep, facets });
ok(JSON.stringify(again.params('resonance')) === JSON.stringify(obs.params('resonance')), 'the observer restores its state');

// Halted: nothing changes.
const frozen = [];
obs = makeObserver({ decide, kappa, replay, facets, halted: () => 'yes', apply: (...a) => frozen.push(a) });
for (const s of round(obs.params('resonance'), 32)) await obs.observe(s);
ok(frozen.length === 0 && obs.scorecard().every((c) => c.verdict === 'refuse'), 'halted: the observer refuses and changes nothing');

// Too few of the owner's gestures: self-reference alone changes nothing.
const lonely = [];
obs = makeObserver({ decide, kappa, replay, facets: [engine], apply: (...a) => lonely.push(a) });
const few = round(obs.params('resonance'), 32).slice(0, BANDS.minOwnerGestures - 1);
for (const s of few) await obs.observe(s);
await obs.tick();
ok(lonely.length === 0 && obs.scorecard()[0].verdict === 'hold', 'self-reference alone holds');

// A regressed incumbent: the floor comes back.
const worse = memoryKeep();
worse.save({ facets: { resonance: { register: RULE30.seed, params: { near: 3, gap: 2 }, ledger: [] } } });
const restored = [];
obs = makeObserver({ decide, kappa, replay, keep: worse, facets: [engine], apply: (id, p) => restored.push(p) });
for (const s of round({ near: 3 }, 8)) await obs.observe(s);
ok(restored.length >= 1 && JSON.stringify(restored[0]) === JSON.stringify(floorOf(engine)), `the floor is restored ${JSON.stringify(restored)}`);

// Values off the spec are never run: a stored state off the step falls back to the floor.
const off = memoryKeep();
off.save({ facets: { resonance: { register: RULE30.seed, params: { near: 8, gap: 1 }, ledger: [] } } });
ok(JSON.stringify(makeObserver({ decide, kappa, replay, keep: off, facets: [engine] }).params('resonance')) === JSON.stringify(floorOf(engine)), 'an off-step state is not run');
ok(tunableWord(engine, { near: 17, gap: 2 }) === 'no' && tunableWord(engine, { near: 8 }) === 'no' && tunableWord(engine, { near: 8, gap: 2, x: 1 }) === 'no', 'tunable word');
for (let g = 0; g < RULE30.lanes; g++) ok(tunableWord(engine, propose(engine, floorOf(engine), rule30(BigInt(RULE30.seed)), g)) === 'yes', `lane ${g} stays in bounds`);
ok(neighbours(engine, floorOf(engine)).length === 4, 'one-step neighbours');

// Answers the observer does not expect are never obeyed.
const liar = { holon: async () => 'curate', curate: async () => 'ADOPT' };
const fooled = [];
obs = makeObserver({ decide: liar, kappa, replay, facets: [engine], apply: (...a) => fooled.push(a) });
for (const s of round(obs.params('resonance'), 16)) await obs.observe(s);
ok(fooled.length === 0, 'an unexpected answer is not obeyed');
// A claim label the kappa facet does not admit is never adopted.
const unnamed = [];
obs = makeObserver({ decide, kappa: { admit: async () => ({ outcome: 'mismatch' }) }, replay, facets: [engine], apply: (...a) => unnamed.push(a) });
for (const s of round(obs.params('resonance'), 32)) await obs.observe(s);
ok(unnamed.length === 0, 'an unnamed claim is never adopted');
ok((await claimLabel(claimForm(engine, floorOf(engine), { dissonant: 0, missed: 0, interruptions: 0 }, 'explore'))).startsWith('sha256:'), 'claim label');

console.log(`holon: ${checks} checks`);
