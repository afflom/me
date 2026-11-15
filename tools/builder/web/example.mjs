// An example page: load the holo the pages workflow verified, check its
// digests here, replay its acceptance vectors and answer a request, with the
// same vendored prism-code runtime the app page uses.
import { load } from '../../vendor/prism-code/src/browser.mjs';

const $ = (id) => document.getElementById(id);
const panel = document.querySelector('.verified');
let app = null;

async function ready() {
  app ??= await load(new URL(panel.dataset.holo, location.href).href);
  if (!app.identities.verified) throw new Error('the holo did not verify; nothing runs');
  return app;
}

$('replay').addEventListener('click', async () => {
  $('replayed').textContent = 'Verifying…';
  try {
    const a = await ready();
    const result = await a.acceptance();
    $('replayed').textContent = `Verified ${a.identities.archiveFingerprint.slice(0, 16)}…, ${result.passed} of ${result.total} vectors replayed.`;
  } catch (error) {
    $('replayed').textContent = `Refused: ${error.message}`;
  }
});

$('try').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const a = await ready();
    const out = await a.dispatch(new TextEncoder().encode($('request').value));
    $('answer').textContent = new TextDecoder().decode(out);
  } catch (error) {
    $('answer').textContent = `Refused: ${error.message}`;
  }
});

// A state machine: each step's answer is the next step's state, from the
// initial state, through the same verified guest.
$('run')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = $('run');
  const at = Number(form.dataset.state);
  const trace = $('trace');
  trace.replaceChildren();
  const line = (text) => trace.appendChild(Object.assign(document.createElement('li'), { textContent: text }));
  try {
    const a = await ready();
    let state = form.dataset.initial;
    for (const step of $('steps').value.split('\n').map((s) => s.trim()).filter(Boolean)) {
      const words = step.split(/\s+/);
      words.splice(at, 0, state);
      const answer = new TextDecoder().decode(await a.dispatch(new TextEncoder().encode(words.join(' '))));
      line(`${words.join(' ')} → ${answer}`);
      if (answer === 'invalid') break;
      state = answer;
    }
  } catch (error) {
    line(`Refused: ${error.message}`);
  }
});
