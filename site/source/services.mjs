// The services the owner connects, as the model declares them
// (app/specs/source/services.json, through tools/source/gen.py), with what the
// Connections setting needs: each service's state and next step, and the act
// behind each step. The page draws one row per service from this module and
// shows nothing else of the machinery.
import { SERVICES, KINDS, STATES } from './declared.mjs';

export { SERVICES, KINDS, STATES };

// What the browser and the extension report now: { extension, services: { key: { open, pinned, signedIn, at } } },
// with imported: { key: true } once a service's own download has been read.
export async function probe(win = globalThis.window) {
  const ext = await import('../device/extension.mjs');
  const extension = (await ext.installed(win)) === 'kept';
  if (!extension) return { extension, services: {} };
  try {
    return { extension, services: (await ext.ask(win, 'status'))?.services ?? {} };
  } catch {
    return { extension, services: {} };
  }
}

// Whether one step of a service is done, by its probe.
export function done(service, step, report) {
  const s = report.services?.[service.key] ?? {};
  if (step.probe === 'extension') return !!report.extension;
  if (step.probe === 'signedIn') return !!s.signedIn;
  if (step.probe === 'pinned') return !!s.pinned;
  if (step.probe === 'open') return !!s.open;
  if (step.probe === 'folder') return !!report.folder;
  if (step.probe === 'imported') return !!report.imported?.[service.key];
  return false;
}

// A service's state for the Connections row: off, step (with its next undone
// step), live, paused (while halted) or refused (a route the model refuses).
//   readable: whether a live route carries it yet; until then its history step
export function state(key, report, { halted = 'no' } = {}) {
  const service = SERVICES.find((s) => s.key === key);
  if (!service) return { state: 'refused', next: null };
  if (halted === 'yes') return { state: 'paused', next: null };
  // A service no live route carries yet is brought in by its own download.
  const readable = !!service.seen || (service.own ?? []).length > 0;
  const steps = readable ? service.connect.filter((step) => step.kind !== 'grant-folder') : service.connect.filter((step) => step.kind === 'grant-folder');
  if (!steps.length) return { state: 'off', next: null };
  const next = steps.find((step) => !done(service, step, report));
  if (next) return { state: 'step', next: next.key };
  return { state: 'live', next: null };
}

// The act behind a step, on the owner's press.
//   pack(prismUrl) -> zip bytes of the extension; save(bytes, name); open(url)
export async function run(key, stepKey, { win = globalThis.window, save, open = (url) => win.open(url, '_blank', 'noopener') } = {}) {
  const service = SERVICES.find((s) => s.key === key);
  const step = service?.connect.find((s) => s.key === stepKey);
  if (!step) return false;
  const ext = await import('../device/extension.mjs');
  if (step.kind === 'extension') {
    const bytes = await ext.pack(new URL('./', win.location.href).href);
    save(bytes, 'prism-extension.zip');
    return true;
  }
  if (step.kind === 'sign-in' || step.kind === 'open-tab') { open(service.origins[0]); return true; }
  if (step.kind === 'pin-tab') return !!(await ext.ask(win, 'pin', { service: key }))?.pinned;
  if (step.kind === 'grant-folder') { if (step.url) open(step.url); return !!step.url; }
  return false;
}
