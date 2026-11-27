// Written by GenBrowser (recordsstore) from app/src/PrismRecordsStore.lex.tex: the
// store of kept records and named cells in the owner's browser. It moves bytes and
// reports facts. Whether a record is kept and whether a cell moves is the records
// guest's answer (PrismRecordsStore in front of PrismRecords: RFC 9110 section 13).
//
// A record's bytes are sealed in the vault; this store keeps only names. A name is
// the vault's keyed name of an address, so the browser's database holds no bare
// content hash. A cell holds the name of one kept record and moves in a single
// IndexedDB transaction, so two tabs that move it from the same record cannot both
// succeed.

import { GUEST, opened } from './guest.mjs';

export const DATABASE = 'prism-records';
export const NAMES = 'names';

const encoder = new TextEncoder();
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const fail = (code, message) => Object.assign(new Error(message), { code });

// One object store of one database. get(key) reads; change(key, next) runs next(current)
// inside one readwrite transaction, puts what it returns unless that is undefined,
// and answers whether it put.
function keyed(database, store, indexed) {
  const within = (mode, work) => new Promise((resolve, reject) => {
    const request = indexed.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(store, mode);
      let said;
      work(tx.objectStore(store), (value) => { said = value; });
      tx.oncomplete = () => { db.close(); resolve(said); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
  return {
    get: (key) => within('readonly', (s, say) => { const r = s.get(key); r.onsuccess = () => say(r.result); }),
    change: (key, next) => within('readwrite', (s, say) => {
      const r = s.get(key);
      r.onsuccess = () => { const value = next(r.result); say(value !== undefined); if (value !== undefined) s.put(value, key); };
    }),
  };
}

// openRecords: the store of kept records.
//   vault            the opened vault (site/vault/vault.mjs): seals the bytes and names the addresses
//   read(line)       the records guest, answering at once (opened here when not given)
// put(address, bytes, meta) -> 'kept' | 'held' | 'refuse'
//   address is 'sha256:' and the hex SHA-256 of bytes; meta is the vault's ({label, detector, ...}).
//   held: the record was already kept (a kept record never changes).
// get(address) -> the bytes, or null where no such record opens to that address
// cell(name) -> { read() -> address | null, swap(expected, next) -> boolean }
//   swap moves the cell to the kept record next only from expected (null: from empty).
export async function openRecords({ vault, read, indexed = globalThis.indexedDB } = {}) {
  if (typeof vault?.put !== 'function' || typeof vault.get !== 'function' || typeof vault.addressOf !== 'function') throw fail('records.vault', 'openRecords needs the opened vault');
  const ask = read ?? await opened(GUEST);
  const names = keyed(DATABASE, NAMES, indexed);
  const present = () => vault.keyState() === 'present';
  const nameOf = (kind, text) => vault.addressOf(encoder.encode(`${kind} ${text}`));
  const addressOf = async (bytes) => 'sha256:' + hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  const opens = async (at) => { const found = at ? await vault.get(at) : null; return found?.outcome === 'restore' ? found.bytes : null; };

  async function put(address, bytes, meta = {}) {
    if (!present() || !(bytes instanceof Uint8Array) || await addressOf(bytes) !== address) return 'refuse';
    const name = await nameOf('record', address);
    const said = ask(`put ${(await names.get(name)) ? name : '-'}`);
    if (said !== 'kept') return said === 'held' ? 'held' : 'refuse';
    const sealed = await vault.put(bytes, meta);
    if (sealed.outcome !== 'store') return 'refuse';
    return (await names.change(name, (current) => (ask(`put ${current ? name : '-'}`) === 'kept' ? sealed.address : undefined))) ? 'kept' : 'held';
  }

  async function get(address) {
    if (!present()) return null;
    const bytes = await opens(await names.get(await nameOf('record', address)));
    return bytes && await addressOf(bytes) === address ? bytes : null;
  }

  function cell(name) {
    return {
      async read() {
        if (!present()) return null;
        const record = await names.get(await nameOf('cell', name));
        const bytes = record ? await opens(await names.get(record)) : null;
        return bytes ? addressOf(bytes) : null;
      },
      async swap(expected, next) {
        if (!present()) return false;
        const record = await nameOf('record', next);
        if (!(await names.get(record))) return false;
        const from = expected == null ? '-' : await nameOf('record', expected);
        return names.change(await nameOf('cell', name), (current) => (ask(`swap ${current ?? '-'} ${from}`) === 'moved' ? record : undefined));
      },
    };
  }

  return { put, get, cell };
}
