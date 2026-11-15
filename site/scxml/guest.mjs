// The Prism's statechart interpreter: a standalone build of PrismScxml (app/src),
// SCXML 1.0 (W3C Recommendation, 1 September 2015) Appendix D over the null
// datamodel, with the SCXML Event I/O Processor and inline <invoke> sessions.
// Every impulse the Prism takes in is an SCXML event; each macrostep moves the
// configuration from one state to the next. Built by tools/guests/build.sh from
// the modules the Prism compiles (ScxmlApp routes straight to prismScxmlDispatch;
// app/specs/guests, GU-01); it exports holo_alloc(len) and holo_run(ptr, len) ->
// (outPtr << 32 | outLen), that is run(document) -> the id of the top-level
// <final> state it halts in. Bytes whose SHA-256 is not the pinned fingerprint
// are refused before they compile.

export const GUESTS = {
  scxml: { path: 'guest/scxml.wasm', sha256: '9c56712c97c9779bf629d367c7156978cc7a33ec1cdecefbd0da9af5d529321e' },
};

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const decoder = new TextDecoder('utf-8', { fatal: true });

export async function openScxml(bytes, sha256 = GUESTS.scxml.sha256) {
  const got = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  if (got !== sha256) throw Object.assign(new Error(`guest refused: fingerprint ${got} is not ${sha256}`), { code: 'scxml.guest' });
  const module = await WebAssembly.compile(bytes);
  // A fresh instance per document: the guest's allocator never frees, and no state carries over.
  return async function run(document) {
    const { exports: x } = await WebAssembly.instantiate(module, {});
    const input = typeof document === 'string' ? new TextEncoder().encode(document) : document;
    const ptr = x.holo_alloc(input.length);
    new Uint8Array(x.memory.buffer, ptr, input.length).set(input);
    const packed = BigInt.asUintN(64, BigInt(x.holo_run(ptr, input.length)));
    return decoder.decode(new Uint8Array(x.memory.buffer, Number(packed >> 32n), Number(packed & 0xffffffffn)));
  };
}
