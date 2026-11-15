// Written by GenBrowser (browserprobe) from browserReaches in app/src/PrismBrowser.lex.tex.
// Each reach is a surface, a way, and a path of members from the global object;
// every member on a path is in the model, pinned to its Web IDL and its Chrome support.

export const SURFACES = ['folder', 'files', 'drop', 'paste', 'contacts', 'workers', 'mail', 'calendar', 'extension'];

const REACHES = [
  ['folder', 0, ['showDirectoryPicker']],
  ['folder', 0, ['indexedDB']],
  ['files', 0, ['File']],
  ['files', 0, ['document']],
  ['drop', 0, ['DataTransfer']],
  ['drop', 0, ['document']],
  ['paste', 0, ['ClipboardEvent']],
  ['paste', 0, ['document']],
  ['contacts', 0, ['navigator', 'contacts', 'select']],
  ['workers', 0, ['Worker']],
  ['workers', 1, ['navigator', 'hardwareConcurrency']],
  ['mail', 0, []],
  ['calendar', 0, []],
  ['extension', 0, ['document']],
  ['extension', 0, ['navigator', 'userAgentData']],
];

const reach = (g, path) => path.reduce((at, step) => at?.[step], g) != null;

// What this browser reports, surface by surface: yes when, for one of a surface's
// ways, every path of that way reaches a value.
export function probed(g = globalThis) {
  const ways = Object.fromEntries(SURFACES.map((surface) => [surface, new Map()]));
  for (const [surface, way, path] of REACHES) ways[surface].set(way, (ways[surface].get(way) ?? true) && reach(g, path));
  return Object.fromEntries(SURFACES.map((surface) => [surface, [...ways[surface].values()].some(Boolean) ? 'yes' : 'no']));
}
