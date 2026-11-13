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
// list and every read it asks the proved PrismFolder guest, through `decide`,
//   "<grant> <format> <action> <bulk> <halted>"
// and acts only on `read`. It never asks to write: the browser's handle is
// opened read-only. Each item goes to `ingest` (google/ingest.mjs): the
// detectors, then vault.put, which makes the Boundary call.

// The standalone build of app/src/PrismFolder.lex.tex the Node suite runs
// (device.test.mjs); the page asks the same module through the Prism root.
export const GUEST = { path: 'guest/folder.wasm', sha256: '6fdaec9f0b96478c68d82695ff91a2e927f1430395ca59661633c795934188c0' };
// And of app/src/PrismHost.lex.tex, for the same suite.
// And of app/src/PrismSource.lex.tex.
export const SOURCE_GUEST = { path: 'guest/source.wasm', sha256: '86ba238e418c0e959ec51efe653adcd617fbca4b2dde824901ed2074f9bfc080' };
export const HOST_GUEST = { path: 'guest/host.wasm', sha256: '72f4852426d91c15d6322cc33a08f0fe2f54f2be85b7f68ef031d8e5f4db783b' };

export const LIMIT = 32 * 1024 * 1024; // one read at a time, at most
const DEPTH = 6;
const DB = 'prism-device';
const encoder = new TextEncoder();
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
import { isZip, zipEntries } from './zip.mjs';
import { exportItems, exportKind } from '../source/exports.mjs';

const sha256 = async (bytes) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
const fail = (code, message) => Object.assign(new Error(message ?? code), { code });

// The format of a file, from its name and the folder it sits in.
export function formatOf(name, parent = '') {
  const lower = name.toLowerCase();
  if (/\.(mbox|mbx)$/.test(lower)) return 'mbox';
  if (lower.endsWith('.eml')) return 'eml';
  if (/\.(ics|ical|ifb)$/.test(lower)) return 'ics';
  if (/\.(vcf|vcard)$/.test(lower)) return 'vcf';
  if ((parent === 'cur' || parent === 'new') && !lower.startsWith('.')) return 'maildir';
  return 'other';
}

const MEDIA = { mbox: 'message', eml: 'message', maildir: 'message', ics: 'calendar', vcf: 'contactCard' };
const TYPE = { message: 'message/rfc822', calendar: 'text/calendar', contactCard: 'text/vcard' };

// mbox: messages begin at a line "From " after a blank line (or at the start);
// mboxrd's ">From " quoting is undone. Streamed, so a large export is read in pieces.
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
      if (line.startsWith('From ') && (message === null || /\r?\n\r?\n$/.test(message) || message === '')) {
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

// iCalendar: one item per VEVENT or VTODO, each with the calendar's time zones.
export function calendarItems(text) {
  const unfolded = text.replace(/\r?\n/g, '\n');
  const zones = unfolded.match(/BEGIN:VTIMEZONE\n[\s\S]*?\nEND:VTIMEZONE\n?/g) ?? [];
  const parts = unfolded.match(/BEGIN:(VEVENT|VTODO)\n[\s\S]*?\nEND:\1\n?/g) ?? [];
  return parts.map((part) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//prism//device//EN', ...zones.map((z) => z.trimEnd()), part.trimEnd(), 'END:VCALENDAR', ''].join('\r\n'));
}

// The format of pasted or picked text, from its first bytes.
export function formatOfText(text) {
  const head = text.trimStart().slice(0, 4096);
  if (/^BEGIN:VCALENDAR/i.test(head)) return 'ics';
  if (/^BEGIN:VCARD/i.test(head)) return 'vcf';
  if (/^From \S+/.test(head)) return 'mbox';
  if (/^(?:[A-Za-z][A-Za-z0-9-]*:[^\n]*\r?\n(?:[ \t][^\n]*\r?\n)*)+\r?\n/.test(head) && /^(?:from|date|subject|message-id|received|return-path|delivered-to):/im.test(head)) return 'eml';
  return 'other';
}

// The contact picker's answer, as vCards.
export function contactCards(contacts) {
  const esc = (s) => String(s).replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
  return contacts.map((c) => ['BEGIN:VCARD', 'VERSION:4.0', `FN:${esc(c.name?.[0] ?? c.email?.[0] ?? c.tel?.[0] ?? '')}`, ...(c.email ?? []).map((e) => `EMAIL:${esc(e)}`), ...(c.tel ?? []).map((n) => `TEL:${esc(n)}`), 'END:VCARD', ''].join('\r\n')).join('');
}

// vCard: one item per card.
export function contactItems(text) {
  return (text.replace(/\r?\n/g, '\n').match(/BEGIN:VCARD\n[\s\S]*?\nEND:VCARD\n?/gi) ?? []).map((card) => card.trimEnd().replace(/\n/g, '\r\n') + '\r\n');
}

// The browser's word for a handle's permission, as the guest's `grant`.
async function grantOf(handle) {
  if (!handle) return 'none';
  if (typeof handle.queryPermission !== 'function') return 'granted';
  const state = await handle.queryPermission({ mode: 'read' });
  return state === 'granted' ? 'granted' : state === 'prompt' ? 'prompt' : 'revoked';
}

// The handles the owner granted, kept in this browser.
export function handleStore(indexed = globalThis.indexedDB) {
  const open = () => new Promise((resolve, reject) => {
    const request = indexed.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('folders');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const run = async (mode, work) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('folders', mode);
      const result = work(tx.objectStore('folders'));
      tx.oncomplete = () => { db.close(); resolve(result.result ?? result); };
      tx.onerror = () => reject(tx.error);
    });
  };
  return {
    all: async () => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const out = [];
        const cursor = db.transaction('folders').objectStore('folders').openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) { db.close(); resolve(out); return; }
          out.push({ id: c.key, ...c.value });
          c.continue();
        };
        cursor.onerror = () => reject(cursor.error);
      });
    },
    put: (id, value) => run('readwrite', (s) => s.put(value, id)),
    remove: (id) => run('readwrite', (s) => s.delete(id)),
  };
}

// openDevice: the device as a source.
//   decide(line) -> 'read' | 'ask' | 'skip' | 'refuse'   (PrismFolder, through the root)
//   ingest({envelope, frame, bytes}) -> outcome          (google/ingest.mjs ingestInto)
//   store                                                (handleStore)
//   halted() -> 'no' | 'yes'
//   lanes                                                (host.mjs lanes: the host rule)
// `source` is PrismSource's answer for "<service> <route> <act>" (with the
// halted word appended here); without it no service's download is read.
// `arrived(service, kept)` hears how many items of a service's download were kept.
export function openDevice({ decide, ingest, source = async () => 'refuse', arrived = () => {}, store = handleStore(), halted = () => 'no', now = () => Date.now(), lanes = 1 }) {
  if (typeof decide !== 'function') throw fail('device.decide', 'openDevice needs decide (the PrismFolder guest)');
  if (typeof ingest !== 'function') throw fail('device.ingest', 'openDevice needs ingest');
  const ask = async (grant, format, action, bulk) => decide(`${grant} ${format} ${action} ${bulk} ${halted()}`);

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
    if ((await ask('granted', format, 'read', bytes.length > LIMIT ? 'large' : 'small')) !== 'read') { tally.skip += 1; return; }
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
    const outcome = typeof result === 'string' ? result : result?.outcome;
    tally[outcome in tally ? outcome : 'refuse'] += 1;
  }

  // One file, already granted: split into items and keep each.
  async function readFile(file, format, grant, tally) {
    const streamed = format === 'mbox';
    const bulk = !streamed && file.size > LIMIT ? 'large' : 'small';
    const answer = await ask(grant, format, 'read', bulk);
    if (answer !== 'read') { tally[answer === 'skip' ? 'skip' : 'refuse'] += 1; return; }
    tally.files += 1;
    if (streamed) {
      for await (const message of mboxMessages(file.stream())) await lane(() => keep(format, message, tally));
      return;
    }
    const text = await file.text();
    if (format === 'ics') for (const item of calendarItems(text)) await lane(() => keep(format, item, tally));
    else if (format === 'vcf') for (const item of contactItems(text)) await lane(() => keep(format, item, tally));
    else await lane(() => keep(format, text, tally));
  }

  async function walk(dir, grant, tally, depth, seen) {
    if ((await ask(grant, 'other', 'list', 'small')) !== 'read') return;
    for await (const [name, entry] of dir.entries()) {
      if (entry.kind === 'directory') {
        if (depth < DEPTH && !name.startsWith('.')) await walk(entry, grant, tally, depth + 1, seen);
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
      return Promise.all((await store.all()).map(async (f) => ({ id: f.id, name: f.handle.name, grant: await grantOf(f.handle) })));
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
      for (const f of await store.all()) if ((await grantOf(f.handle)) === 'prompt') await f.handle.requestPermission?.({ mode: 'read' });
    },
    async forget(id) {
      await store.remove(id);
    },
    // Read every granted folder; files already read (same name, size and time) are passed over.
    async readFolders() {
      const tally = tallyOf();
      for (const f of await store.all()) {
        const grant = await grantOf(f.handle);
        const answer = await ask(grant, 'other', 'list', 'small');
        if (answer !== 'read') { tally[answer === 'ask' ? 'ask' : 'refuse'] += 1; continue; }
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
      return contacts.length ? this.readText(contactCards(contacts)) : tallyOf();
    },
  };
}
