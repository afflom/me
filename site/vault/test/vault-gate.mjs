// The vault's conformance gate in Node (VS-01, VS-02, VS-03): the real vault.mjs, the real
// WebCrypto, the real proved guests. Node has no IndexedDB or OPFS, so a small in-memory
// IndexedDB stands in for the browser's (objects then go to IndexedDB, as in the fallback);
// vault-browser.test.mjs runs the same scenario in Chromium against OPFS and IndexedDB.
//
// usage: node site/vault/test/vault-gate.mjs [VS-01|VS-02|VS-03]
import { readFile } from 'node:fs/promises';
import { checks, scenario } from './scenario.mjs';

const later = (fn) => setTimeout(fn, 0);
// Keep what the browser keeps: a structured clone, except CryptoKeys, which stay the same object.
const keep = (v) => (v && typeof v === 'object' && 'aead' in v ? { ...v } : structuredClone(v));

class Request { constructor() { this.result = undefined; this.error = null; this.onsuccess = null; this.onerror = null; } }

function store(tx, map) {
  const op = (fn) => {
    const r = new Request();
    tx.pending++;
    later(() => { r.result = fn(); r.onsuccess?.({ target: r }); tx.settle(); });
    return r;
  };
  return {
    put: (value, key) => op(() => { if (tx.mode !== 'readwrite') throw new Error('read-only'); map.set(key, keep(value)); return key; }),
    get: (key) => op(() => (map.has(key) ? keep(map.get(key)) : undefined)),
    delete: (key) => op(() => { map.delete(key); }),
    count: () => op(() => map.size),
    openCursor() {
      const r = new Request();
      const keys = [...map.keys()].sort();
      let i = 0;
      tx.pending++;
      const step = () => later(() => {
        if (i < keys.length) {
          const key = keys[i++];
          r.result = { key, value: keep(map.get(key)), continue: step };
          r.onsuccess?.({ target: r });
        } else { r.result = null; r.onsuccess?.({ target: r }); tx.settle(); }
      });
      step();
      return r;
    },
  };
}

function memoryIndexedDB() {
  const dbs = new Map();
  return {
    open(name) {
      const r = new Request();
      later(() => {
        let fresh = false;
        if (!dbs.has(name)) { dbs.set(name, new Map()); fresh = true; }
        const stores = dbs.get(name);
        const db = {
          objectStoreNames: { contains: (s) => stores.has(s) },
          createObjectStore: (s) => { stores.set(s, new Map()); },
          close() {},
          transaction(names, mode = 'readonly') {
            const tx = {
              mode, pending: 0, oncomplete: null, onerror: null, onabort: null, error: null,
              objectStore: (s) => store(tx, stores.get(s)),
              settle() { if (--tx.pending === 0) later(() => { if (tx.pending === 0) tx.oncomplete?.(); }); },
            };
            for (const s of [names].flat()) if (!stores.has(s)) throw new Error(`no object store ${s}`);
            return tx;
          },
        };
        r.result = db;
        if (fresh) r.onupgradeneeded?.({ target: r });
        r.onsuccess?.({ target: r });
      });
      return r;
    },
  };
}

globalThis.indexedDB = memoryIndexedDB();
Object.defineProperty(globalThis.navigator, 'storage', {
  value: { estimate: async () => ({ usage: 0, quota: 1 << 30 }), persisted: async () => false, persist: async () => false },
});

const only = process.argv[2];
const read = (file) => readFile(new URL(`./guests/${file}`, import.meta.url));
const results = checks(await scenario(read)).filter(([id]) => !only || id === only);
let failed = 0;
for (const [id, name, ok] of results) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}`);
}
console.log(`${results.length - failed} of ${results.length} checks passed`);
process.exit(failed || results.length === 0 ? 1 : 0);
