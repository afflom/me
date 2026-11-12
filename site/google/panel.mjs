// The Google row of the page's Connections section. One row, one source:
// its stage, a Turn on button per service, Read now, and Forget. Every press
// is the owner's act; each move is PrismGoogleLink's answer, each call
// PrismGoogle's, and each item goes through the Boundary and the vault.
//
//   mountGoogle(root, { vault, line, halted })
//
// `line(text)` asks the Prism root guest ("<facet> <rest>"): every Google
// decision goes through the root's google and googlelink facets, one path.
//
// platform.json is the platform's shared OAuth client, inherited, never a
// setting: a Prism names no Google configuration of its own.

import { connectGoogle, popupAuthorize } from './google.mjs';
import { ingestInto } from './ingest.mjs';

const element = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const NAMES = { gmail: 'Gmail', calendar: 'Calendar' };

export async function mountGoogle(root, { vault, line, route = null, halted = () => 'no', base = new URL('./', import.meta.url) } = {}) {
  const platform = await (await fetch(new URL('platform.json', base), { cache: 'no-cache' })).json();
  if (typeof line !== 'function') throw new Error('mountGoogle needs line (the Prism root guest)');
  const guests = { call: (rest) => line(`google ${rest}`), link: (rest) => line(`googlelink ${rest}`) };
  const google = connectGoogle({
    decide: guests.call,
    link: guests.link,
    platform,
    authorize: popupAuthorize({ clientId: platform.clientId, redirectUri: platform.relay }),
    ingest: ingestInto({ vault, route }),
    halted,
  });
  const status = element('p', { className: 'google-status', role: 'status' });
  const say = (text) => { status.textContent = text; };
  const describe = (error) => error?.code ?? error?.message ?? String(error);
  const tally = (t) => `${t.store} kept, ${t.storehash} kept as a hash only, ${t.ask} waiting for you, ${t.refuse} refused`;
  const rows = {};
  const forget = element('button', { type: 'button', textContent: 'Forget Google' });
  root.replaceChildren(element('h3', { textContent: 'Google' }));
  for (const service of Object.keys(NAMES)) {
    const on = element('button', { type: 'button', textContent: `Turn on ${NAMES[service]}` });
    const read = element('button', { type: 'button', textContent: `Read ${NAMES[service]} now` });
    const stage = element('span', { className: 'google-stage' });
    rows[service] = { on, read, stage };
    const block = element('div', { className: 'google-service' });
    block.append(stage, on, read);
    root.append(block);
  }
  root.append(forget, status);

  const paint = () => {
    const s = google.status();
    for (const [service, row] of Object.entries(rows)) {
      row.stage.textContent = `${NAMES[service]}: ${s[service].stage}`;
      row.on.disabled = s[service].stage === 'unprovisioned' || s[service].token === 'fresh';
      row.read.disabled = s[service].token !== 'fresh';
    }
  };
  const busy = async (button, work) => {
    button.disabled = true;
    try { await work(); } catch (error) { say(`Stopped: ${describe(error)}`); } finally { paint(); }
  };
  for (const [service, row] of Object.entries(rows)) {
    row.on.addEventListener('click', () => busy(row.on, async () => {
      await google.grant([service]);
      say(`${NAMES[service]} is on for reading. Nothing is sent or changed.`);
    }));
    row.read.addEventListener('click', () => busy(row.read, async () => {
      const sync = service === 'gmail' ? google.syncMail : google.syncCalendar;
      const t = await sync({ ...platform[service === 'gmail' ? 'mail' : 'calendar'], onProgress: (p) => say(`${NAMES[service]}: ${p.store + p.storehash + p.ask + p.refuse + p.other} of ${p.total}`) });
      say(`${NAMES[service]}: ${tally(t)}.`);
    }));
  }
  forget.addEventListener('click', () => busy(forget, async () => {
    await google.forget();
    say('Google is forgotten in this browser.');
  }));
  await google.ready;
  paint();
  if (!platform.clientId) say('The platform has not published its Google client yet.');
  return google;
}
