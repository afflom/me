// The owner's own device as a source: folders and files the owner grants,
// read in this browser and nowhere else.
//
// A page can read another site's data (Gmail's, say) only through that
// site's consent API, an extension, or the owner's own files. This is the
// third route. The owner grants a folder once in the browser's own picker;
// the handle is kept in this browser (IndexedDB) and the folder is re-read on
// every visit while the browser keeps the grant. Files can also be added one
// by one or dropped. Standard formats only: .mbox, .eml, Maildir, .ics, .vcf,
// as Google Takeout, Proton's export, Apple and Thunderbird write them.
//
// This file moves bytes and reports facts; it decides nothing. Before every
// list and every read it gives the facts to the reader in front of PrismFolder
// (app/src/PrismFolderRead.lex.tex, through `read`), asks the proved PrismFolder
// guest the request the reader states, through `decide`, and acts only on `read`. It never asks to write: the browser's handle is
// opened read-only. Each item goes to `ingest` (google/ingest.mjs): the
// detectors, then vault.put, which makes the Boundary call.

const DB = 'prism-device';
const encoder = new TextEncoder();
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
import { isZip, zipEntries } from './zip.mjs';
import { FORMATS } from './formats.mjs';
import { keyed } from '../records/records.mjs';
export { FORMATS };
import { exportItems, exportKind } from '../source/exports.mjs';
import { mboxSeparator, headerLines, readField } from '../read/mail.mjs';
import { lines, parts } from '../time/recur.mjs';

const sha256 = async (bytes) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
const fail = (code, message) => Object.assign(new Error(message ?? code), { code });

// The format of a file, from its name and the folder it sits in: an extension
// a media type's registration states (formats.mjs, written from
// app/src/PrismDevice.lex.tex), a message file, or a Maildir message.
export function formatOf(name, parent = '') {
  const lower = name.toLowerCase();
  const stated = FORMATS.find(([extension]) => lower.endsWith(`.${extension}`))?.[1] ?? (lower.endsWith('.eml') ? 'eml' : null);
  return stated ?? ((parent === 'cur' || parent === 'new') && !lower.startsWith('.') ? 'maildir' : 'other');
}

const MEDIA = { ...Object.fromEntries(FORMATS.map(([, format, media]) => [format, media])), eml: 'message', maildir: 'message' };
const TYPE = Object.fromEntries(FORMATS.map(([, , media, type]) => [media, type]));

// mbox (RFC 4155): each message begins at a separator line, read by its
// grammar (site/read/mail.mjs), at the start or after the empty line that ends
// the message before; mboxrd's ">From " quoting is undone (RFC 4155 2).
// Streamed, so a large export is read in pieces.
export async function* mboxMessages(chunks) {
  const decoder = new TextDecoder();
  let carry = '';
  let message = null;
  const finish = function* () {
    if (message !== null) yield message.replace(/^>(>*From )/gm, '$1');
  };
  for await (const chunk of chunks) {
    carry += decoder.decode(chunk, { stream: true });
    const lines = carry.split('\n');
    carry = lines.pop();
    for (const line of lines) {
      if (mboxSeparator(line) && (message === null || /\r?\n\r?\n$/.test(message) || message === '')) {
        yield* finish();
        message = '';
      } else if (message !== null) {
        message += line + '\n';
      }
    }
  }
  carry += decoder.decode();
  if (carry && message !== null) message += carry;
  yield* finish();
}

// iCalendar: one item per event, task, journal entry or free/busy (VEVENT,
// VTODO, VJOURNAL, VFREEBUSY), each with the calendar's time zones.
export function calendarItems(text) {
  // RFC 5545: lines end in CRLF; a calendar's own properties (VERSION, PRODID,
  // METHOD, CALSCALE) and its time zones go with each item; the components
  // that share a UID are one item, a recurring event with its overrides
  // (section 3.8.4.4).
  const all = parts(text);
  const own = all.filter((p) => /^(VERSION|PRODID|METHOD|CALSCALE)[;:]/i.test(p.kind ? '' : p.text)).map((p) => p.text);
  const head = [...(own.some((l) => /^VERSION[;:]/i.test(l)) ? [] : ['VERSION:2.0']), ...(own.some((l) => /^PRODID[;:]/i.test(l)) ? [] : ['PRODID:-//prism//device//EN']), ...own];
  const zones = all.filter((p) => p.kind === 'VTIMEZONE').map((p) => p.text);
  const byUid = new Map();
  all.filter((p) => /^V(EVENT|TODO|JOURNAL|FREEBUSY)$/.test(p.kind)).forEach((part, i) => {
    const uid = lines(part.text, 'UID')[0]?.[1] || `#${i}`;
    byUid.set(uid, [...(byUid.get(uid) ?? []), part.text.trimEnd()]);
  });
  return [...byUid.values()].map((group) => ['BEGIN:VCALENDAR', ...head, ...zones.map((z) => z.trimEnd()), ...group, 'END:VCALENDAR', ''].join('\r\n'));
}

// The format of pasted or picked text, from its first bytes.
export function formatOfText(text) {
  const head = text.trimStart().slice(0, 4096);
  if (/^BEGIN:VCALENDAR/i.test(head)) return 'ics';
  if (/^BEGIN:VCARD/i.test(head)) return 'vcf';
  // Mail by its grammar (site/read/mail.mjs): an mbox by RFC 4155's separator
  // line; a message by a header section, closed by its empty line, whose every
  // line is a field and one of them a field RFC 5322 3.6 or RFC 2045 names.
  if (mboxSeparator(head.split('\n', 1)[0])) return 'mbox';
  const fields = /\r?\n\r?\n/.test(head) ? headerLines(head).map(readField) : [];
  return fields.every(Boolean) && fields.some((f) => f.rule && !/optional/.test(f.rule)) ? 'eml' : 'other';
}

// The contact picker's answer, as vCards: one the vcard guest writes per
// contact (app/src/PrismVcard.lex.tex "write": FN, else the first email or
// tel). A value's line breaks become spaces, since a request is read by its
// lines; a contact the guest refuses writes nothing.
export function contactCards(contacts, vcard) {
  const flat = (s) => String(s).replace(/[\r\n]+/g, ' ');
  return contacts.map((c) => vcard(['write', flat(c.name?.[0] ?? ''), ...(c.email ?? []).map((e) => `email ${flat(e)}`), ...(c.tel ?? []).map((n) => `tel ${flat(n)}`)].join('\n'))).filter((card) => card !== 'invalid').join('');
}

// vCard: one item per card, as the vcard guest unfolds it ("cards"), asked a
// card at a time to stay within its request limit. A card beyond the limit
// (one carrying a photo, say) is cut at its END:VCARD and kept folded as
// written, in CRLF lines.
export function contactItems(text, vcard) {
  return text.split(/(?=^BEGIN:VCARD)/im).flatMap((piece) => {
    const cards = vcard(`cards\n${piece}`);
    if (cards !== 'invalid') return cards.split('\0').filter(Boolean);
    return (piece.replace(/\r?\n/g, '\n').match(/^BEGIN:VCARD\n[\s\S]*?\nEND:VCARD$/im) ?? []).map((card) => card.replace(/\n/g, '\r\n') + '\r\n');
  });
}

// The browser's word for a handle's permission; the reader gives PrismFolder's `grant` for it.
const stateOf = async (handle) => (!handle ? 'none' : typeof handle.queryPermission !== 'function' ? 'plain' : handle.queryPermission({ mode: 'read' }));
let reader = null;
const guestRead = async (text) => (await (reader ??= import('./guest.mjs').then((m) => m.opened(m.GUESTS.folder))))(text);

// The handles the owner granted, kept in this browser.
export function handleStore(indexed = globalThis.indexedDB) {
  const folders = keyed(DB, 'folders', indexed);
  return { all: async () => (await folders.all()).map(([id, value]) => ({ id, ...value })), put: folders.put, remove: folders.remove };
}

// openDevice: the device as a source.
//   decide(line) -> 'read' | 'ask' | 'skip' | 'refuse'   (PrismFolder, through the root)
//   read(line)                                           (PrismFolderRead: the folder guest, opened on first use)
//   ingest({envelope, frame, bytes}) -> outcome          (google/ingest.mjs ingestInto)
//   vcard(request) -> answer                             (the vcard guest, read/read.mjs)
//   store                                                (handleStore)
//   halted() -> 'no' | 'yes'
//   lanes                                                (host.mjs lanes: the host rule)
// `source` is PrismSource's answer for "<service> <route> <act>" (with the
// halted word appended here); without it no service's download is read.
// `arrived(service, kept)` hears how many items of a service's download were kept.
export function openDevice({ decide, read = guestRead, ingest, vcard, source = async () => 'refuse', arrived = () => {}, store = handleStore(), halted = () => 'no', now = () => Date.now(), lanes = 1 }) {
  if (typeof decide !== 'function') throw fail('device.decide', 'openDevice needs decide (the PrismFolder guest)');
  if (typeof ingest !== 'function') throw fail('device.ingest', 'openDevice needs ingest');
  if (typeof vcard !== 'function') throw fail('device.vcard', 'openDevice needs vcard (the vcard guest, site/read/read.mjs)');
  // What a folder, a file or an item adds to the tally: `read` (a file: `files`) is the go-ahead.
  const ask = async (stage, facts) => read(`count ${stage} ${await decide(await read(`${facts} ${halted()}`))}`);

  // Items are kept on as many lanes as the host rule allows.
  const running = new Set();
  const failures = [];
  async function lane(work) {
    while (running.size >= Math.max(1, lanes)) await Promise.race(running);
    const job = work().catch((error) => { failures.push(error); }).finally(() => running.delete(job));
    running.add(job);
  }
  async function drained() {
    await Promise.all(running);
    if (failures.length) throw failures.splice(0)[0];
  }

  async function keep(format, text, tally) {
    const media = MEDIA[format];
    const bytes = encoder.encode(text);
    if (!bytes.length) return;
    const said = await ask('item', `item ${format} ${bytes.length}`);
    if (said !== 'read') { tally[said] += 1; return; }
    const digest = await sha256(bytes);
    const envelope = { source: 'file', media, size: bytes.length, digest };
    const frame = {
      specversion: '1.0',
      id: digest,
      source: `/prism/device/${format}`,
      type: 'foundation.me.v1.content.observed',
      time: new Date(now()).toISOString(),
      datacontenttype: TYPE[media],
      prismlabel: 'confidential',
    };
    const result = await ingest({ envelope, frame, bytes });
    tally[await read(`count kept ${typeof result === 'string' ? result : result?.outcome}`)] += 1;
  }

  // One file, already granted: split into items and keep each.
  async function readFile(file, format, grant, tally) {
    const said = await ask('file', `file ${grant} ${format} ${file.size}`);
    tally[said] += 1;
    if (said !== 'files') return;
    if (format === 'mbox') {
      for await (const message of mboxMessages(file.stream())) await lane(() => keep(format, message, tally));
      return;
    }
    const text = await file.text();
    if (format === 'ics') for (const item of calendarItems(text)) await lane(() => keep(format, item, tally));
    else if (format === 'vcf') for (const item of contactItems(text, vcard)) await lane(() => keep(format, item, tally));
    else await lane(() => keep(format, text, tally));
  }

  async function walk(dir, grant, tally, depth, seen) {
    if ((await ask('folder', `list ${grant}`)) !== 'read') return;
    for await (const [name, entry] of dir.entries()) {
      if (entry.kind === 'directory') {
        if ((await read(`enter ${depth} ${name.charCodeAt(0)}`)) === 'yes') await walk(entry, grant, tally, depth + 1, seen);
        continue;
      }
      const format = formatOf(name, dir.name);
      if (format === 'other' && !isZip({ name }) && !exportKind({ name })) continue;
      const file = await entry.getFile();
      const mark = `${dir.name}/${name}:${file.size}:${file.lastModified}`;
      if (seen.has(mark)) continue;
      seen.add(mark);
      if (format === 'other') await readOpened(await openAll([file]), grant, tally);
      else await readFile(file, format, grant, tally);
    }
  }

  // Zips opened, each entry carrying the name of the archive it came from.
  async function openAll(files) {
    const opened = [];
    for (const file of files) {
      if (isZip(file)) opened.push(...(await zipEntries(file)).map((entry) => Object.assign(entry, { archive: file.name })));
      else opened.push(file);
    }
    return opened;
  }

  // A service's own download is read only as PrismSource answers for its
  // export route; each item is then judged by PrismFolder by its own format.
  async function readOpened(opened, grant, tally) {
    const { items, rest } = await exportItems(opened);
    const answers = new Map();
    for (const item of items) {
      if (!answers.has(item.service)) answers.set(item.service, await source(`${item.service} export read ${halted()}`));
      if (answers.get(item.service) !== 'read') { tally.refuse += 1; continue; }
      const bytes = encoder.encode(item.text);
      const before = tally.store + tally.storehash;
      await readFile({ name: `${item.service}.${item.format}`, size: bytes.length, lastModified: now(), text: async () => item.text, stream: () => new Blob([bytes]).stream() }, item.format, grant, tally);
      await drained();
      if (tally.store + tally.storehash > before) arrived(item.service, tally.store + tally.storehash - before);
    }
    for (const file of rest) {
      const format = formatOf(file.name, file.parent ?? '');
      if (format === 'other') { tally.skip += 1; continue; }
      await readFile(file, format, grant, tally);
    }
  }

  const tallyOf = () => ({ files: 0, store: 0, storehash: 0, ask: 0, refuse: 0, skip: 0 });

  return {
    // The folders the owner granted, each with the browser's current word for it.
    async folders() {
      return Promise.all((await store.all()).map(async (f) => ({ id: f.id, name: f.handle.name, grant: await read(`grant ${await stateOf(f.handle)}`) })));
    },
    // The owner's press: the browser's picker, read-only.
    async addFolder(picker = globalThis.showDirectoryPicker) {
      if (typeof picker !== 'function') throw fail('device.picker', 'this browser cannot keep a folder');
      if (halted() === 'yes') throw fail('device.halted', 'the Prism is halted');
      const handle = await picker({ id: 'prism-device', mode: 'read' });
      const id = `f${now().toString(36)}${hex(crypto.getRandomValues(new Uint8Array(4)))}`;
      await store.put(id, { handle, seen: [] });
      return id;
    },
    // The owner's press, after the browser let a grant lapse.
    async allow() {
      for (const f of await store.all()) if ((await stateOf(f.handle)) === 'prompt') await f.handle.requestPermission?.({ mode: 'read' });
    },
    async forget(id) {
      await store.remove(id);
    },
    // Read every granted folder; files already read (same name, size and time) are passed over.
    async readFolders() {
      const tally = tallyOf();
      for (const f of await store.all()) {
        const grant = await stateOf(f.handle);
        const said = await ask('folder', `list ${grant}`);
        if (said !== 'read') { tally[said] += 1; continue; }
        const seen = new Set(f.seen ?? []);
        await walk(f.handle, grant, tally, 0, seen);
        await drained();
        await store.put(f.id, { handle: f.handle, seen: [...seen] });
      }
      return tally;
    },
    // Files the owner picked or dropped: the act itself is the grant for these.
    async readFiles(files) {
      const tally = tallyOf();
      // A zip (a Takeout, a calendar export, a service's data download) is opened; each entry is judged by its own format.
      await readOpened(await openAll(files), 'granted', tally);
      await drained();
      return tally;
    },
    // Text the owner pasted: the paste itself is the grant for it.
    async readText(text) {
      const format = formatOfText(text);
      if (format === 'other') return { ...tallyOf(), skip: 1 };
      const bytes = encoder.encode(text);
      return this.readFiles([{ name: `pasted.${format}`, size: bytes.length, lastModified: now(), text: async () => text, stream: () => new Blob([bytes]).stream() }]);
    },
    // Items the owner's Prism extension read: each by its own first bytes, not by its claim.
    async readItems(items) {
      const files = [];
      const tally = tallyOf();
      for (const item of items) {
        const text = String(item?.text ?? '');
        const format = formatOfText(text);
        if (format === 'other') { tally.skip += 1; continue; }
        const bytes = encoder.encode(text);
        files.push({ name: `item.${format}`, size: bytes.length, lastModified: now(), text: async () => text, stream: () => new Blob([bytes]).stream() });
      }
      const read = await this.readFiles(files);
      for (const key of Object.keys(tally)) read[key] += tally[key];
      return read;
    },
    // Contacts the owner picked in the browser's contact picker.
    async readContacts(contacts) {
      const cards = contacts.map((c) => contactCards([c], vcard)).filter(Boolean);
      const read = cards.length ? await this.readText(cards.join('')) : tallyOf();
      read.skip += contacts.length - cards.length;
      return read;
    },
  };
}
