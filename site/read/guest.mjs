// The mail grammar as a LexLean guest: Foundation.Abnf's matcher over the
// rule table tools/standards/grammar.py writes from the pinned RFC texts
// (app/src/PrismGrammarMail.lex.tex). Built by tools/guests/build.sh from the
// modules the Prism compiles (app/specs/guests, GU-01). A request is a rule's
// place among the sorted rule names, a space and the text; the answer is the
// derivation, one "rule,start,stop,depth" per named rule, depth first, in
// UTF-8 octets, or "none". Bytes whose SHA-256 is not the pinned fingerprint
// are refused before they compile.

export const GUESTS = {
  'grammar-mail': { path: 'guest/grammar-mail.wasm', sha256: '0000000000000000000000000000000000000000000000000000000000000000' },
};

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export async function openGuest(bytes, sha256) {
  const got = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  if (got !== sha256) throw Object.assign(new Error(`guest refused: fingerprint ${got} is not ${sha256}`), { code: 'grammar.guest' });
  const module = await WebAssembly.compile(bytes);
  // A fresh instance per request: the guest's allocator never frees, and no state carries over.
  return async function ask(line) {
    const { exports: x } = await WebAssembly.instantiate(module, {});
    const input = encoder.encode(line);
    const ptr = x.holo_alloc(input.length);
    new Uint8Array(x.memory.buffer, ptr, input.length).set(input);
    const packed = BigInt.asUintN(64, BigInt(x.holo_run(ptr, input.length)));
    return decoder.decode(new Uint8Array(x.memory.buffer, Number(packed >> 32n), Number(packed & 0xffffffffn)));
  };
}
