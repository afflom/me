// The two Google decision guests, each the core wasm prismpm builds from a
// proved module (as the standalone app in app/specs/<name>):
//   call: app/src/PrismGoogle.lex.tex      may this one API call be made
//   link: app/src/PrismGoogleLink.lex.tex  the connection's next stage It exports holo_alloc(len) and holo_run(ptr, len) ->
// (outPtr << 32 | outLen), that is dispatch(bytes) -> bytes. Bytes whose
// SHA-256 is not the pinned fingerprint are refused before they compile.

export const GUESTS = {
  call: { path: 'guest/google.wasm', sha256: '01b86213fde2d12f91987fe146acdb1a3e5dd369c0183baa3ef9154baf8fccd9' },
  link: { path: 'guest/link.wasm', sha256: 'cbc94b620342f322445205e1372a2459928e48c9bfb79fa3eebec10988434f23' },
};

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export async function openGuest(bytes, sha256) {
  const got = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  if (got !== sha256) throw Object.assign(new Error(`guest refused: fingerprint ${got} is not ${sha256}`), { code: 'google.guest' });
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

export async function loadGuests(base = new URL('./', import.meta.url)) {
  const entries = await Promise.all(Object.entries(GUESTS).map(async ([name, guest]) => {
    const response = await fetch(new URL(guest.path, base));
    if (!response.ok) throw Object.assign(new Error(`guest ${name}: HTTP ${response.status}`), { code: 'google.guest' });
    return [name, await openGuest(await response.arrayBuffer(), guest.sha256)];
  }));
  return Object.fromEntries(entries);
}
