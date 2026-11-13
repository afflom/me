// The Prism's objects as UORC archives (UOR-Foundation/compression), named by
// the kappa label of the bytes they restore.
//
// A uorc archive is the object's reference: a lossless, executable structure
// with a UORC-SHA256-CHAIN-v1 seal over itself. Keeping an object compresses
// it, reads the archive's structure (inspect: seal, format, scope, object
// count) without decoding, restores it within the client's work bound, names
// the restored bytes by their kappa label, and asks two proved facets: kappa
// (is this a sound label for these bytes?) and uorc (may this structure be
// kept, or opened?). The uorc facet sees only the structure, never the
// content: the values are projected only when it answers open.
//
//   const objects = makeObjects({ client, decide: { kappa, uorc }, halted });
//   await objects.keep(bytes)           -> { outcome: 'keep', archive, kappa } | { outcome: 'refuse' }
//   await objects.open(archive, kappa)  -> { outcome: 'open', bytes } | { outcome: 'refuse' }
//
// `client` returns the pinned uorc client (see loadClient), loaded on first use
// only, so a page that keeps nothing never fetches it.

import { labelOf, makeKappa } from '../kappa/kappa.mjs';

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

export function rootDecide(dispatch) {
  const ask = (facet) => async (line) => String(await dispatch(`${facet} ${line}`)).trim();
  return { kappa: ask('kappa'), uorc: ask('uorc') };
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
  // The basis identity the pinned client writes against travels with it.
  return Object.assign(uorc, { standardBasis: lock.standardBasis });
}

// The archive's structure, read without decoding it.
// basis: the identity of the standard basis the pinned client writes against (the lock's standardBasis).
export function structureOf(uorc, archive, basis) {
  let info;
  try { info = uorc.inspect(archive); } catch { return { seal: 'broken', format: 'other', scope: 'other', objects: 'many' }; }
  const frames = Array.isArray(info) ? info : [];
  const one = frames.length === 1 ? frames[0] : null;
  return {
    seal: frames.length > 0 && frames.every((f) => f.integrity_ok === true) ? 'ok' : 'broken',
    format: frames.length > 0 && frames.every((f) => f.format === 2 && f.profile === 1) ? 'known' : 'other',
    scope: frames.length === 0 ? 'other'
      : frames.every((f) => f.scope === 'self-contained' && f.basis === null) ? 'self'
      : frames.every((f) => f.scope === 'conditional' && typeof basis === 'string' && f.basis === basis) ? 'standard'
      : 'other',
    objects: one && one.objects === 1 ? 'one' : 'many',
  };
}

export function makeObjects({ client, decide, halted = () => 'no' }) {
  if (!decide?.kappa || !decide?.uorc) throw new Error('makeObjects needs decide.kappa and decide.uorc (the guest)');
  const kappa = makeKappa({ decide: decide.kappa });
  let loaded = null;
  const uorcOf = () => (loaded ??= Promise.resolve(client()));

  // Restore the archive within the client's work bound and name what came back.
  async function judge(act, uorc, archive, label) {
    const s = structureOf(uorc, archive, uorc.standardBasis);
    let restore = 'failed', bytes = null;
    try {
      bytes = uorc.decompress(archive);
      restore = (await labelOf(bytes)) === label ? 'same' : 'differs';
    } catch { restore = 'failed'; }
    const k = bytes && restore === 'same' ? (await kappa.admit(label, bytes)).outcome : 'refuse';
    const line = `${act} ${halted()} ${s.seal} ${s.format} ${s.scope} ${s.objects} ${restore} ${k === 'admit' ? 'admit' : 'other'}`;
    return { answer: await decide.uorc(line), bytes };
  }

  async function keep(value) {
    const uorc = await uorcOf();
    const label = await labelOf(value);
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
