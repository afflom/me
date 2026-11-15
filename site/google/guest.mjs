// The page decides through the Prism root (panel.mjs). These standalone builds
// of the same two modules let site/google/google.test.mjs run every request
// without the holo. Each is the core wasm prismpm builds from a proved module
// (tools/guests/build.sh; app/specs/guests, GU-01):
//   call: app/src/PrismGoogle.lex.tex      may this one API call be made
//   link: app/src/PrismGoogleLink.lex.tex  the connection's next stage
// It exports holo_alloc(len) and holo_run(ptr, len) -> (outPtr << 32 | outLen),
// that is dispatch(bytes) -> bytes. Bytes whose SHA-256 is not the pinned
// fingerprint are refused before they compile.

export const GUESTS = {
  call: { path: 'guest/google.wasm', sha256: '786318f1de81844b1b4d8870d30b702a11292aa3f49583ade01bfd980d346365' },
  link: { path: 'guest/link.wasm', sha256: '860598541175e25f40f426caadd819d037912bc88b60bb76eeac96e4c9d4b256' },
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
