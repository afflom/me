// The decision guests the vault tests run against, and a stand-in for the app's router.
//
// Each guest is the core.wasm built by `prismpm build` from the same LexLean module
// the app compiles (app/src/PrismBoundary, PrismVaultStore, PrismVaultRestore), with
// that module's application record restored so it builds on its own. It exports
// holo_alloc(len) and holo_run(ptr, len) -> (outPtr << 32 | outLen): dispatch(bytes) -> bytes.
// Bytes whose SHA-256 is not the pinned fingerprint are refused before they are compiled.
// See README.md in this folder to rebuild them.

export const GUESTS = {
  boundary: { file: 'boundary.wasm', sha256: '60f51e90d5b45bd3b68b2120bd8799079e687af8146a9933d4374ddacd1a8f62' },
  store: { file: 'vault-store.wasm', sha256: '112bfffd14e2915507ae59f5e84efc21722154e22104987d8faa95e447020067' },
  restore: { file: 'vault-restore.wasm', sha256: '84ed81de6f9b8d941edc4576bd14a059de94721bfcbb7b432d36ebb60e42ba4f' },
};

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const te = new TextEncoder();
const td = new TextDecoder('utf-8', { fatal: true });

export async function openGuest(bytes, sha256) {
  const got = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  if (got !== sha256) throw new Error(`guest refused: fingerprint ${got} is not ${sha256}`);
  const module = await WebAssembly.compile(bytes);
  // A fresh instance per request: the guest's allocator never frees, and no state carries over.
  return async function dispatch(line) {
    const { exports: x } = await WebAssembly.instantiate(module, {});
    const input = te.encode(line);
    const ptr = x.holo_alloc(input.length);
    new Uint8Array(x.memory.buffer, ptr, input.length).set(input);
    const packed = BigInt.asUintN(64, BigInt(x.holo_run(ptr, input.length)));
    const out = new Uint8Array(x.memory.buffer, Number(packed >> 32n), Number(packed & 0xffffffffn));
    return td.decode(out);
  };
}

// read(file) -> ArrayBuffer | Uint8Array. Returns dispatch(line) shaped like the app's router:
// the first word names the facet, the rest is that module's request.
export async function loadRouter(read) {
  const guests = {};
  for (const [facet, g] of Object.entries(GUESTS)) guests[facet] = await openGuest(await read(g.file), g.sha256);
  return async (line) => {
    const space = line.indexOf(' ');
    const guest = space > 0 ? guests[line.slice(0, space)] : undefined;
    return guest ? guest(line.slice(space + 1)) : 'invalid request';
  };
}
