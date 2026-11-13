// DV-01..DV-03: the device source and the browser as a host, run in Node against the real PrismFolder guest.
// The device itself is a test double: no disk is read, and every value is synthetic.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openGuest } from '../google/guest.mjs';
import { ingestInto } from '../google/ingest.mjs';
import { GUEST, HOST_GUEST, SOURCE_GUEST, openDevice, formatOf, formatOfText, contactCards, mboxMessages, calendarItems, contactItems, LIMIT } from './device.mjs';
import { HOST, SURFACES, present, lanes, plan } from './host.mjs';

const folder = await openGuest(new Uint8Array(await readFile(new URL(GUEST.path, import.meta.url))), GUEST.sha256);
const hostGuest = await openGuest(new Uint8Array(await readFile(new URL(HOST_GUEST.path, import.meta.url))), HOST_GUEST.sha256);
let checks = 0;
const ok = (cond, message) => { assert.ok(cond, message); checks += 1; };

// A guest whose bytes are not the pinned fingerprint is refused before it compiles.
const tampered = new Uint8Array(await readFile(new URL(GUEST.path, import.meta.url)));
tampered[tampered.length - 1] ^= 1;
await assert.rejects(openGuest(tampered, GUEST.sha256), /guest refused/);
checks += 1;

// DV-01: PrismFolder, every request, against its seven guarantees.
const product = (...lists) => lists.reduce((acc, list) => acc.flatMap((a) => list.map((b) => [...a, b])), [[]]);
let requests = 0;
for (const [grant, format, action, bulk, halted] of product(['none', 'prompt', 'granted', 'revoked'], ['mbox', 'eml', 'maildir', 'ics', 'vcf', 'other'], ['list', 'read', 'write'], ['small', 'large'], ['no', 'yes'])) {
  const answer = await folder(`${grant} ${format} ${action} ${bulk} ${halted}`);
  const why = `${grant} ${format} ${action} ${bulk} ${halted} -> ${answer}`;
  requests += 1;
  ok(['read', 'ask', 'skip', 'refuse'].includes(answer), why);
  if (halted === 'yes') ok(answer === 'refuse', `halted ${why}`);
  if (action === 'write') ok(answer === 'refuse', `never writes ${why}`);
  if (grant === 'revoked') ok(answer === 'refuse', `revoked ${why}`);
  if (grant !== 'granted') ok(answer !== 'read', `no grant, no read ${why}`);
  if (action === 'read' && format === 'other') ok(answer !== 'read', `only standard formats ${why}`);
  if (action === 'read' && bulk === 'large') ok(answer !== 'read', `one bounded read ${why}`);
  if (grant === 'granted' && halted === 'no' && action !== 'write') {
    const expected = action === 'list' ? 'read' : format === 'other' || bulk === 'large' ? 'skip' : 'read';
    ok(answer === expected, `a granted, standard, bounded read is read ${why}`);
  }
}
ok(requests === 288, 'every request is decided');
ok((await folder('granted mbox read small')) === 'invalid', 'a short request is invalid');

// The parsers: the formats Google Takeout, Proton, Apple and Thunderbird write.
ok(formatOf('All mail Including Spam and Trash.mbox') === 'mbox' && formatOf('a.EML') === 'eml' && formatOf('cal.ics') === 'ics' && formatOf('contacts.vcf') === 'vcf', 'formats by name');
ok(formatOf('1700000000.M1P2.host:2,S', 'cur') === 'maildir' && formatOf('.hidden', 'cur') === 'other' && formatOf('notes.txt') === 'other', 'Maildir by its folder, nothing else');
const chunked = (text, size = 7) => (async function* () { const b = new TextEncoder().encode(text); for (let i = 0; i < b.length; i += size) yield b.slice(i, i + size); })();
const MBOX = 'From a@example.com Thu Nov 12 00:00:00 2026\nFrom: a@example.com\nSubject: one\n\nFirst line.\n>From the start.\n\nFrom b@example.org Thu Nov 12 00:00:01 2026\nFrom: b@example.org\nSubject: two\n\nSecond.\n';
const messages = [];
for await (const m of mboxMessages(chunked(MBOX))) messages.push(m);
ok(messages.length === 2 && messages[0].includes('Subject: one') && messages[0].includes('\nFrom the start.') && messages[1].startsWith('From: b@example.org'), `mbox splits and unquotes, streamed: ${JSON.stringify(messages)}`);
const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VTIMEZONE\r\nTZID:Zone/Example\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nUID:e1@example.com\r\nSUMMARY:one\r\nEND:VEVENT\r\nBEGIN:VTODO\r\nUID:t1@example.com\r\nEND:VTODO\r\nEND:VCALENDAR\r\n';
const events = calendarItems(ICS);
ok(events.length === 2 && events.every((e) => e.startsWith('BEGIN:VCALENDAR\r\n') && e.includes('TZID:Zone/Example') && e.endsWith('END:VCALENDAR\r\n')), 'one calendar per event or task, with its zones');
ok(contactItems('BEGIN:VCARD\nFN:A\nEND:VCARD\nBEGIN:VCARD\r\nFN:B\r\nEND:VCARD\r\n').length === 2, 'one item per card');

// DV-02: the device as a source, through a fake folder, the detectors and the vault.
const fileOf = (name, text, lastModified = 1) => {
  const bytes = new TextEncoder().encode(text);
  return { name, size: bytes.length, lastModified, text: async () => text, stream: () => chunked(text, 64) };
};
const dirOf = (name, children, grant = 'granted') => ({
  kind: 'directory', name,
  state: grant,
  async *entries() { for (const c of children) yield [c.name, c]; },
  queryPermission: async function () { return this.state; },
  requestPermission: async function () { this.state = 'granted'; return 'granted'; },
});
const entryOf = (file) => ({ kind: 'file', name: file.name, getFile: async () => file });
const memoryStore = () => {
  const m = new Map();
  return { all: async () => [...m].map(([id, v]) => ({ id, ...v })), put: async (id, v) => { m.set(id, v); }, remove: async (id) => { m.delete(id); } };
};
const kept = [];
const vault = { put: async (bytes, meta) => { kept.push({ bytes, meta }); return { outcome: meta.detector === 'none' ? 'store' : 'storehash' }; } };
const asked = [];
const decide = async (line) => { asked.push(line); return folder(line); };

let stop = 'no';
const store = memoryStore();
const device = openDevice({ decide, ingest: ingestInto({ vault }), store, halted: () => stop, now: () => Date.parse('2026-11-13T00:00:00Z') });
const takeout = dirOf('Takeout', [
  dirOf('Mail', [entryOf(fileOf('All mail.mbox', MBOX))]),
  dirOf('Calendar', [entryOf(fileOf('me.ics', ICS))]),
  dirOf('cur', [entryOf(fileOf('1700000000.M1.host:2,S', 'From: c@example.net\r\nSubject: code\r\n\r\nYour verification code is 123456.\r\n'))]),
  entryOf(fileOf('notes.txt', 'not a source')),
  dirOf('.hidden', [entryOf(fileOf('x.eml', 'From: z@example.com\r\n\r\nhidden\r\n'))]),
]);
let pickedWith = null;
await device.addFolder(async (options) => { pickedWith = options; return takeout; });
ok(pickedWith.mode === 'read', 'the folder is opened read-only');
ok((await device.folders()).length === 1 && (await device.folders())[0].grant === 'granted', 'the granted folder is kept');
const first = await device.readFolders();
ok(first.files === 3 && first.store === 4 && first.storehash === 1, `mail, calendar and Maildir are kept, other files passed over: ${JSON.stringify(first)}`);
ok(kept.every((k) => k.meta.label === 'confidential' && k.meta.identifier === 'yes' && k.meta.pointer.startsWith('/prism/device/')), 'every item is kept confidential, as identifiers that never leave');
ok(kept.some((k) => k.meta.detector === 'credential'), 'a one-time code is detected');
ok(!kept.some((k) => new TextDecoder().decode(k.bytes).includes('hidden')) && !kept.some((k) => new TextDecoder().decode(k.bytes).includes('not a source')), 'hidden folders and other files are never read');
ok(asked.every((l) => !/ write /.test(l)), 'the device never asks to write');
const again = await device.readFolders();
ok(again.files === 0 && kept.length === 5, 'a file already read is passed over');

// The kill switch: nothing is listed or read.
stop = 'yes';
const before = kept.length;
const halted = await device.readFolders();
ok(halted.refuse === 1 && kept.length === before, 'nothing is read while halted');
await assert.rejects(device.addFolder(async () => takeout), (e) => e.code === 'device.halted');
checks += 1;
ok((await device.readFiles([fileOf('a.eml', 'From: a@example.com\r\n\r\nhi\r\n')])).store === 0 && kept.length === before, 'a dropped file is not read while halted');
stop = 'no';

// A lapsed grant asks; only the owner's press allows it again.
takeout.state = 'prompt';
const lapsed = await device.readFolders();
ok(lapsed.ask === 1 && kept.length === before, 'a lapsed grant is asked, never read');
await device.allow();
ok((await device.folders())[0].grant === 'granted', 'the owner allows again');
takeout.state = 'denied';
ok((await device.readFolders()).refuse === 1, 'a revoked grant is refused');

// Picked or dropped files: the act is the grant; other formats and oversize files are passed over.
const huge = { name: 'big.eml', size: LIMIT + 1, lastModified: 1, text: async () => { throw new Error('read'); } };
const dropped = await device.readFiles([fileOf('a.eml', 'From: a@example.com\r\n\r\nhi\r\n'), fileOf('b.vcf', 'BEGIN:VCARD\nFN:B\nEND:VCARD\n'), fileOf('c.pdf', '%PDF'), huge]);
ok(dropped.store === 2 && dropped.skip === 2, `picked files are kept, others passed over: ${JSON.stringify(dropped)}`);

await device.forget((await device.folders())[0].id);
ok((await device.folders()).length === 0, 'forget drops the folder');
await assert.rejects(device.addFolder(undefined), (e) => e.code === 'device.picker');
checks += 1;

// Pasted text and picked contacts: the act is the grant.
ok(formatOfText('From: a@example.com\r\nSubject: hi\r\n\r\nbody\r\n') === 'eml' && formatOfText('BEGIN:VCALENDAR\r\n') === 'ics' && formatOfText('BEGIN:VCARD\r\n') === 'vcf' && formatOfText('From a@example.com Thu\n') === 'mbox', 'pasted text by its first bytes');
ok(formatOfText('Noon at the usual place.') === 'other' && formatOfText('Note: buy milk\n\nlater') === 'other', 'plain prose is not mail');
const pasted = await device.readText('From: a@example.com\r\nSubject: pasted\r\n\r\nhello\r\n');
ok(pasted.store === 1 && new TextDecoder().decode(kept.at(-1).bytes).includes('Subject: pasted'), 'a pasted message is kept');
ok((await device.readText('just words')).skip === 1, 'pasted prose is passed over');
const cards = contactCards([{ name: ['A; B'], email: ['a@example.com'], tel: [] }, { name: [], email: ['c@example.org'] }]);
ok(contactItems(cards).length === 2 && cards.includes('FN:A\\; B') && cards.includes('FN:c@example.org'), 'picked contacts become vCards');
ok((await device.readContacts([{ name: ['A'], email: ['a@example.com'] }])).store === 1, 'picked contacts are kept');

// The host rule: lanes from the cores and memory the browser reports, as uorc states it.
ok(lanes({ hardwareConcurrency: 8, deviceMemory: 8 }) === 8 && lanes({ hardwareConcurrency: 32, deviceMemory: 64 }) === HOST.coreLimit && lanes({ hardwareConcurrency: 8, deviceMemory: 1 }) === 2 && lanes({ hardwareConcurrency: 8 }) === 4 && lanes({}) === 1, 'lanes follow the host rule');
{
  let inFlight = 0, most = 0;
  const slow = { put: async () => { inFlight += 1; most = Math.max(most, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight -= 1; return { outcome: 'store' }; } };
  const wide = openDevice({ decide: folder, ingest: ingestInto({ vault: slow }), store: memoryStore(), lanes: 3 });
  const many = Array.from({ length: 9 }, (_, i) => `BEGIN:VCARD\nFN:P${i}\nEND:VCARD\n`).join('');
  const t = await wide.readFiles([fileOf('many.vcf', many)]);
  ok(t.store === 9 && most === 3, `items are kept on every lane and no more: ${most}`);
}

// DV-03: PrismHost, every request, against its eleven guarantees.
let hostRequests = 0;
for (const [surface, here, act, grant, halted] of product(SURFACES, ['yes', 'no'], ['none', 'owner'], ['none', 'kept'], ['no', 'yes'])) {
  const answer = await hostGuest(`${surface} ${here} ${act} ${grant} ${halted}`);
  const why = `${surface} ${here} ${act} ${grant} ${halted} -> ${answer}`;
  hostRequests += 1;
  ok(['use', 'offer', 'sealed', 'refuse'].includes(answer), why);
  if (halted === 'yes') ok(answer === 'refuse', `halted ${why}`);
  if (surface === 'mail' || surface === 'calendar') ok(answer !== 'use', `sealed ${why}`);
  if (here === 'no') ok(answer !== 'use' && answer !== 'offer', `absent ${why}`);
  if (act === 'none' && ['contacts', 'paste', 'files', 'drop'].includes(surface)) ok(answer !== 'use', `owner's act ${why}`);
  if (act === 'none' && grant === 'none' && (surface === 'folder' || surface === 'extension')) ok(answer !== 'use', `kept grant ${why}`);
  if (surface === 'extension' && grant === 'kept' && here === 'yes' && halted === 'no') ok(answer === 'use', `the installed extension is used ${why}`);
  if (halted === 'no' && here === 'yes' && !['mail', 'calendar'].includes(surface)) ok(answer === 'use' || answer === 'offer', `every reported surface is used or offered ${why}`);
}
ok(hostRequests === 144, 'every host request is decided');
const browser = { showDirectoryPicker() {}, indexedDB: {}, File: function () {}, DataTransfer: function () {}, ClipboardEvent: function () {}, document: {}, Worker: function () {}, navigator: { hardwareConcurrency: 4, contacts: { select() {} }, userAgentData: { mobile: false, brands: [{ brand: 'Google Chrome' }, { brand: 'Chromium' }] } } };
const bare = { navigator: {} };
ok(Object.values(present(browser)).every((v) => v === 'yes') && present(bare).folder === 'no' && present(bare).contacts === 'no' && present(bare).mail === 'yes', 'the surfaces this browser reports');
const visit = await plan({ decide: hostGuest, halted: () => 'no', grant: { folder: 'kept' }, g: browser });
ok(visit.folder === 'use' && visit.workers === 'use' && visit.paste === 'offer' && visit.contacts === 'offer' && visit.mail === 'sealed' && visit.calendar === 'sealed', `a visit: ${JSON.stringify(visit)}`);
const phone = await plan({ decide: hostGuest, halted: () => 'no', act: { contacts: 'owner' }, g: browser });
ok(phone.contacts === 'use' && phone.folder === 'offer', 'the owner\'s press uses the contact picker');
ok((await plan({ decide: hostGuest, halted: () => 'no', g: bare })).folder === 'refuse', 'a browser without the folder picker is never offered it');
ok(Object.values(await plan({ decide: hostGuest, halted: () => 'yes', act: { paste: 'owner' }, grant: { folder: 'kept' }, g: browser })).every((a) => a === 'refuse'), 'halted, every surface is refused');

ok(visit.extension === 'offer' && (await plan({ decide: hostGuest, halted: () => 'no', grant: { extension: 'kept' }, g: browser })).extension === 'use', 'the extension is offered, and used once installed');
ok(present({ document: {}, navigator: { userAgentData: { mobile: true } } }).extension === 'no' && present({ document: {}, navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' } }).extension === 'no', 'a phone is not offered the extension');
ok(present({ document: {}, navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0' } }).extension === 'no' && present({ document: {}, navigator: { userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' } }).extension === 'no', 'Firefox and Safari are not offered the extension');
ok(present({ document: {}, navigator: { userAgentData: { mobile: false, brands: [{ brand: 'Microsoft Edge' }, { brand: 'Chromium' }] } } }).extension === 'yes' && present({ document: {}, navigator: { userAgentData: { mobile: false, brands: [{ brand: 'Other' }] } } }).extension === 'no', 'a Chromium browser is offered it, an undeclared brand is not');

// DV-04: the extension carries the declared services by GET with the owner's own sign-in, and only the Prism page it was written for is answered.
{
  const store = {};
  const listeners = [];
  globalThis.chrome = { storage: { local: { get: async (keys) => Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]])), set: async (v) => Object.assign(store, v) } }, runtime: { onMessage: { addListener: (f) => listeners.push(f) } } };
  const bg = await import('../extension/background.js');
  const { zip, pack, installed, pull: pullFrom } = await import('./extension.mjs');
  const RAW = 'From: a@example.com\r\nTo: b@example.org\r\nSubject: live\r\nDate: Thu, 12 Nov 2026 00:00:00 +0000\r\n\r\nFrom Gmail <itself> & more.\r\n';
  const html = (raw) => `<html><body><pre class="raw_message_text" id="raw_message_text">${raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>`;
  const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:e9@example.com\r\nSUMMARY:live\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
  const calendarZip = zip([{ name: 'calendar.ics', bytes: new TextEncoder().encode(ICS) }, { name: 'notes.txt', bytes: new TextEncoder().encode('x') }]);
  const requests = [];
  const google = async (url, init) => {
    requests.push({ url: String(url), init });
    const u = new URL(url);
    const body = (text, status = 200) => ({ ok: status < 300, status, text: async () => text, arrayBuffer: async () => text.buffer ?? new TextEncoder().encode(text).buffer });
    if (u.pathname.endsWith('/feed/atom')) return body('<feed><entry><link href="https://mail.google.com/mail/u/0/?account_id=x&amp;message_id=18c0ffee00000001&amp;view=conv"/></entry></feed>');
    if (u.searchParams.get('view') === 'om') return body(u.searchParams.get('th') === '18c0ffee00000001' || u.searchParams.get('permmsgid') === `msg-f:${BigInt('0x18c0ffee00000002')}` ? html(RAW) : '<html>nothing</html>');
    if (u.pathname.endsWith('/exporticalzip')) return { ok: true, status: 200, arrayBuffer: async () => calendarZip.buffer };
    return body('', 404);
  };
  const declared = JSON.parse(await readFile(new URL('../extension/services.json', import.meta.url), 'utf8')).services;
  bg.declare(declared);
  const gmail = declared.find((s) => s.key === 'gmail');
  ok((await bg.unzip(calendarZip, '.ics')).length === 1, 'a calendar export unzips to its iCalendar files');
  ok((await bg.item(gmail, gmail.own[0], { id: '18c0ffee00000001', decimal: '', key: '' }, google))[0] === RAW, 'a message original is read from Gmail\'s own page, unescaped');
  ok((await bg.item({ ...gmail, origins: ['https://elsewhere.example/'] }, gmail.own[0], { id: '18c0ffee00000001' }, google)).length === 0, 'a declared URL off its service\'s origins is never fetched');
  await bg.seen('gmail', { ids: ['18c0ffee00000002'], key: 'abcdef0123' });
  ok((await bg.round(google)) === 3, 'a round reads unread and seen mail and the calendars');
  const first = await bg.take({ halted: 'no' });
  ok(first.items.filter((i) => i.format === 'eml' && i.service === 'gmail' && i.route === 'own').length === 2 && first.items.some((i) => i.format === 'ics' && i.service === 'calendar' && i.text === ICS), `the page takes what the round held: ${first.items.length}`);
  ok((await bg.take({ halted: 'no' })).items.length === 0, 'what was taken is not held again');
  ok(requests.every(({ url, init }) => init.method === 'GET' && init.credentials === 'include' && /^https:\/\/(mail|calendar)\.google\.com\//.test(url)), 'only GET, with the owner\'s own sign-in, to the declared origins');
  await bg.round(google);
  ok((await bg.take({ halted: 'no' })).items.filter((i) => i.format === 'eml').length === 0, 'a message already handed over is not read again');
  ok((await bg.take({ halted: 'yes' })).items.length === 0, 'a halted page takes nothing');
  const before = requests.length;
  ok((await bg.round(google)) === 0 && requests.length === before, 'nothing is read while halted, not even on the quarter hour');
  await bg.take({ halted: 'no' });
  // A sign-in page instead of the service's own content: not signed in, and nothing read.
  const signedOut = async (url, init) => ({ ok: true, status: 200, url: 'https://accounts.google.com/signin', text: async () => html(RAW), arrayBuffer: async () => new ArrayBuffer(0) });
  ok((await bg.item(gmail, gmail.own[0], { id: '18c0ffee00000001' }, signedOut)).length === 0, 'a page that left the service\'s origins is never read');
  await bg.round(google);
  const tabs = { list: [{ id: 1, url: 'https://mail.google.com/mail/u/0/#inbox', pinned: false }, { id: 2, url: 'https://news.example/', pinned: true }], query: async () => tabs.list, update: async (id, change) => Object.assign(tabs.list.find((x) => x.id === id), change), create: async (tab) => tabs.list.push({ id: 3, ...tab }) };
  const st = await bg.status(tabs);
  ok(st.services.gmail.open && !st.services.gmail.pinned && st.services.gmail.signedIn && !st.services.discord.open, `status reports each service's tab and sign-in: ${JSON.stringify(st.services.gmail)}`);
  await bg.pin('gmail', tabs);
  await bg.pin('calendar', tabs);
  ok(tabs.list[0].pinned && tabs.list.some((x) => x.url === 'https://calendar.google.com/' && x.pinned && x.active === false) && !tabs.list[1].url.includes('google'), 'keeping a service open pins its own tab, or opens it pinned in the background');
  await bg.take({ halted: 'no' });
  const answer = (url, message) => new Promise((resolve) => { const kept = listeners[0](message, { url }, resolve); if (!kept) resolve('unanswered'); });
  ok((await answer('https://other.example/', { prism: 'pull', halted: 'no' })) === 'unanswered', 'another page is never answered');
  ok((await answer('https://mail.google.com/mail/u/0/', { prism: 'pull', halted: 'no' })) === 'unanswered', 'Gmail itself cannot pull');

  // The page's side: the extension written for this page's own address, the hello and the pull.
  const local = async (url) => ({ ok: true, status: 200, text: async () => readFile(new URL(url), 'utf8') });
  const packed = await pack('https://owner.example/me/', new URL('../extension/', import.meta.url), local);
  const manifest = JSON.parse((await bg.unzip(packed.slice(), 'manifest.json'))[0]);
  ok(manifest.host_permissions.join() === 'https://mail.google.com/*,https://calendar.google.com/*' && manifest.content_scripts[1].matches.join() === 'https://mail.google.com/*', `the extension may reach exactly the declared origins: ${manifest.host_permissions}`);
  const text = new TextDecoder().decode(packed);
  ok(manifest.content_scripts[0].matches.join() === 'https://owner.example/me/*' && text.includes("const PRISM = 'https://owner.example/me/';") && !text.includes('__PRISM__') && !text.includes('__ORIGINS__'), 'the page writes the extension for its own address');
  await assert.rejects(pack('https://owner.example/me', undefined, local), (e) => e.code === 'extension.address');
  checks += 1;
  const win = new EventTarget();
  win.location = { origin: 'https://owner.example' };
  win.postMessage = (data) => queueMicrotask(() => {
    const event = Object.assign(new Event('message'), { data, source: win, origin: win.location.origin });
    win.dispatchEvent(event);
    if (data.from === 'page' && data.prism === 'hello') win.postMessage({ prism: 'extension', from: 'extension', version: 1 });
    if (data.from === 'page' && data.prism === 'pull') win.postMessage({ prism: 'items', from: 'extension', id: data.id, items: [{ format: 'eml', text: RAW }, { format: 'eml', text: 'not mail' }, 7] });
  });
  ok((await installed(win, 50)) === 'kept', 'the installed extension answers the page');
  const silent = new EventTarget();
  silent.location = win.location; silent.postMessage = () => {};
  ok((await installed(silent, 20)) === 'none', 'no extension, no answer');
  const items = await pullFrom(win, { halted: 'no', ms: 200 });
  ok(items.length === 2, 'malformed items are dropped');
  const read = await device.readItems(items);
  ok(read.store === 1 && read.skip === 1, `an item is kept by its own first bytes, never its claim: ${JSON.stringify(read)}`);
  delete globalThis.chrome;
}

// DV-05: PrismSource, every request: a declared service by every route the browser offers, read only.
{
  const source = await openGuest(new Uint8Array(await readFile(new URL(SOURCE_GUEST.path, import.meta.url))), SOURCE_GUEST.sha256);
  let n = 0;
  for (const [service, route, act, halted] of product(['gmail', 'calendar', 'discord', 'whatsapp', 'linkedin', 'other'], ['seen', 'own', 'export'], ['read', 'write'], ['no', 'yes'])) {
    const answer = await source(`${service} ${route} ${act} ${halted}`);
    const why = `${service} ${route} ${act} ${halted} -> ${answer}`;
    n += 1;
    ok(answer === 'read' || answer === 'refuse', why);
    if (halted === 'yes' || act === 'write' || service === 'other') ok(answer === 'refuse', `halted, write or undeclared ${why}`);
    if (route === 'own' && ['discord', 'whatsapp', 'linkedin'].includes(service)) ok(answer === 'refuse', `no private interface ${why}`);
    if (halted === 'no' && act === 'read' && service !== 'other' && !(route === 'own' && ['discord', 'whatsapp', 'linkedin'].includes(service))) ok(answer === 'read', `a declared service is read by every other route ${why}`);
  }
  ok(n === 72, 'every source request is decided');
  // The Connections setting: a state and a next step per service, from the declarations.
  const conn = await import('../source/services.mjs');
  const spec = JSON.parse(await readFile(new URL('../../app/specs/source/services.json', import.meta.url), 'utf8'));
  ok(JSON.stringify(conn.SERVICES) === JSON.stringify(spec.services), 'the page reads exactly the declarations');
  ok(conn.SERVICES.every((s) => s.connect.every((step) => conn.KINDS.includes(step.kind) && step.word.length <= 28 && step.word.split(' ').length <= 4 && step.how.length > 0)), 'every connect step is a declared kind, named in at most four words, with its how');
  ok(conn.state('gmail', { extension: false }).next === 'extension', 'without the extension, the next step is to add it');
  ok(conn.state('gmail', { extension: true, services: { gmail: { signedIn: false } } }).next === 'sign-in', 'then to sign in');
  ok(conn.state('gmail', { extension: true, services: { gmail: { signedIn: true, pinned: false } } }).next === 'pin-tab', 'then to keep it open');
  ok(conn.state('gmail', { extension: true, services: { gmail: { signedIn: true, pinned: true } } }).state === 'live', 'then it is live');
  ok(conn.state('gmail', { extension: true }, { halted: 'yes' }).state === 'paused' && conn.state('nothing', {}).state === 'refused', 'paused while halted; an undeclared service is refused');
  ok(['discord', 'whatsapp', 'linkedin'].every((k) => conn.state(k, { extension: true }).next === 'history' && conn.state(k, { extension: true, imported: { [k]: true } }).state === 'live' && conn.SERVICES.find((s) => s.key === k).out === 'refused'), 'a service no live route carries yet is brought in by its own download, and sends nothing');
  ok(conn.state('gmail', { extension: false }).next === 'extension' && conn.SERVICES.filter((s) => ['discord', 'linkedin'].includes(s.key)).every((s) => s.connect[0].url.startsWith(s.origins[0])), 'a history step opens only a page on its service\'s own origin');
  {
    const opened = [];
    ok(await conn.run('linkedin', 'history', { win: {}, open: (u) => opened.push(u) }) && opened[0] === 'https://www.linkedin.com/mypreferences/d/download-my-data' && !(await conn.run('whatsapp', 'history', { win: {}, open: (u) => opened.push(u) })) && opened.length === 1, 'the history step opens the service\'s own download page, and WhatsApp\'s is on the phone');
  }
  const declared = JSON.parse(await readFile(new URL('../extension/services.json', import.meta.url), 'utf8')).services;
  ok(JSON.stringify(declared) === JSON.stringify(JSON.parse(await readFile(new URL('../../app/specs/source/services.json', import.meta.url), 'utf8')).services), 'the extension carries the model\'s declarations');
  for (const s of declared) {
    for (const route of s.own ?? []) ok((await source(`${s.key} own read no`)) === 'read', `a declared own route is one PrismSource reads: ${s.key}`);
    ok(s.origins.every((o) => /^https:\/\/[a-z.]+\/$/.test(o)), `${s.key} names https origins only`);
  }

  // The export route: each service's own data download, read only as PrismSource answers.
  const { exportItems, whatsappLines, csv } = await import('../source/exports.mjs');
  const { zip } = await import('./extension.mjs');
  const ios = '[13/11/2026, 09:41:05] Robin Example: Lunch on Thursday?\n[13/11/2026, 09:42:10] Sam Example: Yes,\nnoon works\n[13/11/2026, 09:43:00] Messages and calls are end-to-end encrypted.\n';
  const android = '11/13/26, 9:41 PM - Robin Example: See you then\n';
  const w = whatsappLines(ios);
  ok(w.length === 2 && w[0].from === 'Robin Example' && w[0].at.toISOString() === '2026-11-13T09:41:05.000Z' && w[1].body === 'Yes,\nnoon works', 'a WhatsApp chat (iPhone) is read line by line, day first, continuations kept, WhatsApp\'s own lines left out');
  ok(whatsappLines(android)[0].at.toISOString() === '2026-11-13T21:41:00.000Z', 'a WhatsApp chat (Android) is read month first, with its 12-hour clock');
  ok(JSON.stringify(csv('a,"b,""c""\nd"\r\n1,2\n')) === JSON.stringify([['a', 'b,"c"\nd'], ['1', '2']]), 'CSV fields hold commas, quotes and newlines');
  const discordZip = zip([
    { name: 'package/messages/index.json', bytes: new TextEncoder().encode('{"111":"Direct Message with Robin Example"}') },
    { name: 'package/messages/c111/messages.json', bytes: new TextEncoder().encode('[{"ID":1,"Timestamp":"2026-11-12 08:00:00.123000+00:00","Contents":"Draft is ready","Attachments":""}]') },
    { name: 'package/messages/c222/messages.csv', bytes: new TextEncoder().encode('ID,Timestamp,Contents,Attachments\n2,2026-11-12 09:00:00.000000+00:00,"Hello, server",\n') },
  ]);
  const files = [
    fileOf('WhatsApp Chat with Robin Example.txt', ios),
    new File([discordZip], 'package.zip', { lastModified: 1 }),
    fileOf('messages.csv', 'CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT,FOLDER\nc1,Robin Example,Robin Example,,Person,,2026-11-12 10:00:00 UTC,,"Could we talk, next week?",INBOX\n'),
    fileOf('Connections.csv', 'Notes:\n"Some notes LinkedIn adds"\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\nRobin,Example,https://www.linkedin.com/in/example,,Example Co,Designer,12 Nov 2026\n'),
    fileOf('a.eml', 'From: a@example.com\r\nSubject: hi\r\n\r\nhi\r\n'),
  ];
  const { zipEntries } = await import('./zip.mjs');
  const opened = [files[0], ...(await zipEntries(files[1])).map((e) => Object.assign(e, { archive: 'package.zip' })), ...files.slice(2)];
  const { items, rest } = await exportItems(opened);
  const by = (svc) => items.filter((i) => i.service === svc);
  ok(by('whatsapp').length === 2 && by('discord').length === 2 && by('linkedin').length === 2 && rest.length === 1 && rest[0].name === 'a.eml', `each download is claimed by its service, and other files pass through: ${items.map((i) => i.service)}`);
  ok(by('whatsapp').every((i) => i.format === 'eml' && formatOfText(i.text) === 'eml' && /^Subject: Robin Example$/m.test(i.text) && /@whatsapp\.invalid>/.test(i.text)), 'a WhatsApp message is kept as a message, in its chat, at an address that cannot be mailed');
  ok(by('discord').some((i) => /^Subject: Direct Message with Robin Example$/m.test(i.text) && /^Date: Thu, 12 Nov 2026 08:00:00 GMT$/m.test(i.text)) && by('discord').some((i) => /Hello, server/.test(i.text)), 'a Discord message is kept with its channel\'s name and time, from JSON and CSV alike');
  ok(by('linkedin').some((i) => i.format === 'eml' && /Could we talk, next week\?/.test(i.text)) && by('linkedin').some((i) => i.format === 'vcf' && /FN:Robin Example/.test(i.text) && /ORG:Example Co/.test(i.text)), 'a LinkedIn message is kept as a message, a connection as a contact card');
  ok(new Set(by('whatsapp').map((i) => i.text.match(/^Message-ID: (.*)$/m)[1])).size === 2 && (await exportItems([files[0]])).items[0].text === by('whatsapp')[0].text, 'each message has its own id, the same on every read');
  const keptBy = [];
  const vaultBy = { put: async (bytes, meta) => { keptBy.push(meta); return { outcome: 'store' }; } };
  let halt = 'no';
  const heard = {};
  const reader = openDevice({ decide: folder, source: (rest) => source(rest), arrived: (svc, n) => { heard[svc] = (heard[svc] ?? 0) + n; }, ingest: ingestInto({ vault: vaultBy }), store: memoryStore(), halted: () => halt });
  const t = await reader.readFiles(files);
  ok(t.store === 7 && t.refuse === 0, `the downloads are read as PrismSource answers: ${JSON.stringify(t)}`);
  ok(heard.whatsapp === 2 && heard.discord === 2 && heard.linkedin === 2, `the page hears what each service's download brought in: ${JSON.stringify(heard)}`);
  halt = 'yes';
  const before = keptBy.length;
  await reader.readFiles(files);
  ok(keptBy.length === before, 'nothing is read from a download while halted');
  const unasked = openDevice({ decide: folder, ingest: ingestInto({ vault: vaultBy }), store: memoryStore() });
  const u = await unasked.readFiles(files.slice(0, 1));
  ok(u.store === 0 && u.refuse === 2, 'without PrismSource no download is read');
  const inFolder = openDevice({ decide: folder, source: (rest) => source(rest), ingest: ingestInto({ vault: vaultBy }), store: memoryStore() });
  await inFolder.addFolder(async () => dirOf('Downloads', [entryOf(files[0]), entryOf(files[1])]));
  ok((await inFolder.readFolders()).store === 4, 'a download that lands in a kept folder is read on the next visit');
}

console.log(`device: ${checks} checks passed`);
