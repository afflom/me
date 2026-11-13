// The browser as a host for the owner's own content: every surface it reports,
// each used only as the proved PrismHost guest answers, through the root:
//   "<surface> <present> <act> <grant> <halted>" -> use | offer | sealed | refuse
// This file reports what the browser exposes; it decides nothing.

// The host rule uorc states for its page (Uorc.Page::pageWorker): one lane per
// core, at most coreLimit, and at most workersPerGiB per GiB the browser
// reports (unreportedGiB when it reports none).
export const HOST = { coreLimit: 16, workersPerGiB: 2, unreportedGiB: 2 };

export const SURFACES = ['folder', 'files', 'drop', 'paste', 'contacts', 'workers', 'mail', 'calendar', 'extension'];

// Whether this browser can run the owner's Prism extension: desktop browsers can.
export function capable(nav = globalThis.navigator) {
  if (nav?.userAgentData && typeof nav.userAgentData.mobile === 'boolean') return !nav.userAgentData.mobile;
  return !/Mobi|Android|iPhone|iPad/i.test(nav?.userAgent ?? '');
}

// What this browser reports, surface by surface, as the guest's `present`.
export function present(g = globalThis) {
  const doc = g.document;
  const yes = (cond) => (cond ? 'yes' : 'no');
  return {
    folder: yes(typeof g.showDirectoryPicker === 'function' && typeof g.indexedDB !== 'undefined'),
    files: yes(typeof g.File === 'function' && !!doc),
    drop: yes(typeof g.DataTransfer === 'function' && !!doc),
    paste: yes(typeof g.ClipboardEvent === 'function' && !!doc),
    contacts: yes(typeof g.navigator?.contacts?.select === 'function'),
    workers: yes(typeof g.Worker === 'function' || (g.navigator?.hardwareConcurrency ?? 0) > 0),
    // A live account on another origin is there for every browser; the guest names it sealed.
    mail: 'yes',
    calendar: 'yes',
    // The owner's Prism extension reads those accounts with the owner's own sign-in.
    extension: yes(!!doc && capable(g.navigator)),
  };
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
