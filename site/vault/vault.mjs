// The Prism's store in the owner's browser: encrypted, filed by content address.
//
// This file moves bytes and reports facts; it decides nothing. Three questions go
// to the app's verified guest, whose router sends each line to a proved LexLean module:
//   boundary "<label> <detector> browser <approval> <identifier> <halted>" -> allow|hashonly|ask|deny   (PrismBoundary)
//   store    "<boundary> <key> <address> <room>"                           -> store|storehash|ask|refuse (PrismVaultStore)
//   restore  "<key> <format> <seal> <address> <kind>"                      -> restore|hashonly|refuse    (PrismVaultRestore)
// `routerDecide(dispatch)` adapts the guest's dispatch(line) -> answer to these three
// questions. Any answer the vault does not expect is obeyed as a refusal.
//
// Keys: one AES-GCM-256 key and one HMAC-SHA-256 key, made by the browser as
// non-extractable CryptoKeys and kept in IndexedDB. There is no unlock step: an
// unlocked device is the owner. No script, including this one, can read the key bytes.
// A passphrase is asked only to make or read an encrypted export (a backup).
//
// Layout: object bytes in OPFS (prism-vault/objects/<address>), or in IndexedDB where
// OPFS cannot write from this thread; the key ring and a small index in IndexedDB.
// The index holds only address, kind, size and time: no labels, no values.

// The facet keywords the app's router answers to.
export const FACETS = { boundary: 'boundary', store: 'store', restore: 'restore' };

// dispatch(line) -> Promise<string>: the app guest, verified by the frame.
export function routerDecide(dispatch) {
  const ask = (facet) => async (line) => String(await dispatch(`${facet} ${line}`)).trim();
  return { boundary: ask(FACETS.boundary), store: ask(FACETS.store), restore: ask(FACETS.restore) };
}

const FORMAT = 1;
const KIND = { value: 0, hash: 1 };
const KIND_NAME = ['value', 'hash'];
const EXPORT_SCHEMA = 'prism-vault-export/1';
const EXPORT_ITERATIONS = 600000; // PBKDF2-SHA-256, OWASP 2023 floor
const te = new TextEncoder();
const td = new TextDecoder();

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const readU32 = (b, o) => new DataView(b.buffer, b.byteOffset + o, 4).getUint32(0);
const bytesOf = (x) => (x instanceof Uint8Array ? x : typeof x === 'string' ? te.encode(x) : new Uint8Array(x));

// ---------- IndexedDB ----------
function idbOpen(name) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of ['keys', 'index', 'objects']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function idb(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

// ---------- object bytes: OPFS, else IndexedDB ----------
async function opfsDir(name) {
  try {
    if (!navigator.storage?.getDirectory) return null;
    if (typeof FileSystemFileHandle === 'undefined' || !('createWritable' in FileSystemFileHandle.prototype)) return null;
    const root = await navigator.storage.getDirectory();
    const top = await root.getDirectoryHandle(name, { create: true });
    return await top.getDirectoryHandle('objects', { create: true });
  } catch { return null; }
}

function makeBlobs(db, dir) {
  const file = (address) => address.replace(/[^a-z0-9]/gi, '_');
  if (dir) return {
    where: 'opfs',
    async put(address, bytes) {
      const h = await dir.getFileHandle(file(address), { create: true });
      const w = await h.createWritable();
      await w.write(bytes); await w.close();
    },
    async get(address) {
      try { const h = await dir.getFileHandle(file(address)); return new Uint8Array(await (await h.getFile()).arrayBuffer()); }
      catch { return null; }
    },
    async del(address) { try { await dir.removeEntry(file(address)); } catch {} },
    async swap(a, b) { // test hook: exchange two stored objects' bytes, as an attacker with disk access would
      const [x, y] = [await this.get(a), await this.get(b)]; await this.put(a, y); await this.put(b, x);
    },
  };
  return {
    where: 'idb',
    put: (address, bytes) => idb(db, 'objects', 'readwrite', (s) => s.put(bytes, address)),
    get: async (address) => (await idb(db, 'objects', 'readonly', (s) => s.get(address))) ?? null,
    del: (address) => idb(db, 'objects', 'readwrite', (s) => s.delete(address)),
    async swap(a, b) { const [x, y] = [await this.get(a), await this.get(b)]; await this.put(a, y); await this.put(b, x); },
  };
}

// ---------- the record inside a seal ----------
// plaintext = u32 metaLength | meta JSON {label, detector} | body
// value record: body = the value; address = "k1:" + hex(HMAC(macKey, value))
// hash record:  body = 32-byte digest | pointer; address = "k1:" + hex(digest)
function encodeRecord(meta, body) {
  const m = te.encode(JSON.stringify(meta));
  return concat(u32(m.length), m, body);
}
function decodeRecord(plain) {
  if (plain.length < 4) return null;
  const n = readU32(plain, 0);
  if (4 + n > plain.length) return null;
  try { return { meta: JSON.parse(td.decode(plain.subarray(4, 4 + n))), body: plain.subarray(4 + n) }; }
  catch { return null; }
}

// envelope = format(1) | kind(1) | iv(12) | AES-GCM(ciphertext+tag); AAD = format|kind|address
const aadFor = (format, kind, address) => concat(new Uint8Array([format, kind]), te.encode(address));

// halted: a function returning 'yes' while the owner's kill switch is on (the Boundary then refuses everything).
export async function openVault({ decide, name = 'prism-vault', halted = () => 'no' } = {}) {
  if (!decide?.boundary || !decide?.store || !decide?.restore) throw new Error('openVault needs decide.boundary, decide.store and decide.restore (the guest)');
  const db = await idbOpen(name);
  const blobs = makeBlobs(db, await opfsDir(name));
  let keys = await idb(db, 'keys', 'readonly', (s) => s.get('ring'));
  const count = await idb(db, 'index', 'readonly', (s) => s.count());
  if (!keys && count === 0) keys = await newRing(db);
  // If objects exist but the key ring is gone, the key is "missing": the guest refuses
  // every store and restore until the owner imports a backup or starts a new ring.

  const keyState = () => (keys ? 'present' : 'missing');
  const addressOf = async (bytes) => 'k1:' + hex(new Uint8Array(await crypto.subtle.sign('HMAC', keys.mac, bytes)));

  async function room(n) {
    try {
      const e = await navigator.storage.estimate();
      return e.quota - e.usage > n + 65536 ? 'ok' : 'full';
    } catch { return 'ok'; }
  }

  async function seal(kindName, address, plain) {
    const kind = KIND[kindName];
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadFor(FORMAT, kind, address) }, keys.aead, plain));
    return concat(new Uint8Array([FORMAT, kind]), iv, ct);
  }

  async function write(address, kindName, plain, line) {
    const sealed = keys ? await seal(kindName, address, plain) : new Uint8Array(0);
    const answer = await decide.store(line(await room(sealed.length)));
    // A value record needs store; a hash record may be written on store or storehash (it keeps less).
    const ok = kindName === 'value' ? answer === 'store' : answer === 'store' || answer === 'storehash';
    if (!ok) return answer;
    await blobs.put(address, sealed);
    await idb(db, 'index', 'readwrite', (s) => s.put({ kind: kindName, size: sealed.length, at: Date.now() }, address));
    return answer;
  }

  // put(value, {label, detector, approval, pointer, address})
  //   address: optional, the address the caller files it under; it must re-derive.
  //   pointer: where the original lives, kept in a hash-only record (sealed).
  //   about: where the item belongs in the owner's places ({domain, media, at}), sealed with it.
  async function put(value, { label = 'unlabeled', detector = 'none', approval = 'none', identifier = 'no', pointer = '', address, about } = {}) {
    const bytes = bytesOf(value);
    const boundary = await decide.boundary(`${label} ${detector} browser ${approval} ${identifier} ${halted()}`);
    if (!keys) {
      const answer = await decide.store(`${boundary} missing derived ok`);
      return { outcome: answer };
    }
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', keys.mac, bytes));
    const derived = 'k1:' + hex(mac);
    const filed = address ?? derived;
    const addr = filed === derived ? 'derived' : 'mismatch';
    const meta = about ? { label, detector, identifier, about } : { label, detector, identifier };
    // The guest says which record, if any, may be written; a hash-only answer keeps the digest, never the value.
    const probe = await decide.store(`${boundary} present ${addr} ok`);
    if (probe === 'store') {
      const outcome = await write(filed, 'value', encodeRecord(meta, bytes), (r) => `${boundary} present ${addr} ${r}`);
      return { outcome, address: outcome === 'store' ? filed : undefined };
    }
    if (probe === 'storehash') {
      const outcome = await write(filed, 'hash', encodeRecord(meta, concat(mac, te.encode(pointer))), (r) => `${boundary} present ${addr} ${r}`);
      return { outcome, address: outcome === 'storehash' ? filed : undefined };
    }
    return { outcome: probe };
  }

  // get(address) -> {outcome: 'restore', bytes, meta} | {outcome: 'hashonly', digest, pointer, meta} | {outcome: 'refuse'} | {outcome: 'absent'}
  async function get(address) {
    const env = await blobs.get(address);
    if (!env) return { outcome: 'absent' };
    const format = env.length >= 14 && env[0] === FORMAT && (env[1] === 0 || env[1] === 1) ? 'known' : 'unknown';
    const kindName = format === 'known' ? KIND_NAME[env[1]] : 'value';
    let seal = 'broken', addr = 'mismatch', rec = null;
    if (keys && format === 'known') {
      try {
        const plain = new Uint8Array(await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: env.subarray(2, 14), additionalData: aadFor(FORMAT, env[1], address) }, keys.aead, env.subarray(14)));
        seal = 'valid';
        rec = decodeRecord(plain);
        if (rec) {
          if (kindName === 'value') addr = (await addressOf(rec.body)) === address ? 'derived' : 'mismatch';
          else addr = rec.body.length >= 32 && 'k1:' + hex(rec.body.subarray(0, 32)) === address ? 'derived' : 'mismatch';
        }
      } catch { seal = 'broken'; }
    }
    const outcome = await decide.restore(`${keyState()} ${format} ${seal} ${addr} ${kindName}`);
    if (outcome === 'restore') return { outcome, bytes: rec.body, meta: rec.meta };
    if (outcome === 'hashonly') return { outcome, digest: hex(rec.body.subarray(0, 32)), pointer: td.decode(rec.body.subarray(32)), meta: rec.meta };
    return { outcome: 'refuse' };
  }

  async function list() {
    const out = [];
    await new Promise((resolve, reject) => {
      const tx = db.transaction('index', 'readonly');
      const c = tx.objectStore('index').openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out.push({ address: cur.key, ...cur.value }); cur.continue(); } };
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    return out;
  }

  // Ask the browser to keep this origin's storage unless the owner clears it.
  async function persist() {
    const s = navigator.storage;
    const persisted = s?.persisted ? (await s.persisted()) || (s.persist ? await s.persist() : false) : false;
    const e = s?.estimate ? await s.estimate() : {};
    return { persisted, usage: e.usage ?? null, quota: e.quota ?? null, where: blobs.where };
  }

  // Encrypted export: every readable object, re-sealed under a key from the backup passphrase.
  // file = "PVX1" | u32 headerLength | header JSON | entries (u32 length | iv(12) | AES-GCM)
  // AAD of entry i = header bytes | u32 i, so entries cannot be reordered, swapped or dropped.
  async function exportTo(passphrase) {
    if (!passphrase) throw new Error('a backup passphrase is needed to make an export');
    const items = [];
    for (const { address } of await list()) {
      const r = await get(address);
      if (r.outcome === 'restore') items.push({ kind: 0, plain: encodeRecord(r.meta, r.bytes) });
      else if (r.outcome === 'hashonly') items.push({ kind: 1, plain: encodeRecord(r.meta, concat(unhex(r.digest), te.encode(r.pointer))) });
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const header = te.encode(JSON.stringify({ schema: EXPORT_SCHEMA, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: EXPORT_ITERATIONS, salt: hex(salt) }, cipher: 'AES-GCM-256', count: items.length }));
    const k = await exportKey(passphrase, salt, EXPORT_ITERATIONS);
    const parts = [te.encode('PVX1'), u32(header.length), header];
    for (let i = 0; i < items.length; i++) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: concat(header, u32(i)) }, k, concat(new Uint8Array([items[i].kind]), items[i].plain)));
      parts.push(u32(12 + ct.length), iv, ct);
    }
    return concat(...parts);
  }

  // Import: open every entry, then file each one again through the Boundary and storeDecision
  // under this browser's own keys. An entry that does not open refuses the whole file.
  async function importFrom(file, passphrase) {
    file = bytesOf(file);
    if (td.decode(file.subarray(0, 4)) !== 'PVX1') return { outcome: 'refuse', reason: 'not a vault export' };
    const hl = readU32(file, 4);
    const header = file.subarray(8, 8 + hl);
    let h; try { h = JSON.parse(td.decode(header)); } catch { return { outcome: 'refuse', reason: 'unreadable header' }; }
    if (h.schema !== EXPORT_SCHEMA || h.kdf?.name !== 'PBKDF2' || h.kdf.iterations < 100000) return { outcome: 'refuse', reason: 'unknown format' };
    const k = await exportKey(passphrase, unhex(h.kdf.salt), h.kdf.iterations);
    const opened = [];
    let o = 8 + hl;
    for (let i = 0; i < h.count; i++) {
      if (o + 4 > file.length) return { outcome: 'refuse', reason: 'truncated' };
      const n = readU32(file, o); o += 4;
      const iv = file.subarray(o, o + 12), ct = file.subarray(o + 12, o + n); o += n;
      try {
        const p = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: concat(header, u32(i)) }, k, ct));
        const rec = decodeRecord(p.subarray(1));
        if (!rec) return { outcome: 'refuse', reason: 'unreadable entry' };
        opened.push({ kind: p[0], rec });
      } catch { return { outcome: 'refuse', reason: 'wrong passphrase or tampered file' }; }
    }
    if (o !== file.length) return { outcome: 'refuse', reason: 'trailing bytes' };
    if (!keys) keys = await newRing(db);
    const results = [];
    for (const { kind, rec } of opened) {
      const { label = 'unlabeled', detector = 'none', identifier = 'no', about } = rec.meta || {};
      if (kind === KIND.value) results.push(await put(rec.body, { label, detector, identifier, about }));
      else results.push(await putHash(rec.body.subarray(0, 32), td.decode(rec.body.subarray(32)), { label, detector, identifier, about }));
    }
    return { outcome: 'import', results };
  }

  // A hash record coming back from an export: its digest was made under the old ring's MAC key,
  // so it is filed under that digest; the guest still decides whether it may be kept.
  async function putHash(digest, pointer, { label, detector, identifier, about }) {
    const boundary = await decide.boundary(`${label} ${detector} browser none ${identifier} ${halted()}`);
    const address = 'k1:' + hex(digest);
    const probe = await decide.store(`${boundary} present derived ok`);
    if (probe !== 'storehash' && probe !== 'store') return { outcome: probe };
    // A value-shaped answer for a hash record still keeps only the hash: a hash never turns back into a value.
    const outcome = await write(address, 'hash', encodeRecord(about ? { label, detector, identifier, about } : { label, detector, identifier }, concat(digest, te.encode(pointer))), (r) => `${boundary} present derived ${r}`);
    return { outcome, address: outcome === 'store' || outcome === 'storehash' ? address : undefined };
  }

  // Start a new key ring when the old one is gone. Objects sealed under the old ring stay
  // on disk and keep being refused; they are never deleted by the vault.
  async function newKeyRing() { keys = await newRing(db); return keyState(); }

  return { put, get, list, persist, exportTo, importFrom, newKeyRing, keyState, addressOf: (b) => addressOf(bytesOf(b)), _blobs: blobs };
}

async function newRing(db) {
  const aead = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const mac = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']);
  const ring = { aead, mac, made: Date.now() };
  await idb(db, 'keys', 'readwrite', (s) => s.put(ring, 'ring'));
  return ring;
}

async function exportKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
