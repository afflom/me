// The consent answer crosses from the returning Prism page (relay.mjs) to the
// page that asked, over a BroadcastChannel, which every page on this origin
// can hear. So the answer is sealed with AES-GCM under a key only the page
// that chose the random `state` can derive, and tagged by a digest of it, never by the state itself.

const encoder = new TextEncoder();
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const digest = async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));

export const tagOf = async (state) => hex(await digest(`prism-google tag ${state}`));
const keyOf = async (state, use) => crypto.subtle.importKey('raw', await digest(`prism-google key ${state}`), 'AES-GCM', false, [use]);

export async function seal(state, fragment) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(state, 'encrypt'), encoder.encode(fragment)));
  return { tag: await tagOf(state), iv, sealed };
}

export async function open(state, message) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: message.iv }, await keyOf(state, 'decrypt'), message.sealed);
  return new TextDecoder().decode(plain);
}
