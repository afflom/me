// Fingerprint-addressed object store in the Origin Private File System (OPFS).
// Each object's file name is its own fingerprint. Writing re-derives the fingerprint
// and refuses bytes that do not match. Reading re-derives it again (the restore check)
// and refuses, then removes, an object whose bytes changed on disk.
//
// This store holds only public objects (the locked engine and public weights).
// Weights trained on the owner's data are confidential and belong in the W3 vault,
// encrypted; this store refuses them.
import { fingerprint, FINGERPRINT, Refusal } from "./fingerprint.mjs";
import { fetchPieces } from "./pieces.mjs";

const DIRECTORY = "prism-r4-objects";

export function opfsStore() {
  const dir = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(DIRECTORY, { create: true });

  async function put(expected, bytes, { label = "public" } = {}) {
    if (!FINGERPRINT.test(expected)) throw new Refusal("BadFingerprint");
    if (label !== "public") throw new Refusal("NeedsVault", { label });
    const actual = await fingerprint(bytes);
    if (actual !== expected) throw new Refusal("FingerprintMismatch", { expected, actual });
    const handle = await (await dir()).getFileHandle(expected, { create: true });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    return expected;
  }

  // Returns { state: "match", bytes } | { state: "missing" } | { state: "mismatch", actual }
  async function get(expected) {
    if (!FINGERPRINT.test(expected)) throw new Refusal("BadFingerprint");
    let file;
    try {
      file = await (await (await dir()).getFileHandle(expected)).getFile();
    } catch {
      return { state: "missing" };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const actual = await fingerprint(bytes);
    if (actual !== expected) {
      await remove(expected);
      return { state: "mismatch", actual };
    }
    return { state: "match", bytes };
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
// Result: { state: "match", bytes, from: "store" | "network" } | { state: "missing" | "mismatch", reason }
export async function openByFingerprint(store, entry, { base, grant, onRequest } = {}) {
  const held = await store.get(entry.fingerprint);
  if (held.state === "match") return { state: "match", bytes: held.bytes, from: "store" };
  if (held.state === "mismatch") return { state: "mismatch", reason: "TamperedInStore" };
  let bytes;
  try {
    bytes = await fetchPieces(entry, { base, grant, onRequest });
  } catch (error) {
    return { state: error.code === "FingerprintMismatch" || error.code === "PieceTooLarge" || error.code === "PieceCorrupt" ? "mismatch" : "missing", reason: error.code ?? "FetchFailed" };
  }
  try {
    await store.put(entry.fingerprint, bytes, { label: entry.label ?? "public" });
  } catch (error) {
    return { state: error.code === "FingerprintMismatch" ? "mismatch" : "missing", reason: error.code };
  }
  return { state: "match", bytes, from: "network" };
}
