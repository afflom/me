// Google returns the owner's consent to the Prism page itself (platform.json
// `relay`), with the token in the fragment. When this page is that return,
// the fragment is sealed for the page that asked (seal.mjs), sent over the
// channel, wiped from the address bar and history, and the window closes.
// Nothing is stored. Returning to the page rather than a separate file keeps
// the service worker's own rule: the page is the one navigation it caches.
import { seal } from './seal.mjs';
import { CHANNEL } from './google.mjs';

export async function relayConsent(where = globalThis.location) {
  const fragment = (where?.hash ?? '').slice(1);
  const params = new URLSearchParams(fragment);
  const state = params.get('state');
  if (!state || !(params.has('access_token') || params.has('error'))) return false;
  history.replaceState(null, '', where.pathname + where.search);
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(await seal(state, fragment));
  channel.close();
  window.close();
  return true;
}
