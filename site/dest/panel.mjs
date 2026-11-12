// The Destinations section of the page: the owner writes (or keeps what R4
// drafted), the Prism prepares, the owner reads the exact bytes, and only the
// owner's Send hands them to an app they already use. Every step is the
// Boundary's and PrismDest's answer, through the Prism root.
//
//   mountDest(root, { line, halted }) -> { router, pace }
//
// Quiet is the owner's attention: while it is on, what reaches the owner is
// held unless they marked it urgent. It is kept in this browser only.

import { makeRouter } from './dest.mjs';

const PACE_KEY = 'me.pace';
const element = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const readPace = () => { try { return localStorage.getItem(PACE_KEY) === 'quiet' ? 'quiet' : 'open'; } catch { return 'open'; } };
const writePace = (value) => { try { localStorage.setItem(PACE_KEY, value); } catch { /* the page still works */ } };
const SAY = {
  deliver: 'Handed to your app.',
  draft: 'Drafted. Read it below; nothing leaves until you press Send.',
  show: 'Shown.',
  hold: 'Held quietly for you.',
  refuse: 'Refused: this cannot go there.',
};

export function mountDest(root, { line, halted = () => 'no' } = {}) {
  if (typeof line !== 'function') throw new Error('mountDest needs line (the Prism root guest)');
  let paceNow = readPace();
  const pace = () => paceNow;
  const router = makeRouter({ line, halted, pace });

  const target = element('select');
  target.setAttribute('aria-label', 'Destination');
  for (const [value, text] of [['mail', 'Mail'], ['calendar', 'Calendar'], ['platform', 'Share']]) target.append(element('option', { value, textContent: text }));
  const where = element('input', { type: 'text', autocomplete: 'off' });
  const words = element('textarea', { rows: 3, spellcheck: true });
  words.setAttribute('aria-label', 'What to send');
  words.placeholder = 'What to send';
  const prepare = element('button', { type: 'submit', textContent: 'Prepare' });
  const send = element('button', { type: 'button', textContent: 'Send', disabled: true });
  const preview = element('pre', { className: 'me-note' });
  preview.hidden = true;
  const status = element('p', { className: 'me-note', role: 'status' });
  const quiet = element('input', { type: 'checkbox', checked: paceNow === 'quiet' });
  const quietLabel = element('label', { className: 'me-halt' });
  quietLabel.append(quiet, element('span', { textContent: ' Quiet: hold what is not urgent' }));

  const form = element('form', { className: 'me-row' });
  form.append(target, where, words, prepare);
  const row = element('div', { className: 'me-row' });
  row.append(send);
  root.replaceChildren(form, preview, row, status, quietLabel);

  const shape = () => {
    const kind = target.value;
    where.hidden = kind === 'platform';
    where.type = kind === 'calendar' ? 'datetime-local' : 'text';
    where.setAttribute('aria-label', kind === 'calendar' ? 'Starts at' : 'To');
    where.placeholder = kind === 'calendar' ? '' : 'To: address';
    send.disabled = true;
    preview.hidden = true;
  };
  target.addEventListener('change', shape);
  shape();

  // The owner's own input is a cause: what they write is grounded in them.
  const itemOf = () => {
    const text = words.value;
    const subject = text.split('\n')[0].slice(0, 120);
    const kind = target.value;
    if (kind === 'mail') return { target: kind, cause: 'owner', text, payload: { to: where.value, subject, body: text } };
    if (kind === 'calendar') {
      const start = where.value ? new Date(where.value) : new Date(Date.now() + 3600_000);
      return { target: kind, cause: 'owner', text, payload: { uid: `${crypto.randomUUID()}@me`, start, end: new Date(start.getTime() + 3600_000), summary: subject, description: text } };
    }
    return { target: kind, cause: 'owner', text, payload: { title: subject, text } };
  };

  let pending = null;
  for (const input of [where, words]) input.addEventListener('input', () => { send.disabled = true; });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const item = itemOf();
      const decided = await router.prepare(item);
      pending = decided.answer === 'draft' ? { item, seal: decided.seal } : null;
      preview.textContent = decided.out?.bytes ?? '';
      preview.hidden = !decided.out;
      send.disabled = !pending;
      status.textContent = SAY[decided.answer] ?? decided.answer;
    } catch (error) {
      status.textContent = `Stopped: ${error?.message ?? error}`;
    }
  });
  send.addEventListener('click', async () => {
    if (!pending) return;
    send.disabled = true;
    try {
      const done = await router.send(pending.item, pending.seal);
      status.textContent = SAY[done.answer] ?? done.answer;
      if (done.delivered) pending = null;
      else send.disabled = !pending;
    } catch (error) {
      status.textContent = `Stopped: ${error?.message ?? error}`;
    }
  });
  quiet.addEventListener('change', () => {
    paceNow = quiet.checked ? 'quiet' : 'open';
    writePace(paceNow);
  });

  return { router, pace };
}
