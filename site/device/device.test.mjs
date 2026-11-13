// DV-01..DV-03: the device source and the browser as a host, run in Node against the real PrismFolder guest.
// The device itself is a test double: no disk is read, and every value is synthetic.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openGuest } from '../google/guest.mjs';
import { ingestInto } from '../google/ingest.mjs';
import { GUEST, HOST_GUEST, openDevice, formatOf, formatOfText, contactCards, mboxMessages, calendarItems, contactItems, LIMIT } from './device.mjs';
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

// DV-03: PrismHost, every request, against its ten guarantees.
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
  if (act === 'none' && grant === 'none' && surface === 'folder') ok(answer !== 'use', `folder grant ${why}`);
  if (halted === 'no' && here === 'yes' && !['mail', 'calendar'].includes(surface)) ok(answer === 'use' || answer === 'offer', `every reported surface is used or offered ${why}`);
}
ok(hostRequests === 128, 'every host request is decided');
const browser = { showDirectoryPicker() {}, indexedDB: {}, File: function () {}, DataTransfer: function () {}, ClipboardEvent: function () {}, document: {}, Worker: function () {}, navigator: { hardwareConcurrency: 4, contacts: { select() {} } } };
const bare = { navigator: {} };
ok(Object.values(present(browser)).every((v) => v === 'yes') && present(bare).folder === 'no' && present(bare).contacts === 'no' && present(bare).mail === 'yes', 'the surfaces this browser reports');
const visit = await plan({ decide: hostGuest, halted: () => 'no', grant: { folder: 'kept' }, g: browser });
ok(visit.folder === 'use' && visit.workers === 'use' && visit.paste === 'offer' && visit.contacts === 'offer' && visit.mail === 'sealed' && visit.calendar === 'sealed', `a visit: ${JSON.stringify(visit)}`);
const phone = await plan({ decide: hostGuest, halted: () => 'no', act: { contacts: 'owner' }, g: browser });
ok(phone.contacts === 'use' && phone.folder === 'offer', 'the owner\'s press uses the contact picker');
ok((await plan({ decide: hostGuest, halted: () => 'no', g: bare })).folder === 'refuse', 'a browser without the folder picker is never offered it');
ok(Object.values(await plan({ decide: hostGuest, halted: () => 'yes', act: { paste: 'owner' }, grant: { folder: 'kept' }, g: browser })).every((a) => a === 'refuse'), 'halted, every surface is refused');

console.log(`device: ${checks} checks passed`);
