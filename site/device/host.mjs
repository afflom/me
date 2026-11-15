// The browser as a host for the owner's own content: every surface it reports,
// each used only as the proved PrismHost guest answers, through the root:
//   "<surface> <present> <act> <grant> <halted>" -> use | offer | sealed | refuse
// This file reports what the browser exposes; it decides nothing.

import { BROWSERS } from '../source/declared.mjs';
import { SURFACES, probed } from './probe.mjs';

export { SURFACES };

// The host rule uorc states for its page (Uorc.Page::pageWorker): one lane per
// core, at most coreLimit, and at most workersPerGiB per GiB the browser
// reports (unreportedGiB when it reports none).
export const HOST = { coreLimit: 16, workersPerGiB: 2, unreportedGiB: 2 };

// Whether this browser can load the owner's Prism extension: a desktop browser
// that reports one of the declared brands (app/specs/source/services.json).
export function capable(nav = globalThis.navigator, browsers = BROWSERS) {
  const data = nav?.userAgentData;
  if (!data || data.mobile !== false || !Array.isArray(data.brands)) return false;
  return data.brands.some((b) => browsers.includes(b?.brand));
}

// What this browser reports, surface by surface, as the guest's `present`: the
// surfaces probe.mjs reaches (written from the browser capability model), and the
// extension only where this browser can load it.
export function present(g = globalThis) {
  const here = probed(g);
  return { ...here, extension: here.extension === 'yes' && capable(g.navigator) ? 'yes' : 'no' };
}

// The lanes the host rule allows on this device.
export function lanes(nav = globalThis.navigator, host = HOST) {
  const cores = nav?.hardwareConcurrency ?? 1;
  const memory = nav?.deviceMemory;
  return Math.max(1, Math.min(cores, host.coreLimit, Math.floor((memory || host.unreportedGiB) * host.workersPerGiB)));
}

// The guest's answer for every surface: { surface: answer }.
//   act:   { surface: 'owner' } for the surface the owner's own press is using now
//   grant: { surface: 'kept' }  for a grant the browser keeps across visits
//                               (a folder's permission, or the installed extension)
export async function plan({ decide, halted, act = {}, grant = {}, g = globalThis }) {
  const here = present(g);
  const out = {};
  for (const surface of SURFACES) out[surface] = await decide(`${surface} ${here[surface]} ${act[surface] ?? 'none'} ${grant[surface] ?? 'none'} ${halted()}`);
  return out;
}
