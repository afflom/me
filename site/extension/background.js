// The Prism extension. It reads the owner's own Gmail and Google Calendar with
// the owner's own sign-in in this browser, by GET only, and hands each item to
// the owner's Prism page, which decides what is kept (PrismHost, PrismFolder,
// the Boundary and the vault). It answers only the Prism page it was written
// for, sends nothing anywhere else, and stops when the page says halted.
const PRISM = '__PRISM__';
const MAIL = 'https://mail.google.com/mail/u/0/';
const CALENDAR = 'https://calendar.google.com/calendar/exporticalzip';
const MOST = 200; // messages read in one pull
const KEEP = 5000; // ids remembered

// Every request: a GET, with the owner's own sign-in in this browser.
const INIT = Object.freeze({ method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'follow' });
const get = (url, init) => fetch(url, init);
const storage = () => chrome.storage.local;
const load = async () => ({ ids: [], sent: [], ik: null, ...(await storage().get(['ids', 'sent', 'ik'])) });

// HTML entities in Gmail's "show original" page.
const unescape = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|#39|apos);/gi, (_, e) => {
  const k = e.toLowerCase();
  if (k === 'lt') return '<';
  if (k === 'gt') return '>';
  if (k === 'amp') return '&';
  if (k === 'quot') return '"';
  if (k === '#39' || k === 'apos') return "'";
  return String.fromCodePoint(k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
});

// One message's original, as RFC 5322 text, or null.
export async function original(hex, ik, fetchImpl = get) {
  const urls = [];
  if (ik) urls.push(`${MAIL}?ik=${ik}&view=om&permmsgid=msg-f:${BigInt(`0x${hex}`).toString()}`);
  urls.push(`${MAIL}?view=om&th=${hex}`);
  for (const url of urls) {
    const response = await fetchImpl(url, INIT);
    if (!response.ok) continue;
    const text = await response.text();
    const pre = text.match(/<pre[^>]*id="?raw_message_text"?[^>]*>([\s\S]*?)<\/pre>/i);
    const raw = pre ? unescape(pre[1]) : text;
    if (/^(?:[A-Za-z][A-Za-z0-9-]*:[^\n]*\r?\n)+/.test(raw) && /^(?:from|date|subject|message-id|received|delivered-to):/im.test(raw)) return raw;
  }
  return null;
}

// The ids in Gmail's own feed of unread mail.
export async function unread(fetchImpl = get) {
  const response = await fetchImpl(`${MAIL}feed/atom`, INIT);
  if (!response.ok) return [];
  const text = await response.text();
  return [...text.matchAll(/message_id=([0-9a-f]{12,20})/g)].map((m) => m[1]);
}

// The calendars, from Calendar's own export: a zip of iCalendar files.
export async function calendars(fetchImpl = get) {
  const response = await fetchImpl(CALENDAR, INIT);
  if (!response.ok) return [];
  return unzip(new Uint8Array(await response.arrayBuffer()));
}

export async function unzip(bytes) {
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
    if (!/\.ics$/i.test(name)) continue;
    if (method === 0) out.push(new TextDecoder().decode(data));
    else if (method === 8) out.push(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
  }
  return out;
}

// One pull: the messages not yet handed over, and the calendars.
export async function pull({ halted }, fetchImpl = get) {
  if (halted !== 'no') return { items: [] };
  const state = await load();
  const sent = new Set(state.sent);
  const fresh = [...new Set([...(await unread(fetchImpl)), ...state.ids])].filter((id) => !sent.has(id)).slice(0, MOST);
  const items = [];
  for (const id of fresh) {
    const text = await original(id, state.ik, fetchImpl);
    if (text) items.push({ format: 'eml', text });
    sent.add(id);
  }
  for (const text of await calendars(fetchImpl)) items.push({ format: 'ics', text });
  await storage().set({ sent: [...sent].slice(-KEEP) });
  return { items };
}

async function seen({ ids = [], ik = null }) {
  const state = await load();
  await storage().set({ ids: [...new Set([...ids, ...state.ids])].slice(0, KEEP), ik: ik ?? state.ik });
}

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    const from = sender?.url ?? '';
    if (message?.prism === 'pull' && from.startsWith(PRISM)) {
      pull(message).then(reply, (error) => reply({ items: [], error: String(error?.message ?? error) }));
      return true;
    }
    if (message?.prism === 'seen' && from.startsWith('https://mail.google.com/')) seen(message);
    return false;
  });
}
