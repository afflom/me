// Google returns here with the token in the fragment. The fragment is sealed
// for the page that asked (seal.mjs), sent, wiped from the address bar and
// history, and this window closes. Nothing is stored.
import { seal } from './seal.mjs';
import { CHANNEL } from './google.mjs';

const fragment = location.hash.slice(1);
history.replaceState(null, '', location.pathname);
const state = new URLSearchParams(fragment).get('state');
const say = (text) => { document.getElementById('status').textContent = text; };
if (!state) {
  say('Nothing to hand back. You can close this window.');
} else {
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(await seal(state, fragment));
  channel.close();
  say('Done. You can close this window.');
  window.close();
}
