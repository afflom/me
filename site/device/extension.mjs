// The owner's Prism extension, from the page's side: whether it is here, a
// pull of the items it read, and the extension itself, written for this page.
// The page decides what is kept; the extension only reads, by GET.

const FILES = ['manifest.json', 'background.js', 'bridge.js', 'seen.js'];

const send = (win, data) => win.postMessage({ ...data, from: 'page' }, win.location.origin);
const answers = (win, test, ms) => new Promise((resolve) => {
  const done = (value) => { win.removeEventListener('message', on); clearTimeout(timer); resolve(value); };
  const on = (event) => {
    if (event.source !== win || event.origin !== win.location.origin || event.data?.from !== 'extension') return;
    if (test(event.data)) done(event.data);
  };
  const timer = setTimeout(() => done(null), ms);
  win.addEventListener('message', on);
});

import { EXTENSION, SERVICES } from '../source/declared.mjs';

// The extension this page writes (its declared version); one written by an
// earlier page answers with a lower version, and is then put in place again.
export const VERSION = EXTENSION.version;

// 'kept' when the owner's extension answers on this page, 'old' when it is
// one an earlier page wrote, else 'none'.
export async function installed(win = globalThis.window, ms = 400) {
  const answer = answers(win, (d) => d.prism === 'extension', ms);
  send(win, { prism: 'hello' });
  const got = await answer;
  if (!got) return 'none';
  return (got.version ?? 0) >= VERSION ? 'kept' : 'old';
}

// A service is named to the extension with its declared reading (gmail~2), so
// raising the reading has the extension carry all it can reach again, once:
// it keeps what it already carried per name. Everything that comes back is
// named by the service's own key again.
export const wired = (service) => ((service.reading ?? 1) > 1 ? `${service.key}~${service.reading}` : service.key);
export const unwired = (name) => String(name).replace(/~\d+$/, '');
const byKey = (map) => Object.fromEntries(Object.entries(map ?? {}).map(([k, v]) => [unwired(k), v]));

// The items the extension read: [{service, route, format, text}].
// `services` are the page's declarations, carried to the extension as data.
export async function pull(win = globalThis.window, { halted, services, ms = 120000 } = {}) {
  const id = Math.random().toString(36).slice(2);
  const answer = answers(win, (d) => d.prism === 'items' && d.id === id, ms);
  send(win, { prism: 'pull', id, halted, ...(services ? { services: services.map((s) => ({ ...s, key: wired(s) })) } : {}) });
  const got = await answer;
  if (!got) throw Object.assign(new Error('the extension did not answer'), { code: 'extension.silent' });
  if (got.error) throw Object.assign(new Error(got.error), { code: 'extension.error' });
  return Array.isArray(got.items) ? got.items.filter((i) => typeof i?.text === 'string').map((i) => (i.service ? { ...i, service: unwired(i.service) } : i)) : [];
}

// Any other ask of the extension (status, pin): its answer, or null when it is
// not here. A service named in the ask goes by its wired name; the services
// in the answer come back by their own keys.
export async function ask(win = globalThis.window, prism, data = {}, ms = 5000) {
  const id = Math.random().toString(36).slice(2);
  const answer = answers(win, (d) => d.prism === 'answer' && d.id === id, ms);
  const declared = data.service && SERVICES.find((s) => s.key === data.service);
  send(win, { ...data, ...(declared ? { service: wired(declared) } : {}), prism, id });
  const got = await answer;
  if (got?.error) throw Object.assign(new Error(got.error), { code: 'extension.error' });
  return got?.services ? { ...got, services: byKey(got.services) } : got;
}

// CRC-32 (IEEE), for the zip.
const TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// A zip of the given files, stored.
export function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, bytes } of files) {
    const n = enc.encode(name);
    const crc = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(8, 0, true);
    local.setUint32(14, crc, true); local.setUint32(18, bytes.length, true); local.setUint32(22, bytes.length, true); local.setUint16(26, n.length, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true);
    entry.setUint32(16, crc, true); entry.setUint32(20, bytes.length, true); entry.setUint32(24, bytes.length, true); entry.setUint16(28, n.length, true); entry.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), n, bytes);
    central.push(new Uint8Array(entry.buffer), n);
    offset += 30 + n.length + bytes.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

// The extension, written for the Prism page at `prism` (origin and path): the
// Prism's fixed carrier, installed once and blank. It holds no services of its
// own; the page sends the model's declarations as data with every pull, and
// the extension reads only what they declare, by GET, as PrismSource allows.
export async function pack(prism, base = new URL('../extension/', import.meta.url), fetchImpl = globalThis.fetch) {
  if (!/^https:\/\/[^/]+\/(?:[^?#]*\/)?$/.test(prism)) throw Object.assign(new Error('a Prism page address ends in /'), { code: 'extension.address' });
  const texts = {};
  for (const name of FILES) {
    const response = await fetchImpl(new URL(name, base), { cache: 'no-cache' });
    if (!response.ok) throw Object.assign(new Error(`${name}: HTTP ${response.status}`), { code: 'extension.file' });
    texts[name] = (await response.text()).replaceAll('__PRISM__', prism).replaceAll('__VERSION__', String(VERSION));
  }
  return zip(FILES.map((name) => ({ name: `prism-extension/${name}`, bytes: new TextEncoder().encode(texts[name]) })));
}
