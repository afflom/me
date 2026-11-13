// Resonance: how the Prism answers one gesture of the owner toward one thing
// it holds, and what it learns from that. Nothing here decides. Two proved
// guests do, through the Prism root:
//
//   resonance "<gesture> <pace> <salience> <phase> <belief> <attention> <halted>"
//             -> rest|whisper|chime|bloom|chorus|recede            (PrismResonance)
//   learn     "<state> <weight> <signal>"
//             -> raise|lower|hold|consolidate|demote|confirm|reject (PrismLearning)
//
// This module derives the request's fields from what the browser saw (the
// gap between gestures, how long the owner stayed, how near the thing is to
// now, the local hour) using the spec's tunables, asks the root, passes the
// answer's learning signal on, and keeps what was learned as a sealed
// snapshot in this browser (restore(persist(S)) = S, or nothing is restored).
// A snapshot holds vault addresses (opaque HMACs), states and weights: no content.

import { ANSWERS, GUARANTEES, LEARNING, SIGNALS, START, TUNABLE, judge, line as lineOf } from './table.mjs';

export const DEFAULTS = Object.freeze(Object.fromEntries(TUNABLE.map((t) => [t.name, t.initial])));
export const GESTURES = ['open', 'keep', 'dismiss', 'still'];
export const BROUGHT = ['bloom', 'chorus'];
const HOUR = 3600000;
const STATES = ['inferred', 'consolidated', 'confirmed', 'rejected'];
const LEARNED = Object.keys(LEARNING);

// The page's one resonance bus: every instance's signals reach every listener
// (the curator, the voice). Returns the unsubscribe.
const bus = new Set();
export function onResonance(fn) { bus.add(fn); return () => bus.delete(fn); }

// A candidate's tunables, inside their modeled bounds and steps, or refused.
export function paramsOf(candidate = {}) {
  const out = {};
  for (const t of TUNABLE) {
    const v = candidate[t.name] ?? t.initial;
    if (!Number.isFinite(v) || v < t.min || v > t.max || (v - t.min) % t.step !== 0) {
      throw Object.assign(new Error(`${t.name} ${v} is outside ${t.min}..${t.max} by ${t.step}`), { code: 'resonance.tunable' });
    }
    out[t.name] = v;
  }
  if (!(out.hurriedGapMs < out.calmGapMs) || !(out.dawnHour < out.dayHour && out.dayHour < out.duskHour && out.duskHour < out.nightHour)) {
    throw Object.assign(new Error('tunables out of order'), { code: 'resonance.tunable' });
  }
  return out;
}

// The request's fields from what the browser saw. raw = {kind, gapMs, dwellMs, at, itemAt, hour}.
export function derive(params, raw) {
  const gesture = raw.kind === 'open' && raw.dwellMs >= params.dwellMs ? 'dwell' : raw.kind;
  const pace = gesture === 'still' || raw.gapMs >= params.calmGapMs ? 'still' : raw.gapMs < params.hurriedGapMs ? 'hurried' : 'calm';
  const salience = raw.itemAt && Math.abs(raw.itemAt - raw.at) <= params.nearHours * HOUR ? 'near' : 'far';
  const h = raw.hour;
  const phase = h >= params.nightHour || h < params.dawnHour ? 'night' : h < params.dayHour ? 'dawn' : h < params.duskHour ? 'day' : 'dusk';
  return { gesture, pace, salience, phase };
}

// --- Anamnesis: the learned beliefs as one sealed, canonical snapshot. ---

const encoder = new TextEncoder();
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const canonical = (beliefs) => [...beliefs.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, b]) => [k, b.belief, b.weight]);
async function sealOf(rows) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(rows)))));
}

export async function persist(beliefs) {
  const rows = canonical(beliefs);
  return JSON.stringify({ v: 1, rows, seal: await sealOf(rows) });
}

// Restores only a snapshot whose seal re-derives and whose every row is a
// modeled state with a weight in 1..16; anything else restores nothing.
export async function restore(text) {
  try {
    const snap = JSON.parse(text);
    if (snap?.v !== 1 || !Array.isArray(snap.rows) || snap.seal !== await sealOf(snap.rows)) return null;
    const out = new Map();
    for (const row of snap.rows) {
      const [k, belief, weight] = row;
      if (typeof k !== 'string' || !STATES.includes(belief) || !Number.isInteger(weight) || weight < 1 || weight > 16 || out.has(k)) return null;
      out.set(k, { belief, weight });
    }
    return out;
  } catch {
    return null;
  }
}

// --- The live loop. ---

// line: the root guest ("<facet> <rest>" -> answer). halted/attention: the
// owner's switches. keep: {get() -> text|null, set(text)} for the snapshot.
export async function makeResonance({ line, halted = () => 'no', attention = () => 'open', keep = null, params = DEFAULTS, now = () => Date.now(), hourOf = (at) => new Date(at).getHours() }) {
  const tunables = paramsOf(params);
  const listeners = new Set();
  const beliefs = (keep && (await restore(keep.get() ?? ''))) || new Map();
  let last = 0;
  let saving = Promise.resolve();
  const beliefOf = (kappa) => beliefs.get(kappa) ?? { belief: START.belief, weight: START.weight };

  async function learn(kappa, signal) {
    const b = beliefOf(kappa);
    const outcome = (await line(`learn ${b.belief} ${b.weight} ${signal}`)).trim();
    if (!LEARNED.includes(outcome)) return 'refused';
    const step = LEARNING[outcome];
    if (step) {
      const next = { ...b };
      if (step[0] === 'weight') next.weight = b.weight + step[1];
      else next.belief = step[1];
      beliefs.set(kappa, next);
      if (keep) saving = saving.then(async () => keep.set(await persist(beliefs)));
    }
    return outcome;
  }

  // One gesture of the owner. item = {address, at}; kind in GESTURES.
  async function gesture(item, kind, { dwellMs = 0 } = {}) {
    if (!GESTURES.includes(kind)) throw Object.assign(new Error(`unknown gesture ${kind}`), { code: 'resonance.gesture' });
    const at = now();
    const raw = { kind, gapMs: last ? at - last : tunables.calmGapMs, dwellMs, at, itemAt: item?.at ?? 0, hour: hourOf(at) };
    last = at;
    const fields = derive(tunables, raw);
    const { belief } = beliefOf(item?.address ?? '');
    const request = { ...fields, belief, attention: attention(), halted: halted() };
    const said = (await line(`resonance ${lineOf(request)}`)).trim();
    const answer = ANSWERS.includes(said) ? said : 'rest';
    const signal = SIGNALS[answer];
    const learned = signal && item?.address ? await learn(item.address, signal) : 'none';
    const event = { at, kappa: item?.address ?? '', ...request, answer, learned, raw };
    for (const fn of [...listeners, ...bus]) { try { fn(event); } catch {} }
    return event;
  }

  // The owner's own word on a belief: the only way one is confirmed or rejected.
  const confirm = (item) => learn(item.address, 'ownerconfirm');
  const reject = (item) => learn(item.address, 'ownerreject');

  // Things the owner resonates with come first; within a weight, the newest.
  const rank = (b) => (b.belief === 'rejected' ? -1 : b.belief === 'confirmed' ? 32 : b.belief === 'consolidated' ? 16 : 0) + b.weight;
  const order = (items) => [...items].sort((a, b) => rank(beliefOf(b.address)) - rank(beliefOf(a.address)) || b.at - a.at);

  return {
    gesture, confirm, reject, order, beliefOf,
    onResonance(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    snapshot: () => persist(beliefs),
    settled: () => saving,
  };
}

// --- Replay: the same loop, pure, for the curator's candidates. ---
// signals: events as onResonance emitted them (their raw facts are replayed
// under the candidate's tunables; belief, attention and halted as they were).
export function replay(params, signals) {
  const p = paramsOf(params);
  const brought = new Map();
  const quiet = new Map();
  let out = { brought: 0, dissonant: 0, missed: 0, interruptions: 0, defect: 0 };
  for (const s of signals) {
    const r = { ...derive(p, s.raw), belief: s.belief, attention: s.attention, halted: s.halted };
    const answer = judge(r);
    for (const g of GUARANTEES) {
      if (!g.when.every(([f, v]) => r[f] === v)) continue;
      if ((g.always && answer !== g.always) || (g.never && g.never.includes(answer))) out.defect += 1;
    }
    if (BROUGHT.includes(answer)) { out.brought += 1; brought.set(s.kappa, true); }
    if (answer === 'whisper' || answer === 'rest') quiet.set(s.kappa, true);
    if (r.pace === 'hurried' && ['chime', 'bloom', 'chorus'].includes(answer)) out.interruptions += 1;
    if (r.gesture === 'dismiss' && brought.get(s.kappa)) { out.dissonant += 1; brought.delete(s.kappa); }
    if (r.gesture === 'keep' && quiet.get(s.kappa)) { out.missed += 1; quiet.delete(s.kappa); }
  }
  return out;
}
