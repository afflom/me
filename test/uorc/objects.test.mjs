// UO-02, UO-03: the Prism's objects as uorc archives, in Node, with the pinned uorc
// client served by bootstrap/uorc-objects.mjs, the real kappa and uorc guests,
// the real vault and its proved guests, and WebCrypto. Node has no IndexedDB,
// so a small in-memory one stands in (objects then go to IndexedDB, as in the
// browser's fallback).
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openGuest as openKappa, GUEST as KAPPA } from '../../site/kappa/guest.mjs';
import { openGuest as openUorc, GUEST as UORC } from '../../site/uorc/guest.mjs';
import { loadClient, makeObjects, structureOf } from '../../site/uorc/objects.mjs';
import { labelOf } from '../../site/kappa/kappa.mjs';

const root = new URL('../../', import.meta.url);
const site = new URL('site/uorc/', root);
const lock = JSON.parse(await readFile(new URL('uorc.lock.json', site), 'utf8'));
if (!lock.files.every((f) => existsSync(new URL(f.path, site)))) {
  execFileSync('node', ['bootstrap/uorc-objects.mjs', 'site'], { cwd: fileURLToPath(root), stdio: 'inherit' });
}

let checks = 0;
const ok = (cond, message) => { assert.ok(cond, message); checks += 1; };
const fileFetch = async (url) => {
  const bytes = await readFile(url);
  return { json: async () => JSON.parse(bytes.toString('utf8')), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
};
const dataImport = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

// UO-02: the client is the locked release, and bytes that differ are refused before they run.
const client = await loadClient({ base: site, fetcher: fileFetch, importer: dataImport });
ok(typeof client.compress === 'function' && typeof client.inspect === 'function', 'the pinned client loads');
const tamperedFetch = async (url) => {
  const r = await fileFetch(url);
  if (!String(url).endsWith('.wasm')) return r;
  return { ...r, arrayBuffer: async () => { const b = new Uint8Array(await r.arrayBuffer()); b[100] ^= 1; return b.buffer; } };
};
await assert.rejects(loadClient({ base: site, fetcher: tamperedFetch, importer: dataImport }), (e) => e.code === 'uorc.client');
checks += 1;

const kappaGuest = await openKappa(new Uint8Array(await readFile(new URL(KAPPA.path, new URL('site/kappa/', root)))), KAPPA.sha256);
const uorcGuest = await openUorc(new Uint8Array(await readFile(new URL(UORC.path, site))), UORC.sha256);
let halted = 'no';
const asked = [];
const decide = { kappa: kappaGuest, uorc: async (line) => { asked.push(line); return uorcGuest(line); } };
const objects = makeObjects({ client: () => client, decide, halted: () => halted });

// UO-02: an object is kept as its archive, named by its kappa label, and opened back to its bytes.
const value = new TextEncoder().encode('A note the owner keeps. '.repeat(40));
const kept = await objects.keep(value);
ok(kept.outcome === 'keep', `a sound object is kept: ${asked.at(-1)}`);
ok(kept.kappa === (await labelOf(value)), 'it is named by the kappa label of its bytes');
ok(kept.archive.length < value.length, 'the archive is smaller than the repetitive value');
ok(asked.at(-1) === 'keep no ok known standard one same admit', `the uorc facet saw only structure: ${asked.at(-1)}`);
const opened = await objects.open(kept.archive, kept.kappa);
ok(opened.outcome === 'open' && Buffer.compare(Buffer.from(opened.bytes), Buffer.from(value)) === 0, 'the archive opens to the very bytes');

// Planted defects: each refuses.
const flipped = kept.archive.slice();
flipped[flipped.length - 1] ^= 1;
ok(structureOf(client, flipped).seal === 'broken', 'a flipped seal bit is a broken seal');
ok((await objects.open(flipped, kept.kappa)).outcome === 'refuse', 'a broken seal is never opened');
const other = (await objects.keep(new TextEncoder().encode('another object'))).archive;
ok((await objects.open(other, kept.kappa)).outcome === 'refuse', 'an archive of other bytes is never opened under this label');
ok(asked.at(-1).endsWith(' differs other'), `the facet was told the restore differs: ${asked.at(-1)}`);
ok((await objects.open(new Uint8Array([1, 2, 3]), kept.kappa)).outcome === 'refuse', 'bytes that are no archive are refused');
ok((await objects.open(kept.archive, 'sha256:abcd')).outcome === 'refuse', 'a malformed label is refused');
const two = client.compressFiles([{ path: 'a', data: value }, { path: 'b', data: value }]);
ok(structureOf(client, two, client.standardBasis).objects === 'many', 'an archive of several objects is many');
ok((await objects.open(two, kept.kappa)).outcome === 'refuse', 'an archive of several objects is never opened as one');
ok(client.inspect(kept.archive)[0].basis === lock.standardBasis, 'the pinned client writes against the locked standard basis');
ok(structureOf(client, kept.archive, 'f'.repeat(64)).scope === 'other', 'any other basis is other');
halted = 'yes';
ok((await objects.keep(value)).outcome === 'refuse', 'nothing is kept while halted');
ok((await objects.open(kept.archive, kept.kappa)).outcome === 'refuse', 'nothing is opened while halted');
halted = 'no';
const liar = makeObjects({ client: () => client, decide: { kappa: kappaGuest, uorc: async () => 'keep' } });
ok((await liar.open(kept.archive, kept.kappa)).outcome === 'refuse', 'an open is projected only on the answer open');

// UO-03: the vault keeps a value as its uorc archive and gives the value back only through it.
const later = (fn) => setTimeout(fn, 0);
const keepClone = (v) => (v && typeof v === 'object' && 'aead' in v ? { ...v } : structuredClone(v));
class Req { constructor() { this.result = undefined; this.onsuccess = null; this.onerror = null; } }
function memoryIndexedDB() {
  const dbs = new Map();
  const store = (tx, map) => {
    const op = (fn) => { const r = new Req(); tx.pending++; later(() => { r.result = fn(); r.onsuccess?.({ target: r }); tx.settle(); }); return r; };
    return {
      put: (v, k) => op(() => { map.set(k, keepClone(v)); return k; }),
      get: (k) => op(() => (map.has(k) ? keepClone(map.get(k)) : undefined)),
      delete: (k) => op(() => { map.delete(k); }),
      count: () => op(() => map.size),
      openCursor() {
        const r = new Req(); const keys = [...map.keys()].sort(); let i = 0; tx.pending++;
        const step = () => later(() => {
          if (i < keys.length) { const key = keys[i++]; r.result = { key, value: keepClone(map.get(key)), continue: step }; r.onsuccess?.({ target: r }); }
          else { r.result = null; r.onsuccess?.({ target: r }); tx.settle(); }
        });
        step(); return r;
      },
    };
  };
  return {
    open(name) {
      const r = new Req();
      later(() => {
        let fresh = false;
        if (!dbs.has(name)) { dbs.set(name, new Map()); fresh = true; }
        const stores = dbs.get(name);
        r.result = {
          objectStoreNames: { contains: (s) => stores.has(s) },
          createObjectStore: (s) => { stores.set(s, new Map()); },
          close() {},
          transaction(names, mode = 'readonly') {
            const tx = { mode, pending: 0, oncomplete: null, onerror: null, objectStore: (s) => store(tx, stores.get(s)),
              settle() { if (--tx.pending === 0) later(() => { if (tx.pending === 0) tx.oncomplete?.(); }); } };
            return tx;
          },
        };
        if (fresh) r.onupgradeneeded?.({ target: r });
        r.onsuccess?.({ target: r });
      });
      return r;
    },
  };
}
globalThis.indexedDB = memoryIndexedDB();
Object.defineProperty(globalThis.navigator, 'storage', { value: { estimate: async () => ({ usage: 0, quota: 1 << 30 }) } });
// The vault's proved guests live in site/vault/test, which the assembled page leaves out;
// read them from the tracked tree when the working copy no longer has them.
const tracked = async (path) => (existsSync(new URL(path, root))
  ? readFile(new URL(path, root))
  : execFileSync('git', ['show', `HEAD:${path}`], { cwd: fileURLToPath(root), maxBuffer: 1 << 26 }));
const { loadRouter } = await dataImport(await tracked('site/vault/test/guests.mjs'));
const { openVault, routerDecide } = await import('../../site/vault/vault.mjs');
const router = await loadRouter((file) => tracked(`site/vault/test/guests/${file}`));
const vault = await openVault({ decide: routerDecide(router), name: 'uorc-test', objects });
const put = await vault.put(value, { label: 'public' });
ok(put.outcome === 'store' && put.address === (await vault.addressOf(value)), `the vault keeps it under the value's address: ${put.outcome}`);
const sealed = await vault._blobs.get(put.address);
ok(sealed && sealed.length < value.length, 'what the vault keeps is the sealed archive, smaller than the value');
const got = await vault.get(put.address);
ok(got.outcome === 'restore' && Buffer.compare(Buffer.from(got.bytes), Buffer.from(value)) === 0, 'the vault restores the very value');
ok(got.meta.uorc === kept.kappa, 'its record names the kappa label');
const blind = await openVault({ decide: routerDecide(router), name: 'uorc-test' });
ok((await blind.get(put.address)).outcome === 'refuse', 'a vault without the objects never opens an archive record');
halted = 'yes';
ok((await vault.get(put.address)).outcome === 'refuse', 'the vault opens nothing while halted');
halted = 'no';

console.log(`uorc objects: ${checks} checks`);
