// Written by GenBrowser (r4store) from app/src/PrismR4Store.lex.tex: the store of
// locked objects in the origin private file system. Each object's file name is its
// own fingerprint. This file moves bytes and reports facts; what is written, what a
// held file counts as and what a failure means is the r4-store guest's answer
// (PrismR4Store). Writing re-derives the fingerprint and refuses bytes that do not
// match. Reading re-derives it again and refuses, then removes, an object whose
// bytes changed on disk.
//
// This store holds only public objects (the locked engine and public weights).
// Weights trained on the owner's data are confidential and belong in the vault,
// sealed; this store refuses them.
import { fingerprint, Refusal } from './fingerprint.mjs';
import { fetchPieces } from './pieces.mjs';
import { GUEST, opened } from './guest.mjs';

const DIRECTORY = 'prism-r4-objects';

let guest = null;
const decide = async (line) => (await (guest ??= opened(GUEST)))(line);
// A failure's state: wrong bytes are a mismatch; anything else leaves the object missing.
const stateOf = async (line) => ((await decide(line)) === 'mismatch' ? 'mismatch' : 'missing');

export function opfsStore() {
  const dir = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(DIRECTORY, { create: true });

  async function put(expected, bytes, { label = 'public' } = {}) {
    const actual = await fingerprint(bytes);
    const said = await decide(`put ${expected} ${label} ${actual}`);
    if (said === 'NeedsVault') throw new Refusal(said, { label });
    if (said === 'FingerprintMismatch') throw new Refusal(said, { expected, actual });
    if (said !== 'write') throw new Refusal('BadFingerprint');
    const handle = await (await dir()).getFileHandle(expected, { create: true });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    return expected;
  }

  // Returns { state: 'match', bytes } | { state: 'missing' } | { state: 'mismatch', actual }
  async function get(expected) {
    if ((await decide(`get ${expected} -`)) !== 'missing') throw new Refusal('BadFingerprint');
    let bytes = null;
    try {
      bytes = new Uint8Array(await (await (await (await dir()).getFileHandle(expected)).getFile()).arrayBuffer());
    } catch { /* no such file */ }
    const actual = bytes ? await fingerprint(bytes) : '-';
    const state = await decide(`get ${expected} ${actual}`);
    if (state === 'match') return { state, bytes };
    if (state !== 'mismatch') return { state: 'missing' };
    await remove(expected);
    return { state, actual };
  }

  async function remove(name) {
    try { await (await dir()).removeEntry(name); } catch { /* already gone */ }
  }

  async function list() {
    const names = [];
    for await (const [name] of (await dir()).entries()) names.push(name);
    return names.sort();
  }

  return { put, get, remove, list, directory: DIRECTORY };
}

// Open one locked object by fingerprint: from the store when it is there and intact,
// else as the pieces this page serves (or a mirror the grant admits). Never returns
// bytes that fail the fingerprint.
// Result: { state: 'match', bytes, from: 'store' | 'network' } | { state: 'missing' | 'mismatch', reason }
export async function openByFingerprint(store, entry, { base, grant, onRequest } = {}) {
  const held = await store.get(entry.fingerprint);
  const said = await decide(`held ${held.state}`);
  if (said === 'use') return { state: 'match', bytes: held.bytes, from: 'store' };
  if (said !== 'fetch') return { state: 'mismatch', reason: 'TamperedInStore' };
  let bytes;
  try {
    bytes = await fetchPieces(entry, { base, grant, onRequest });
  } catch (error) {
    return { state: await stateOf(`fetch ${error.code ?? 'FetchFailed'}`), reason: error.code ?? 'FetchFailed' };
  }
  try {
    await store.put(entry.fingerprint, bytes, { label: entry.label ?? 'public' });
  } catch (error) {
    return { state: await stateOf(`keep ${error.code ?? 'failed'}`), reason: error.code };
  }
  return { state: 'match', bytes, from: 'network' };
}
