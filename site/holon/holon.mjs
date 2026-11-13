// The Prism's observer, in the owner's browser: the reflexive holon and its
// curator, after verdant-resonance's Teleology and conservatory curation.
//
// Every facet (the resonance engine, each place, the owner as co-observer and
// the Prism as a facet of itself) has a directive, an objective and a KPI
// floor (FACETS, generated from the specs). On the owner's gestures the
// observer measures every facet and asks the holon facet what to do next;
// for a facet whose spec marks parameters tunable it then restores the floor,
// reconciles toward the owner or curates: the 64-cell Rule-30 register
// proposes hypotheses, each replayed on the window, and the curate facet
// decides whether one replaces what runs. Every adoption is named by a kappa
// label the kappa facet admitted, and minted once.
//
// This module decides nothing itself: it measures, replays and carries one
// line to each facet, and obeys only answers it expects.
//
//   const observer = makeObserver({ decide, kappa, replay, keep, halted, apply });
//   onResonance(observer.observe);      // every signal from the resonance engine
//   observer.scorecard()                // every facet's KPI against its floor

import { HOLON, CURATE, FACETS, BANDS, GESTURES, OBJECTIVES, RULE30, CLAIM } from './table.mjs';

const MASK = (1n << 64n) - 1n;
const SEED = BigInt(RULE30.seed);
const te = new TextEncoder();

// One step of the 64-cell cyclic Rule-30 register: next(i) = cell(i + 1) XOR
// (cell(i) OR cell(i - 1)) on Z/64Z, the all-zero register seeded first.
export function rule30(state) {
  let s = BigInt(state) & MASK;
  if (s === 0n) s = SEED;
  const left = ((s >> 1n) | (s << 63n)) & MASK;
  const right = ((s << 1n) | (s >> 63n)) & MASK;
  return (left ^ (s | right)) & MASK;
}

// Lane g of a stepped register: which tunable, which way, how many steps.
export function lane(register, g) {
  const byte = Number((BigInt(register) >> BigInt(16 * g)) & 0xffn);
  return { pick: byte & 0x0f, up: (byte & 0x10) !== 0, steps: ((byte >> 5) & 0x03) + 1 };
}

// a against b on objectives that are each minimized.
export function dominance(a, b) {
  let better = false;
  let worse = false;
  for (const k of OBJECTIVES) {
    if (a[k] < b[k]) better = true;
    if (a[k] > b[k]) worse = true;
  }
  if (better && !worse) return 'dominates';
  if (!better && !worse) return 'equal';
  if (worse && !better) return 'dominated';
  return 'incomparable';
}

// What the owner did with what the Prism answered, over a run of signals.
// An item is brought forward when the Prism answered one of GESTURES.brought
// on it; a dismiss after that is dissonant; a keep after GESTURES.quiet is
// missed.
export function measure(signals) {
  const last = new Map();
  const brought = new Set();
  const dissonant = new Set();
  let keeps = 0;
  let missed = 0;
  for (const s of signals) {
    const before = last.get(s.kappa);
    if (s.gesture === 'dismiss' && GESTURES.brought.includes(before)) dissonant.add(s.kappa);
    if (s.gesture === 'keep') {
      keeps++;
      if (GESTURES.quiet.includes(before)) missed++;
    }
    if (GESTURES.brought.includes(s.answer)) brought.add(s.kappa);
    last.set(s.kappa, s.answer);
  }
  return { gestures: signals.length, brought: brought.size, dissonant: dissonant.size, keeps, missed };
}

const permille = (part, whole) => (whole === 0 ? null : Math.floor((1000 * part) / whole));

// One facet's KPI over its signals (null when nothing was measured).
export function kpiOf(facet, m) {
  if (facet.kind === 'owner') return permille(m.keeps - m.missed, m.keeps);
  return permille(m.brought - m.dissonant, m.brought);
}

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// Whether every value is a tunable of the facet, on its step and in its bounds.
export function tunableWord(facet, params) {
  const names = new Set(facet.tunable.map((t) => t.name));
  for (const [name, value] of Object.entries(params)) {
    const t = facet.tunable.find((x) => x.name === name);
    if (!t || !isNumber(value) || value < t.min || value > t.max) return 'no';
    const k = (value - t.min) / t.step;
    if (Math.abs(k - Math.round(k)) > 1e-9) return 'no';
  }
  return names.size > 0 && facet.tunable.every((t) => t.name in params) ? 'yes' : 'no';
}

export const floorOf = (facet) => Object.fromEntries(facet.tunable.map((t) => [t.name, t.initial]));

const clamp = (t, v) => Math.min(t.max, Math.max(t.min, v));

// A Rule-30 hypothesis: one lane moves one tunable by one to four steps.
export function propose(facet, params, register, g) {
  const { pick, up, steps } = lane(register, g);
  const t = facet.tunable[pick % facet.tunable.length];
  return { ...params, [t.name]: clamp(t, params[t.name] + (up ? 1 : -1) * steps * t.step) };
}

// Every one-step move of one tunable, in spec order.
export function neighbours(facet, params) {
  const out = [];
  for (const t of facet.tunable) {
    for (const d of [-1, 1]) {
      const v = clamp(t, params[t.name] + d * t.step);
      if (v !== params[t.name]) out.push({ ...params, [t.name]: v });
    }
  }
  return out;
}

export function claimForm(facet, params, scored, move) {
  const ps = facet.tunable.map((t) => `${t.name}=${params[t.name]}`).join(',');
  return [CLAIM.profile, facet.id, ps, OBJECTIVES.map((k) => scored[k]).join(','), move].join('|');
}

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
export async function claimLabel(form) {
  return `sha256:${hex(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(form))))}`;
}

function expect(answer, allowed) {
  const a = String(answer).trim();
  return allowed.includes(a) ? a : 'invalid';
}

// decide: { holon(line), curate(line) } -> the facet's answer (the root guest's
//   "holon <line>" and "curate <line>").
// kappa: { admit(label, bytes) } from site/kappa/kappa.mjs.
// replay(params, signals) -> { brought, dissonant, missed, interruptions, defect }:
//   the resonance engine's answers to the same gestures under other parameters.
// keep: { load() -> state | null, save(state) }, the observer's own state, in
//   this browser.
// apply(facetId, params): hand adopted parameters to the facet that runs them.
// admissible(facetId, params): the facet's own check beyond bounds and step
//   (the resonance engine's paramsOf also keeps the hours of the day in order).
export function makeObserver({ decide, kappa, replay, keep = memoryKeep(), halted = () => 'no', apply = () => {}, admissible = () => true, facets = FACETS }) {
  const window = [];
  let since = 0;
  const loaded = keep.load() ?? {};
  const state = { facets: {}, verdicts: {}, ...loaded };
  for (const f of facets) {
    if (!f.tunable.length) continue;
    const s = state.facets[f.id] ?? {};
    const params = tunableWord(f, s.params ?? {}) === 'yes' && admissible(f.id, s.params) ? s.params : floorOf(f);
    state.facets[f.id] = { register: String(s.register ?? RULE30.seed), params, ledger: Array.isArray(s.ledger) ? s.ledger.slice(-CLAIM.ledger) : [] };
  }

  const ofFacet = (f) => (f.kind === 'place' ? window.filter((s) => s.place === f.id) : window);

  function bands(f, signals) {
    const m = measure(signals);
    const kpi = kpiOf(f, m);
    const share = permille(m.dissonant, m.brought) ?? 0;
    return {
      m,
      kpi,
      signal: m.gestures >= BANDS.minOwnerGestures ? 'owner' : 'self',
      dissonance: m.dissonant === 0 ? 'none' : share >= BANDS.highDissonancePermille ? 'high' : 'some',
      met: kpi === null || kpi >= f.floor ? 'met' : 'missed',
    };
  }

  // The Prism as a facet of itself: the share of measured facets at their floor.
  function prismKpi(rows) {
    const measured = rows.filter((r) => r.kind !== 'prism' && r.kpi !== null);
    return permille(measured.filter((r) => r.kpi >= r.floor).length, measured.length);
  }

  const tunableOf = (f, params) => (tunableWord(f, params) === 'yes' && admissible(f.id, params) ? 'yes' : 'no');
  const UNRUN = { dissonant: Infinity, missed: Infinity, interruptions: Infinity, defect: Infinity };

  function score(f, params, signals) {
    if (tunableOf(f, params) === 'no') return UNRUN;
    const r = replay(params, signals);
    return { dissonant: r.dissonant, missed: r.missed, interruptions: r.interruptions, defect: r.defect };
  }

  async function weigh(f, s, candidate, move, runs, signals, evidence) {
    const scored = score(f, candidate, signals);
    const floor = score(f, floorOf(f), signals);
    const form = claimForm(f, candidate, scored, move);
    const label = await claimLabel(form);
    const admitted = (await kappa.admit(label, te.encode(form))).outcome === 'admit' ? 'admit' : 'other';
    const r = {
      halted: halted(),
      tunable: tunableOf(f, candidate),
      label: admitted,
      defect: scored.defect === 0 ? 'zero' : 'some',
      evidence,
      floor: dominance(floor, scored) === 'dominates' ? 'regressed' : 'kept',
      move,
      eased: scored.dissonant < runs.dissonant ? 'yes' : 'no',
      dominance: dominance(scored, runs),
      claim: s.ledger.includes(label) ? 'known' : 'new',
    };
    const answer = expect(await decide.curate(CURATE.line(r)), ['adopt', 'recall', 'keep', 'refuse']);
    return { answer, label, scored, request: r };
  }

  async function act(f, verdict, evidence) {
    const s = state.facets[f.id];
    const signals = ofFacet(f);
    const outcomes = [];
    if (verdict === 'restore') {
      s.params = floorOf(f);
      apply(f.id, s.params);
      return [{ answer: 'restore' }];
    }
    let runs = score(f, s.params, signals);
    const candidates = [];
    if (verdict === 'reconcile') {
      // The one step that most lowers the owner's dismissals (ties: fewer
      // interruptions, then fewer missed, then spec order).
      let best = null;
      for (const c of neighbours(f, s.params)) {
        const sc = score(f, c, signals);
        const key = [sc.dissonant, sc.interruptions, sc.missed];
        const first = best ? key.findIndex((v, i) => v !== best.key[i]) : -1;
        if (!best || (first >= 0 && key[first] < best.key[first])) best = { c, key };
      }
      if (best) candidates.push([best.c, 'reconcile']);
    } else {
      s.register = String(rule30(s.register));
      for (let g = 0; g < RULE30.lanes; g++) candidates.push([g, 'explore']);
    }
    for (const [c, move] of candidates) {
      const candidate = move === 'explore' ? propose(f, s.params, s.register, c) : c;
      const out = await weigh(f, s, candidate, move, runs, signals, evidence);
      outcomes.push(out);
      if (out.answer === 'adopt' || out.answer === 'recall') {
        s.params = candidate;
        runs = out.scored;
        if (out.answer === 'adopt') s.ledger = [...s.ledger, out.label].slice(-CLAIM.ledger);
        apply(f.id, s.params);
      }
    }
    return outcomes;
  }

  // Measure every facet, ask the holon facet for each, and act on the
  // tunable ones.
  async function tick() {
    const rows = [];
    for (const f of facets) {
      if (f.kind === 'prism') continue;
      const b = bands(f, ofFacet(f));
      let floor = 'held';
      const s = state.facets[f.id];
      if (s) {
        const now = score(f, s.params, ofFacet(f));
        if (dominance(score(f, floorOf(f), ofFacet(f)), now) === 'dominates') floor = 'regressed';
      }
      rows.push({ f, kind: f.kind, floor: f.floor, kpi: b.kpi, request: { halted: halted(), floor, signal: b.signal, tunable: f.tunable.length ? 'yes' : 'no', dissonance: b.dissonance, kpi: b.met } });
    }
    const prism = facets.find((f) => f.kind === 'prism');
    if (prism) {
      const kpi = prismKpi(rows);
      const signal = window.length >= BANDS.minOwnerGestures ? 'owner' : 'self';
      rows.push({ f: prism, kind: 'prism', floor: prism.floor, kpi, request: { halted: halted(), floor: 'held', signal, tunable: 'no', dissonance: 'none', kpi: kpi === null || kpi >= prism.floor ? 'met' : 'missed' } });
    }
    const acted = {};
    for (const row of rows) {
      const verdict = expect(await decide.holon(HOLON.line(row.request)), HOLON.answers);
      state.verdicts[row.f.id] = { verdict, kpi: row.kpi, floor: row.floor };
      if (state.facets[row.f.id] && ['restore', 'reconcile', 'curate'].includes(verdict)) {
        acted[row.f.id] = await act(row.f, verdict, row.request.signal);
      }
    }
    keep.save(state);
    return { verdicts: { ...state.verdicts }, acted };
  }

  async function observe(signal) {
    if (!signal || typeof signal.kappa !== 'string' || typeof signal.gesture !== 'string') return null;
    window.push(signal);
    if (window.length > BANDS.window) window.splice(0, window.length - BANDS.window);
    if (++since < BANDS.every) return null;
    since = 0;
    return tick();
  }

  return {
    observe,
    tick,
    params: (id) => (state.facets[id] ? { ...state.facets[id].params } : undefined),
    ledger: (id) => (state.facets[id] ? [...state.facets[id].ledger] : []),
    scorecard: () => facets.map((f) => ({ id: f.id, floor: f.floor, ...(state.verdicts[f.id] ?? { verdict: null, kpi: null }) })),
  };
}

export function memoryKeep() {
  let held = null;
  return { load: () => (held ? JSON.parse(held) : null), save: (s) => { held = JSON.stringify(s); } };
}

// The observer's state in this browser's local storage (parameters, the
// register and claim labels: no content of the owner's).
export function localKeep(key = 'me.holon') {
  return {
    load: () => { try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; } },
    save: (s) => { try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* a private window: it holds for this page */ } },
  };
}
