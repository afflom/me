// The Prism extension. It carries the declared services (services.json, the
// model's app/specs/source/services.json) to the owner's Prism page by the
// routes the browser offers: what each service's web app shows the owner
// (seen.js notes it), and pages the service itself serves the owner, read by
// GET with the owner's own sign-in. It reads on its own every quarter hour and
// holds what it read until the Prism page takes it; the page decides what is
// kept (PrismSource, PrismHost, PrismFolder, the Boundary and the vault). It
// answers only the Prism page it was written for, never writes to a service,
// and reads nothing while the page says halted.
const PRISM = '__PRISM__';
const MOST = 200; // items read in one round
const KEEP = 5000; // ids remembered
const HOLD = 2000; // items held for the page

// Every request: a GET, with the owner's own sign-in in this browser.
const INIT = Object.freeze({ method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'follow' });
const get = (url, init) => fetch(url, init);
const storage = () => chrome.storage.local;
const STATE = { ids: {}, sent: {}, keys: {}, held: [], halted: 'no', live: {}, out: {} };
const load = async () => ({ ...STATE, ...(await storage().get(Object.keys(STATE))) });

let declared = null;
export async function services(fetchImpl = get) {
  if (declared) return declared;
  const response = await fetchImpl(chrome.runtime.getURL('services.json'), { method: 'GET' });
  declared = (await response.json()).services;
  return declared;
}
export const declare = (list) => { declared = list; };

// A declared URL must stay on its service's own origins.
const own = (service, url) => service.origins.some((origin) => url.startsWith(origin));

// A response is the service's own content only if it stayed on the service's
// origins: a sign-in page elsewhere means the owner is not signed in there.
const answered = new Map();
function signedIn(service, response) {
  const stayed = response.ok && (!response.url || own(service, response.url));
  answered.set(service.key, (answered.get(service.key) ?? false) || stayed);
  answered.set(`${service.key}:asked`, true);
  return stayed;
}

// HTML entities in a page the service serves.
const unescape = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|#39|apos);/gi, (_, e) => {
  const k = e.toLowerCase();
  if (k === 'lt') return '<';
  if (k === 'gt') return '>';
  if (k === 'amp') return '&';
  if (k === 'quot') return '"';
  if (k === '#39' || k === 'apos') return "'";
  return String.fromCodePoint(k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
});

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');

export async function unzip(bytes, suffix = '') {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) return [];
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extra + comment;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (!name.toLowerCase().endsWith(suffix)) continue;
    if (method === 0) out.push(new TextDecoder().decode(data));
    else if (method === 8) out.push(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
  }
  return out;
}

// One item by a declared `own` route: the first URL that answers with content.
export async function item(service, route, values, fetchImpl = get) {
  for (const template of route.item.urls) {
    const url = fill(template, values);
    if (template.includes('{key}') && !values.key) continue;
    if (!own(service, url)) continue;
    const response = await fetchImpl(url, INIT);
    if (!signedIn(service, response)) continue;
    if (route.item.unzip) return unzip(new Uint8Array(await response.arrayBuffer()), route.item.unzip);
    const text = await response.text();
    if (!route.item.unwrap) return [text];
    const pre = text.match(new RegExp(`<pre[^>]*id="?${route.item.unwrap}"?[^>]*>([\\s\\S]*?)</pre>`, 'i'));
    if (pre) return [unescape(pre[1])];
  }
  return [];
}

// The ids a declared `own` route lists (its feed), with those seen.js noted.
export async function listed(service, route, noted, fetchImpl = get) {
  const ids = [...noted];
  if (route.list && own(service, route.list.url)) {
    const response = await fetchImpl(route.list.url, INIT);
    if (signedIn(service, response)) for (const m of (await response.text()).matchAll(new RegExp(route.list.id, 'g'))) ids.push(m[1]);
  }
  return [...new Set(ids)];
}

// One round: every declared service by its `own` routes, held for the page.
export async function round(fetchImpl = get) {
  const state = await load();
  if (state.halted !== 'no') return 0;
  let read = 0;
  answered.clear();
  for (const service of await services(fetchImpl)) {
    for (const route of service.own ?? []) {
      const items = [];
      if (route.list || service.seen) {
        const sent = new Set(state.sent[service.key] ?? []);
        const fresh = (await listed(service, route, state.ids[service.key] ?? [], fetchImpl)).filter((id) => !sent.has(id)).slice(0, MOST);
        for (const id of fresh) {
          for (const text of await item(service, route, { id, decimal: BigInt(`0x${id}`).toString(), key: state.keys[service.key] ?? '' }, fetchImpl)) items.push(text);
          sent.add(id);
        }
        state.sent[service.key] = [...sent].slice(-KEEP);
      } else {
        items.push(...(await item(service, route, {}, fetchImpl)));
      }
      for (const text of items) state.held.push({ service: service.key, route: 'own', kind: route.kind, format: route.format, text });
      read += items.length;
    }
  }
  state.held = state.held.slice(-HOLD);
  for (const service of await services(fetchImpl)) {
    if (answered.get(service.key)) state.live[service.key] = Date.now();
    else if (answered.get(`${service.key}:asked`)) state.out[service.key] = Date.now();
  }
  await storage().set({ sent: state.sent, held: state.held, live: state.live, out: state.out });
  return read;
}

// The page takes what is held; a halted page takes nothing and stops the rounds.
export async function take({ halted }) {
  await storage().set({ halted: halted === 'no' ? 'no' : 'yes' });
  if (halted !== 'no') return { items: [] };
  const { held } = await load();
  await storage().set({ held: [] });
  return { items: held };
}

// Each declared service: its tab open and pinned, and when its own pages last
// answered with the owner signed in (or showed a sign-in page instead).
export async function status(tabs = globalThis.chrome?.tabs) {
  const { live, out } = await load();
  const open = tabs ? await tabs.query({}) : [];
  const out2 = {};
  for (const service of await services()) {
    const mine = open.filter((tab) => tab.url && own(service, tab.url));
    out2[service.key] = { open: mine.length > 0, pinned: mine.some((tab) => tab.pinned), signedIn: (live[service.key] ?? 0) > (out[service.key] ?? 0), at: live[service.key] ?? 0 };
  }
  return { services: out2 };
}

// The owner's press on a service's "Keep open" step: its own app, pinned, in the background.
export async function pin(key, tabs = globalThis.chrome?.tabs) {
  const service = (await services()).find((s) => s.key === key);
  if (!service || !tabs) return { pinned: false };
  const open = (await tabs.query({})).find((tab) => tab.url && own(service, tab.url));
  if (open) await tabs.update(open.id, { pinned: true });
  else await tabs.create({ url: service.origins[0], pinned: true, active: false });
  return { pinned: true };
}

// What seen.js noted on a declared service's own tab.
export async function seen(service, { ids = [], key = null }) {
  const state = await load();
  state.ids[service] = [...new Set([...ids, ...(state.ids[service] ?? [])])].slice(0, KEEP);
  if (key) state.keys[service] = key;
  await storage().set({ ids: state.ids, keys: state.keys });
}

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    const from = sender?.url ?? '';
    if (message?.prism === 'pull' && from.startsWith(PRISM)) {
      (async () => { if (message.halted === 'no') await round(); return take(message); })().then(reply, (error) => reply({ items: [], error: String(error?.message ?? error) }));
      return true;
    }
    if (message?.prism === 'status' && from.startsWith(PRISM)) {
      status().then(reply, (error) => reply({ error: String(error?.message ?? error) }));
      return true;
    }
    if (message?.prism === 'pin' && from.startsWith(PRISM)) {
      pin(String(message.service)).then(reply, (error) => reply({ error: String(error?.message ?? error) }));
      return true;
    }
    if (message?.prism === 'seen') {
      services().then((list) => {
        const service = list.find((s) => s.key === message.service && s.origins.some((o) => from.startsWith(o)));
        if (service) seen(service.key, message);
      });
    }
    return false;
  });
  chrome.alarms?.create('prism-round', { periodInMinutes: 15 });
  chrome.alarms?.onAlarm.addListener((alarm) => { if (alarm.name === 'prism-round') round().catch(() => {}); });
}
