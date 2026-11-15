// A standalone build of PrismResonance (app/src/PrismResonance.lex.tex) so that
// site/resonance/resonance.test.mjs can run every request without the holo. The page
// decides through the Prism root's resonance facet instead. Built by
// tools/guests/build.sh from the modules the Prism compiles (ResonanceApp routes straight to
// prismResonanceDispatch; app/specs/guests, GU-01); it
// exports holo_alloc(len) and holo_run(ptr, len) -> (outPtr << 32 | outLen),
// that is dispatch(bytes) -> bytes. Bytes whose SHA-256 is not the pinned
// fingerprint are refused before they compile.

export const GUEST = { path: 'guest/resonance.wasm', sha256: '414b65defa7673ff811e6cf3e5a4da67e51152ace0535f95feebd342a1a2cd64' };

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export async function openGuest(bytes, sha256) {
  const got = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  if (got !== sha256) throw Object.assign(new Error(`guest refused: fingerprint ${got} is not ${sha256}`), { code: 'resonance.guest' });
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

