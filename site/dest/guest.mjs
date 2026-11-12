// A standalone build of PrismDest (app/src/PrismDest.lex.tex) so that
// site/dest/dest.test.mjs can run every request without the holo. The page
// decides through the Prism root's dest facet instead. Built by
// tools/dest/standalone.py (DestApp routes straight to destDispatch); it
// exports holo_alloc(len) and holo_run(ptr, len) -> (outPtr << 32 | outLen),
// that is dispatch(bytes) -> bytes. Bytes whose SHA-256 is not the pinned
// fingerprint are refused before they compile.

export const GUEST = { path: 'guest/dest.wasm', sha256: '3fe53ee183b89679df3dee1c3f8e3d3d9c40c0954fb0c1c17cc87707528c2982' };

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export async function openGuest(bytes, sha256) {
  const got = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  if (got !== sha256) throw Object.assign(new Error(`guest refused: fingerprint ${got} is not ${sha256}`), { code: 'dest.guest' });
  const module = await WebAssembly.compile(bytes);
  // A fresh instance per request: the guest's allocator never frees, and no state carries over.
  return async function decide(line) {
    const { exports: x } = await WebAssembly.instantiate(module, {});
    const input = encoder.encode(line);
    const ptr = x.holo_alloc(input.length);
    new Uint8Array(x.memory.buffer, ptr, input.length).set(input);
    const packed = BigInt.asUintN(64, BigInt(x.holo_run(ptr, input.length)));
    return decoder.decode(new Uint8Array(x.memory.buffer, Number(packed >> 32n), Number(packed & 0xffffffffn)));
  };
}

