// A standalone build of PrismHolon and of PrismCurate (app/src) so that
// site/holon/holon.test.mjs can run every request without the holo. The page
// decides through the Prism root's holon and curate facets instead. Built by
// tools/holon/standalone.py (HolonApp and CurateApp route straight to holonDispatch and curateDispatch); it
// exports holo_alloc(len) and holo_run(ptr, len) -> (outPtr << 32 | outLen),
// that is dispatch(bytes) -> bytes. Bytes whose SHA-256 is not the pinned
// fingerprint are refused before they compile.

export const GUESTS = {
  holon: { path: 'guest/holon.wasm', sha256: '25a52c1ba9c4081793123ba1f06fcb4e4f215d240a2ce91bfcfa7aecc5dedeae' },
  curate: { path: 'guest/curate.wasm', sha256: '027acd162a7615fb524a0746c7c8ddaee3dd000d877e23987e01b0762b70d201' },
};

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export async function openGuest(bytes, sha256) {
  const got = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  if (got !== sha256) throw Object.assign(new Error(`guest refused: fingerprint ${got} is not ${sha256}`), { code: 'holon.guest' });
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

