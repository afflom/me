// The observer on the page: it sees every answer of the resonance engine,
// asks the root guest's holon and curate facets what to do, names each claim
// through the kappa facet, and hands adopted parameters back to the engine.
// Loaded with the engine, on the owner's first touch, never with the page.
//
//   const observer = await observe({ line, halted, made, place });
//     line(text) -> the root guest's answer; made: makeResonance's object;
//     place() -> the place the owner is in, so each place is its own facet.

import { makeObserver, localKeep } from './holon.mjs';
import { replay, paramsOf } from '../resonance/resonance.mjs';
import { makeKappa, rootDecide } from '../kappa/kappa.mjs';

export async function observe({ line, halted, made, place = () => '' }) {
  const observer = makeObserver({
    decide: {
      holon: (request) => line(`holon ${request}`),
      curate: (request) => line(`curate ${request}`),
    },
    kappa: makeKappa({ decide: rootDecide(line) }),
    replay,
    keep: localKeep('me.holon'),
    halted,
    admissible: (id, params) => {
      if (id !== 'resonance') return false;
      try { paramsOf(params); return true; } catch { return false; }
    },
    apply: (id, params) => {
      if (id !== 'resonance') return;
      try { made.tune(params); } catch { /* refused by the engine: the old values stay */ }
    },
  });
  // What the owner shaped before this visit runs again from the first gesture.
  try { made.tune(observer.params('resonance')); } catch { /* the floor stays */ }
  // One observation at a time, in the order the owner gestured.
  let queue = Promise.resolve();
  made.onResonance((event) => {
    const signal = { ...event, place: place() };
    queue = queue.then(() => observer.observe(signal)).catch(() => {});
  });
  return observer;
}
