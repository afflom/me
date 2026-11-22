// The Prism's objects as UORC archives (UOR-Foundation/compression), named by
// the kappa label of the bytes they restore.
//
// A uorc archive is the object's reference: a lossless, executable structure
// with a UORC-SHA256-CHAIN-v1 seal over itself. Keeping an object compresses
// it, gives the Prism the archive's one frame as the client reads it (inspect,
// without decoding) and the SHA-256 of what it restores to, and asks two
// proved facets: kappa (is this a sound label for these bytes?) and uorc
// (may this structure be kept, or opened?). The uorc facet reads the facts
// itself and sees only structure, never content: the values are projected
// only when it answers open.
//
//   const objects = makeObjects({ client, decide: { kappa, uorc }, halted });
//   await objects.keep(bytes)           -> { outcome: 'keep', archive, kappa } | { outcome: 'refuse' }
//   await objects.open(archive, kappa)  -> { outcome: 'open', bytes } | { outcome: 'refuse' }
//
// `client` returns the pinned uorc client (see loadClient), loaded on first use
// only, so a page that keeps nothing never fetches it.

import { makeKappa } from '../kappa/kappa.mjs';
import { GUEST, opened } from './guest.mjs';

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

export function rootDecide(dispatch) {
  const ask = (facet) => async (line) => String(await dispatch(`${facet} ${line}`)).trim();
  // The reader of an archive's facts is the uorc guest, opened on first use; the decision stays with the root.
  let reader = null;
  return { kappa: ask('kappa'), uorc: ask('uorc'), read: async (line) => (await (reader ??= opened(GUEST)))(line) };
}

// The pinned client: the lock names every byte; bytes that differ are refused before they run.
// The page imports the checked source from a blob: URL, which its Content-Security-Policy allows.
async function blobImport(source) {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try { return await import(url); } finally { URL.revokeObjectURL(url); }
}

export async function loadClient({ base = new URL('./', import.meta.url), fetcher = fetch, importer = blobImport } = {}) {
  const lock = await (await fetcher(new URL('uorc.lock.json', base))).json();
  const bytesOf = async (file) => {
    const bytes = new Uint8Array(await (await fetcher(new URL(file.path, base))).arrayBuffer());
    const got = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
    if (got !== file.sha256 || bytes.length !== file.bytes) {
      throw Object.assign(new Error(`uorc client refused: ${file.path} is ${got}`), { code: 'uorc.client' });
    }
    return bytes;
  };
  const [wasm, js] = [lock.files.find((f) => f.path.endsWith('.wasm')), lock.files.find((f) => f.path.endsWith('.js'))];
  const source = await bytesOf(js);
  const module = await WebAssembly.compile(await bytesOf(wasm));
  const { load } = await importer(source);
  const uorc = await load(module);
  // The basis identities the pinned client writes against travel with it.
  return Object.assign(uorc, { standardBases: lock.standardBases });
}

export function makeObjects({ client, decide, halted = () => 'no' }) {
  if (!decide?.kappa || !decide?.uorc || !decide?.read) throw new Error('makeObjects needs decide.kappa, decide.uorc and decide.read (the guest)');
  const kappa = makeKappa({ decide: decide.kappa });
  let loaded = null;
  const uorcOf = () => (loaded ??= Promise.resolve(client()));

  // The host's facts for one archive: its restore's SHA-256 (within the client's work bound) and its one
  // frame as the client reads it. The Prism classifies the structure and compares the restore itself.
  async function judge(act, uorc, archive, label) {
    let frames = [], bytes = null, restored = 'failed';
    try { const info = uorc.inspect(archive); frames = Array.isArray(info) ? info : []; } catch { frames = []; }
    try { bytes = uorc.decompress(archive); restored = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))); } catch { bytes = null; restored = 'failed'; }
    const f = frames.length === 1 ? frames[0] : {};
    const basis = f.basis === null ? 'none' : (uorc.standardBases ?? []).includes(f.basis) ? 'standard' : 'other';
    const k = (await kappa.admit(label, bytes)).outcome;
    const line = `judge ${act} ${halted()} ${k} ${label.split(':')[1] || '-'} ${restored} ${frames.length} ${f.integrity_ok ?? '-'} ${f.format ?? '-'} ${f.profile ?? '-'} ${f.scope ?? '-'} ${basis} ${f.objects ?? '-'}`;
    return { answer: await decide.uorc(await decide.read(line)), bytes };
  }

  async function keep(value) {
    const uorc = await uorcOf();
    const label = await kappa.labelOf(value);
    let archive;
    try { archive = uorc.compress(value); } catch { return { outcome: 'refuse' }; }
    const { answer } = await judge('keep', uorc, archive, label);
    return answer === 'keep' ? { outcome: 'keep', archive, kappa: label } : { outcome: 'refuse' };
  }

  async function open(archive, label) {
    const uorc = await uorcOf();
    const { answer, bytes } = await judge('open', uorc, archive, label);
    return answer === 'open' ? { outcome: 'open', bytes } : { outcome: 'refuse' };
  }

  return { keep, open };
}
