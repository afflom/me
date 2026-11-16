// DV-01..DV-03: the device source and the browser as a host, run in Node against the real PrismFolder guest.
// The device itself is a test double: no disk is read. The content it holds is
// the oracle corpus (test/oracle/corpus.json): the published specifications'
// own example messages (RFC 5322, RFC 6047), calendars (RFC 5545, RFC 5546) and
// cards (RFC 6350). Kinds no published specification gives examples of (the
// services' own downloads, card numbers) are listed as gaps in
// app/specs/oracle/spec.json and have no content here. Gmail's own pages are
// stood in for by what its declaration in app/specs/source/services.json says
// of them, holding the corpus's messages.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openGuest } from '../google/guest.mjs';
import { ingestInto } from '../google/ingest.mjs';
import { GUEST, HOST_GUEST, SOURCE_GUEST, openDevice, formatOf, formatOfText, contactCards, mboxMessages, calendarItems, contactItems, LIMIT } from './device.mjs';
import { HOST, SURFACES, present, lanes, plan } from './host.mjs';
import { vcard } from '../read/read.mjs';

const { corpus: ORACLE } = JSON.parse(await readFile(new URL('../../test/oracle/corpus.json', import.meta.url), 'utf8'));
const example = (id) => { const found = ORACLE.find((c) => c.id === id); if (!found) throw new Error(`no oracle example ${id}`); return found.raw; };
const CARDS = ORACLE.filter((c) => c.kind === 'contact').map((c) => c.raw);
// RFC 4155: each message after a separator line naming its sender and date.
const mboxOf = (...ids) => ids.map((id) => {
  const raw = example(id).replace(/\r\n/g, '\n');
  const sender = /^From:.*?<?([^\s<>]+@[^\s<>]+?)>?\s*$/m.exec(raw)?.[1] ?? 'MAILER-DAEMON';
  return `From ${sender} Thu Jan  1 00:00:00 1970\n${raw.replace(/^(>*From )/gm, '>$1')}\n`;
}).join('');
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
const MBOX = mboxOf('rfc5322-1', 'rfc5322-6');
const messages = [];
for await (const m of mboxMessages(chunked(MBOX))) messages.push(m);
ok(messages.length === 2 && messages[0].replace(/\r\n/g, '\n').trim() === example('rfc5322-1').replace(/\r\n/g, '\n').trim() && messages[1].replace(/\r\n/g, '\n').trim() === example('rfc5322-6').replace(/\r\n/g, '\n').trim(), `mbox splits into each message as it was, streamed: ${JSON.stringify(messages)}`);
// RFC 5545's example with its own time zone, and RFC 5546's with two components.
const ICS = example('rfc5545-3');
const zoned = calendarItems(ICS);
const zone = /^TZID:(.*)$/m.exec(ICS)[1];
ok(zoned.length === 1 && zoned[0].startsWith('BEGIN:VCALENDAR\r\n') && zoned[0].includes(`TZID:${zone}`) && zoned[0].endsWith('END:VCALENDAR\r\n'), 'one calendar per event, with its zones');
const two = calendarItems(example('rfc5546-37'));
ok(two.length === 1 && (two[0].match(/^BEGIN:VEVENT\r$/gm) ?? []).length === 2 && /^METHOD:REQUEST\r$/m.test(two[0]) && !/[^\r]\n/.test(two[0]), 'a recurring event and its override are one item, with the calendar\'s own METHOD, in CRLF lines (RFC 5545 3.8.4.4)');
const timed = ORACLE.filter((c) => c.kind === 'calendar');
const rooms = timed.flatMap((c) => calendarItems(c.raw));
ok(timed.length > 40 && timed.every((c) => calendarItems(c.raw).length >= 1) && timed.every((c) => !/^METHOD:/m.test(c.raw) || calendarItems(c.raw).every((e) => e.includes(/^METHOD:[^\r\n]*/m.exec(c.raw)[0]))) && rooms.every((e) => !/[^\r]\n/.test(e) && /^BEGIN:VCALENDAR\r\n/.test(e) && /\r\nEND:VCALENDAR\r\n$/.test(e)), 'every calendar example of RFC 5545 and RFC 5546 with an event, a task or a journal entry splits into items in CRLF lines, free/busy included, each keeping its METHOD');
ok(contactItems(CARDS.slice(0, 2).join(''), vcard).length === 2 && contactItems(CARDS.slice(0, 2).join('').replace(/\r\n/g, '\n'), vcard).length === 2, 'one item per card, CRLF or LF');

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
const device = openDevice({ decide, ingest: ingestInto({ vault }), vcard, store, halted: () => stop, now: () => Date.parse('2026-11-13T00:00:00Z') });
const takeout = dirOf('Takeout', [
  dirOf('Mail', [entryOf(fileOf('All mail.mbox', MBOX))]),
  dirOf('Calendar', [entryOf(fileOf('me.ics', ICS))]),
  dirOf('cur', [entryOf(fileOf('1700000000.M1.host:2,S', example('rfc5322-3')))]),
  entryOf(fileOf('notes.txt', 'not a source')),
  dirOf('.hidden', [entryOf(fileOf('x.eml', example('rfc5322-13')))]),
]);
let pickedWith = null;
await device.addFolder(async (options) => { pickedWith = options; return takeout; });
ok(pickedWith.mode === 'read', 'the folder is opened read-only');
ok((await device.folders()).length === 1 && (await device.folders())[0].grant === 'granted', 'the granted folder is kept');
const first = await device.readFolders();
ok(first.files === 3 && first.store === 4 && first.storehash === 0, `mail, calendar and Maildir are kept, other files passed over: ${JSON.stringify(first)}`);
ok(kept.every((k) => k.meta.label === 'confidential' && k.meta.identifier === 'yes' && k.meta.pointer.startsWith('/prism/device/')), 'every item is kept confidential, as identifiers that never leave');
ok(!kept.some((k) => new TextDecoder().decode(k.bytes) === example('rfc5322-13')) && !kept.some((k) => new TextDecoder().decode(k.bytes).includes('not a source')), 'hidden folders and other files are never read');
ok(asked.every((l) => !/ write /.test(l)), 'the device never asks to write');
const again = await device.readFolders();
ok(again.files === 0 && kept.length === 4, 'a file already read is passed over');

// The kill switch: nothing is listed or read.
stop = 'yes';
const before = kept.length;
const halted = await device.readFolders();
ok(halted.refuse === 1 && kept.length === before, 'nothing is read while halted');
await assert.rejects(device.addFolder(async () => takeout), (e) => e.code === 'device.halted');
checks += 1;
ok((await device.readFiles([fileOf('a.eml', example('rfc5322-2'))])).store === 0 && kept.length === before, 'a dropped file is not read while halted');
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
const dropped = await device.readFiles([fileOf('a.eml', example('rfc5322-2')), fileOf('b.vcf', CARDS[0]), fileOf('c.pdf', '%PDF'), huge]);
ok(dropped.store === 2 && dropped.skip === 2, `picked files are kept, others passed over: ${JSON.stringify(dropped)}`);

await device.forget((await device.folders())[0].id);
ok((await device.folders()).length === 0, 'forget drops the folder');
await assert.rejects(device.addFolder(undefined), (e) => e.code === 'device.picker');
checks += 1;

// Pasted text and picked contacts: the act is the grant.
ok(ORACLE.filter((c) => c.kind === 'message').every((c) => formatOfText(c.raw) === 'eml') && ORACLE.filter((c) => c.kind === 'calendar').every((c) => formatOfText(c.raw) === 'ics') && CARDS.every((c) => formatOfText(c) === 'vcf') && formatOfText(mboxOf('rfc5322-1')) === 'mbox', 'pasted text by its first bytes, for every example of every specification');
ok(formatOfText('Noon at the usual place.') === 'other' && formatOfText('Note: buy milk\n\nlater') === 'other', 'plain prose is not mail');
const pasted = await device.readText(example('rfc5322-7'));
ok(pasted.store === 1 && new TextDecoder().decode(kept.at(-1).bytes).includes('Subject: Re: Saying Hello'), 'a pasted message is kept');
ok((await device.readText('just words')).skip === 1, 'pasted prose is passed over');
// Picked contacts carry the values of RFC 6350's own cards: J. Doe, whose
// structured name (Doe;J.;;;) must be escaped as text, and an address alone.
const doe = ORACLE.find((c) => c.kind === 'contact' && /^N:/m.test(c.raw)).raw;
const doeName = /^N:(.*)\r$/m.exec(doe)[1];
const doeEmail = /^EMAIL[^:]*:(.*)\r$/m.exec(doe)[1];
const lone = /^EMAIL[^:]*:(.*)\r$/m.exec(ORACLE.filter((c) => c.kind === 'contact' && /^EMAIL/m.test(c.raw)).find((c) => !c.raw.includes(doeEmail)).raw)[1];
const cards = contactCards([{ name: [doeName], email: [doeEmail], tel: [] }, { name: [], email: [lone] }], vcard);
ok(contactItems(cards, vcard).length === 2 && cards.includes(`FN:${doeName.replace(/;/g, '\\;')}`) && cards.includes(`FN:${lone}`), 'picked contacts become vCards');
ok((await device.readContacts([{ name: [/^FN[^:]*:(.*)\r$/m.exec(doe)[1]], email: [doeEmail] }])).store === 1, 'picked contacts are kept');
// A value's line break never adds a request line, a contact the guest refuses
// (its request beyond the limit) is passed over, and a card beyond the limit
// (J. Doe's own, its EMAIL line repeated until it is) is still one CRLF card.
const doeLine = /^EMAIL[^\r]*\r\n/m.exec(doe)[0];
ok(!contactCards([{ name: [`${doeName}\nemail ${lone}`], email: [doeEmail] }], vcard).includes(`EMAIL:${lone}`), 'a line break in a picked value adds no property');
ok(contactCards([{ name: [doeName.repeat(600)], email: [doeEmail] }], vcard) === '' && (await device.readContacts([{ name: [doeName.repeat(600)], email: [doeEmail] }])).skip === 1, 'a contact the guest refuses is passed over');
const big = doe.replace(doeLine, doeLine.repeat(Math.ceil(4096 / doeLine.length) + 1));
const bigItems = contactItems(`${big.replace(/\r\n/g, '\n')}trailing words\n${doe}`, vcard);
ok(big.length > 4096 && bigItems.length === 2 && bigItems[0] === big.trimEnd() + '\r\n' && !/[^\r]\n/.test(bigItems[0]), 'a card beyond the guest\'s limit is cut at END:VCARD and kept in CRLF lines');

// The host rule: lanes from the cores and memory the browser reports, as uorc states it.
ok(lanes({ hardwareConcurrency: 8, deviceMemory: 8 }) === 8 && lanes({ hardwareConcurrency: 32, deviceMemory: 64 }) === HOST.coreLimit && lanes({ hardwareConcurrency: 8, deviceMemory: 1 }) === 2 && lanes({ hardwareConcurrency: 8 }) === 4 && lanes({}) === 1, 'lanes follow the host rule');
{
  let inFlight = 0, most = 0;
  const slow = { put: async () => { inFlight += 1; most = Math.max(most, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight -= 1; return { outcome: 'store' }; } };
  const wide = openDevice({ decide: folder, ingest: ingestInto({ vault: slow }), vcard, store: memoryStore(), lanes: 3 });
  const many = CARDS.join('');
  const t = await wide.readFiles([fileOf('many.vcf', many)]);
  ok(CARDS.length > 3 && t.store === CARDS.length && most === 3, `items are kept on every lane and no more: ${most}`);
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
  const { zip, pack, installed, pull: pullFrom, VERSION: VERSION_NOW } = await import('./extension.mjs');
  const RAW = example('rfc5322-1');
  // Gmail's own pages, as its declaration says of them: the original message
  // inside the element the declaration names (own.item.unwrap), HTML-escaped,
  // and the feed's links carrying the id the declaration's pattern takes.
  const gmailOwn = JSON.parse(await readFile(new URL('../../app/specs/source/services.json', import.meta.url), 'utf8')).services.find((s) => s.key === 'gmail').own[0];
  const html = (raw) => `<html><body><pre class="${gmailOwn.item.unwrap}" id="${gmailOwn.item.unwrap}">${raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>`;
  const ICS = example('rfc5545-1');
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
  const declared = JSON.parse(await readFile(new URL('../../app/specs/source/services.json', import.meta.url), 'utf8')).services;
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
  // The Gmail key from Gmail's own app page, when no open tab noted it.
  const appPage = async (url, init) => ({ ok: true, status: 200, url, text: async () => 'x<script>var GLOBALS=[null,null,1,"a","b","c","d","e","f","0123abcd9f",1];</script>' });
  ok((await bg.keyOf(gmail, gmail.own[0], appPage)) === '0123abcd9f' && gmail.own[0].key.url === 'https://mail.google.com/mail/u/0/', 'the key is read from the service\'s own app page by the declared pattern');
  ok((await bg.keyOf(gmail, gmail.own[0], signedOut)) === null, 'a sign-in page gives no key');
  // One service failing leaves the others read, and the failure is reported.
  const broken = async (url, init) => { if (String(url).includes('calendar')) throw new Error('offline'); return google(url, init); };
  await bg.seen('gmail', { ids: ['18c0ffee000000aa'] });
  await bg.round(broken);
  const st2 = await bg.status({ query: async () => [] });
  ok(st2.services.calendar.error === 'offline' && st2.services.calendar.checked > 0 && st2.services.gmail.error === null && st2.services.gmail.read >= 2, `a failing service is reported and the others are still read: ${JSON.stringify(st2.services.calendar)}`);
  await bg.take({ halted: 'no' });
  // A site that challenges (a status its contract names) rests: nothing more is
  // asked of it until its hours pass or its own tab shows content again, and
  // the page shows the owner its contract's step. Nothing is retried around it.
  const { CONTRACTS } = await import('../source/declared.mjs');
  const { state: stateOf } = await import('../source/services.mjs');
  const contracted = declared.map((s) => ({ ...s, backoff: CONTRACTS[s.key].backoff }));
  bg.declare(contracted);
  for (const status of CONTRACTS.calendar.backoff.on) {
    store.rest = {};
    const asked = [];
    const challenging = async (url, init) => { asked.push(String(url)); if (String(url).includes('calendar')) return { ok: false, status, url: String(url), text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }; return google(url, init); };
    await bg.round(challenging);
    const calls = asked.filter((u) => u.includes('calendar')).length;
    await bg.round(challenging);
    const rested = (await bg.status({ query: async () => [] })).services.calendar;
    ok(calls === 1 && asked.filter((u) => u.includes('calendar')).length === 1 && rested.rest > Date.now() + (CONTRACTS.calendar.backoff.hours - 1) * 3600000, `a ${status} rests Calendar for its contract's hours, asked once and not again: ${JSON.stringify(rested)}`);
    const shown = stateOf('calendar', { extension: true, services: { calendar: { ...rested, signedIn: true, pinned: true } } });
    ok(shown.state === 'step' && shown.next === CONTRACTS.calendar.backoff.step, `the owner is shown the contract's step while it rests: ${JSON.stringify(shown)}`);
  }
  ok(stateOf('calendar', { extension: true, services: { calendar: { checked: 1, signedIn: true, pinned: true, rest: 0 } } }).state === 'live', 'a site that is not resting is live');
  store.rest = {};
  await bg.take({ halted: 'no' });
  // What Discord's own tab shows (seen.items): held once each, as its words, and made mail by the page.
  // The items are RFC 5322's own example messages, as a tab would show them: who, when, the conversation, the words.
  const { readItem, useReader } = await import('../card.mjs');
  useReader(await import('../read/read.mjs'));
  const shownOf = (id) => { const m = readItem({ address: id, outcome: 'restore', bytes: new TextEncoder().encode(example(id)), meta: { about: { media: 'message', domain: 4, at: 0 } } }); return { at: new Date(m.at).toISOString(), who: m.who, where: m.title, words: m.body.trim() }; };
  const shownItems = [shownOf('rfc5322-1'), { ...shownOf('rfc5322-2'), at: null }];
  store.rest = { discord: Date.now() + 3600000 };
  await bg.seen('discord', { items: shownItems });
  await bg.seen('discord', { items: shownItems });
  const seenHeld = (await bg.take({ halted: 'no' })).items;
  ok(seenHeld.length === 2 && seenHeld.every((i) => i.service === 'discord' && i.route === 'seen' && i.format === 'seen') && JSON.parse(seenHeld[0].text).words === shownItems[0].words, `each item a tab shows is held once: ${seenHeld.length}`);
  const st3 = (await bg.status({ query: async () => [] })).services.discord;
  ok(st3.rest === 0 && st3.checked > 0 && st3.signedIn, `the owner's tab showing content ends a rest, and the service reads as live: ${JSON.stringify(st3)}`);
  const { seenMessage } = await import('../source/exports.mjs');
  const mail = await seenMessage('discord', seenHeld[0].text);
  const kept = readItem({ address: 'x', outcome: 'restore', bytes: new TextEncoder().encode(mail), meta: { about: { media: 'message', domain: 4, at: 0 } } });
  ok(kept.title === shownItems[0].where && kept.who === shownItems[0].who && kept.at === Date.parse(shownItems[0].at) && kept.body.trim() === shownItems[0].words && formatOfText(mail) === 'eml', `an item the tab showed is kept as mail, reading as it was shown: ${JSON.stringify({ title: kept.title, who: kept.who, at: kept.at })}`);
  ok(Math.abs(Date.parse(/^Date: (.*)$/m.exec(await seenMessage('discord', seenHeld[1].text, Date.UTC(2026, 10, 14)))[1]) - Date.UTC(2026, 10, 14)) < 1000, 'one with no time of its own is as of when it was seen');
  bg.declare(declared);
  // The declarations as data: taken only within the extension's site access, and never widened.
  const allowed = ['https://mail.google.com/*', 'https://calendar.google.com/*'];
  ok(bg.reachable(declared, allowed).map((x) => x.key).join() === 'gmail,calendar' && bg.reachable(declared, ['<all_urls>']).length === 5 && bg.reachable([{ ...gmail, origins: ['http://mail.google.com/'] }], ['<all_urls>']).length === 0, 'the page\'s declarations are taken only for https origins the extension may reach');
  ok(bg.reachable([{ ...gmail, own: [{ ...gmail.own[0], list: { url: 'https://evil.example/feed', id: 'x' } }] }], allowed).length === 0 && bg.reachable('nonsense', allowed).length === 0, 'a declaration with a route off its origins, or not a list, is refused');
  ok((await bg.adopt([{ ...gmail, own: [] }, declared.find((x) => x.key === 'calendar')], allowed)) === 2 && (await bg.services()).find((x) => x.key === 'gmail').own.length === 0, 'the page can change what the extension reads without a new extension');
  const registered = [];
  const scriptingFake = { unregisterContentScripts: async () => {}, registerContentScripts: async (list) => { registered.push(...list); } };
  await bg.adopt(declared, ['<all_urls>'], scriptingFake);
  ok(registered.length === 1 && registered[0].matches.join() === declared.filter((s) => s.seen).flatMap((s) => s.origins.map((o) => `${o}*`)).join() && !registered[0].matches.some((m) => m.includes('linkedin')) && registered[0].js.join() === 'name.js,seen.js', `seen.js, with the accessible-name reader, goes only on the pages of services declared with a seen route: ${JSON.stringify(registered)}`);
  bg.declare([]);
  const quiet = requests.length;
  ok((await bg.round(google)) === 0 && requests.length === quiet, 'a blank extension, not yet told anything by the Prism, reads nothing');
  bg.declare(declared);
  // Tabs open before the extension get its scripts.
  const injected = [];
  const n = await bg.attach({ query: async () => [{ id: 1, url: 'https://owner.example/me/' }, { id: 2, url: 'https://mail.google.com/mail/u/0/' }, { id: 3, url: 'https://news.example/' }] }, { executeScript: async (x) => { injected.push(x); } });
  ok(n === 1 && injected[0].files.join() === 'name.js,seen.js' && injected[0].target.tabId === 2, `a declared service's open tab is given seen.js: ${JSON.stringify(injected)}`);
  await bg.take({ halted: 'no' });
  const answer = (url, message) => new Promise((resolve) => { const kept = listeners[0](message, { url }, resolve); if (!kept) resolve('unanswered'); });
  ok((await answer('https://other.example/', { prism: 'pull', halted: 'no' })) === 'unanswered', 'another page is never answered');
  ok((await answer('https://mail.google.com/mail/u/0/', { prism: 'pull', halted: 'no' })) === 'unanswered', 'Gmail itself cannot pull');

  const text0 = (bytes) => new TextDecoder().decode(bytes);
  // The page's side: the extension written for this page's own address, the hello and the pull.
  const local = async (url) => ({ ok: true, status: 200, text: async () => readFile(new URL(url), 'utf8') });
  const packed = await pack('https://owner.example/me/', new URL('../extension/', import.meta.url), local);
  const manifest = JSON.parse((await bg.unzip(packed.slice(), 'manifest.json'))[0]);
  ok(manifest.host_permissions.join() === '<all_urls>' && manifest.content_scripts.length === 1 && !new TextDecoder().decode(packed).includes('"services"'), 'the extension is a blank carrier: no services of its own, reaching only what the Prism declares');
  ok(manifest.permissions.includes('scripting') && text0(packed).includes(`version: Number('${JSON.parse(await readFile(new URL('../../app/specs/source/services.json', import.meta.url), 'utf8')).extension.version}')`) && !text0(packed).includes('__VERSION__'), 'the extension carries the declared version, and may give already open tabs their scripts');
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
  ok((await installed(win, 50)) === 'old', 'an extension an earlier page wrote answers with its older version');
  const current = new EventTarget();
  current.location = win.location;
  current.postMessage = (data) => queueMicrotask(() => {
    current.dispatchEvent(Object.assign(new Event('message'), { data, source: current, origin: current.location.origin }));
    if (data.from === 'page' && data.prism === 'hello') current.postMessage({ prism: 'extension', from: 'extension', version: VERSION_NOW });
  });
  ok((await installed(current, 50)) === 'kept', 'the installed extension answers the page with the version it writes');
  const silent = new EventTarget();
  silent.location = win.location; silent.postMessage = () => {};
  ok((await installed(silent, 20)) === 'none', 'no extension, no answer');
  const items = await pullFrom(win, { halted: 'no', ms: 200 });
  ok(items.length === 2, 'malformed items are dropped');
  // The reading: a raised reading names the service anew to the extension, and
  // all that comes back is named by the service's own key.
  const { wired, unwired, ask: askOf } = await import('./extension.mjs');
  const { SERVICES: DECLARED } = await import('../source/declared.mjs');
  const gmailDeclared = DECLARED.find((s) => s.key === 'gmail');
  ok(wired(gmailDeclared) === `gmail~${gmailDeclared.reading}` && gmailDeclared.reading > 1 && wired({ key: 'calendar' }) === 'calendar' && unwired('gmail~2') === 'gmail' && unwired('calendar') === 'calendar', 'a raised reading names the service with its reading, and the name comes back to its key');
  const named = new EventTarget();
  named.location = win.location;
  const heard = [];
  named.postMessage = (data) => queueMicrotask(() => {
    named.dispatchEvent(Object.assign(new Event('message'), { data, source: named, origin: named.location.origin }));
    if (data.from !== 'page') return;
    heard.push(data);
    if (data.prism === 'pull') named.postMessage({ prism: 'items', from: 'extension', id: data.id, items: data.services.map((s) => ({ service: s.key, route: 'own', format: 'eml', text: RAW })) });
    if (data.prism === 'status') named.postMessage({ prism: 'answer', from: 'extension', id: data.id, services: { [wired(gmailDeclared)]: { read: 3 }, calendar: { read: 1 } } });
    if (data.prism === 'pin') named.postMessage({ prism: 'answer', from: 'extension', id: data.id, pinned: data.service === wired(gmailDeclared) });
  });
  const back = await pullFrom(named, { halted: 'no', services: DECLARED, ms: 200 });
  ok(heard[0].services.some((s) => s.key === wired(gmailDeclared)) && !heard[0].services.some((s) => s.key === 'gmail'), 'the extension is sent the service by its reading');
  ok(back.length === DECLARED.length && back.every((i) => DECLARED.some((s) => s.key === i.service)), 'items come back by the service key the page reads them under');
  const status = await askOf(named, 'status', {}, 200);
  ok(status.services.gmail?.read === 3 && status.services.calendar?.read === 1 && !status.services[wired(gmailDeclared)], 'the status rows are kept under the service key');
  ok((await askOf(named, 'pin', { service: 'gmail' }, 200))?.pinned === true, 'a pin names the service by its reading');
  const read = await device.readItems(items);
  ok(read.store === 1 && read.skip === 1, `an item is kept by its own first bytes, never its claim: ${JSON.stringify(read)}`);
  delete globalThis.chrome;
}

// DV-05: PrismSource, every request: a declared service by every route the browser offers, read only.
{
  const source = await openGuest(new Uint8Array(await readFile(new URL(SOURCE_GUEST.path, import.meta.url))), SOURCE_GUEST.sha256), SITES = Object.fromEntries(JSON.parse(await readFile(new URL('../../app/specs/source/contracts.json', import.meta.url), 'utf8')).sites.map((c) => [c.service, c]));
  let n = 0;
  for (const [service, route, act, halted] of product(['gmail', 'calendar', 'discord', 'whatsapp', 'linkedin', 'other'], ['seen', 'own', 'export'], ['read', 'write'], ['no', 'yes'])) {
    const answer = await source(`${service} ${route} ${act} ${halted}`);
    const why = `${service} ${route} ${act} ${halted} -> ${answer}`;
    n += 1;
    ok(answer === 'read' || answer === 'refuse', why);
    if (halted === 'yes' || act === 'write' || service === 'other') ok(answer === 'refuse', `halted, write or undeclared ${why}`);
    if (route === 'own' && ['discord', 'whatsapp', 'linkedin'].includes(service)) ok(answer === 'refuse', `no private interface ${why}`);
    // A site whose own terms bar the extension (its contract, app/specs/source/contracts.json) is read from its download only.
    const barred = service !== 'other' && route !== 'export' && SITES[service].terms.some((t) => t.bars.includes('extension')); ok(!barred || answer === 'refuse', `no live route where the site's terms bar the extension ${why}`); if (halted === 'no' && act === 'read' && service !== 'other' && !barred && !(route === 'own' && ['discord', 'whatsapp', 'linkedin'].includes(service))) ok(answer === 'read', `a declared service is read by every other route ${why}`);
  }
  ok(n === 72, 'every source request is decided');
  // The Connections setting: a state and a next step per service, from the declarations.
  const conn = await import('../source/services.mjs');
  const spec = JSON.parse(await readFile(new URL('../../app/specs/source/services.json', import.meta.url), 'utf8'));
  ok(JSON.stringify(conn.SERVICES) === JSON.stringify(spec.services), 'the page reads exactly the declarations');
  ok(conn.SERVICES.every((s) => s.connect.every((step) => conn.KINDS.includes(step.kind) && step.word.length <= 28 && step.word.split(' ').length <= 4 && step.how.length > 0)), 'every connect step is a declared kind, named in at most four words, with its how');
  ok(conn.state('gmail', { extension: false }).next === 'extension', 'without the extension, the next step is to add it');
  ok(conn.state('gmail', { extension: true, services: { gmail: { checked: 1, signedIn: false } } }).next === 'sign-in', 'then to sign in');
  ok(conn.state('gmail', { extension: true, services: { gmail: { checked: 1, signedIn: true, pinned: false } } }).next === 'pin-tab', 'then to keep it open');
  ok(conn.state('gmail', { extension: true, services: { gmail: { checked: 1, signedIn: true, pinned: true } } }).state === 'live', 'then it is live');
  ok(conn.state('gmail', { extension: true, services: {} }).state === 'checking' && conn.state('gmail', { extension: true, services: { gmail: { checked: 1 } } }).state === 'step', 'until the extension has read a service, its row says it is checking, not that the person must sign in');
  ok(conn.howOf(conn.SERVICES[0].connect.find((x) => x.kind === 'extension'), { outdated: true }) === conn.EXTENSION.update && conn.howOf(conn.SERVICES[0].connect.find((x) => x.kind === 'extension'), {}).includes('Load unpacked'), 'an older extension is put in place by the declared update steps; a first one is added');
  ok(conn.state('gmail', { extension: true }, { halted: 'yes' }).state === 'paused' && conn.state('nothing', {}).state === 'refused', 'paused while halted; an undeclared service is refused');
  ok(['linkedin'].every((k) => conn.state(k, { extension: true }).next === 'history' && conn.state(k, { extension: true, imported: { [k]: true } }).state === 'live' && conn.SERVICES.find((s) => s.key === k).out === 'refused'), 'a service no live route carries yet is brought in by its own download, and sends nothing');
  ok(['discord', 'whatsapp'].every((k) => conn.state(k, { extension: true, services: {} }).state === 'checking' && conn.state(k, { extension: true, services: { [k]: { checked: 1 } } }).next === 'sign-in' && conn.state(k, { extension: true, services: { [k]: { checked: 1, signedIn: true, pinned: true } } }).state === 'live' && conn.SERVICES.find((s) => s.key === k).out === 'refused'), 'Discord and WhatsApp are read live from their own open tabs, and send nothing');
  ok(conn.state('gmail', { extension: false }).next === 'extension' && conn.SERVICES.filter((s) => ['discord', 'linkedin'].includes(s.key)).every((s) => s.connect[0].url.startsWith(s.origins[0])), 'a history step opens only a page on its service\'s own origin');
  {
    const opened = [];
    ok(await conn.run('linkedin', 'history', { win: {}, open: (u) => opened.push(u) }) && opened[0] === 'https://www.linkedin.com/mypreferences/d/download-my-data' && !(await conn.run('whatsapp', 'history', { win: {}, open: (u) => opened.push(u) })) && opened.length === 1, 'the history step opens the service\'s own download page, and WhatsApp\'s is on the phone');
  }
  const declared = spec.services;
  for (const s of declared) {
    for (const route of s.own ?? []) ok((await source(`${s.key} own read no`)) === 'read', `a declared own route is one PrismSource reads: ${s.key}`);
    ok(s.origins.every((o) => /^https:\/\/[a-z.]+\/$/.test(o)), `${s.key} names https origins only`);
  }

  // The export route: each service's own data download. No service publishes
  // a definition of its download with examples (the gaps in
  // app/specs/oracle/spec.json), so none is written here; its CSV files follow
  // RFC 4180, which test/oracle/read.test.mjs holds the reader to.
}

console.log(`device: ${checks} checks passed`);
