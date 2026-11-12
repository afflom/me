// One scenario for the vault, run in Node (vault-gate.mjs) and in headless Chromium
// (vault-browser.test.mjs). All values are synthetic. Each check that guards a refusal
// is a planted defect: it changes the stored bytes and expects the guest to refuse them.
import { openVault, routerDecide } from '../vault.mjs';
import { GUESTS, loadRouter, openGuest } from './guests.mjs';

const keyRing = (name) => new Promise((resolve, reject) => {
  const q = indexedDB.open(name);
  q.onerror = () => reject(q.error);
  q.onsuccess = () => {
    const g = q.result.transaction('keys', 'readonly').objectStore('keys').get('ring');
    g.onsuccess = () => { q.result.close(); resolve(g.result); };
  };
});
const dropKeyRing = (name) => new Promise((resolve) => {
  const q = indexedDB.open(name);
  q.onsuccess = () => {
    const tx = q.result.transaction('keys', 'readwrite');
    tx.objectStore('keys').delete('ring');
    tx.oncomplete = () => { q.result.close(); resolve(); };
  };
});

// read(file) -> bytes of a guest in ./guests/; prefix keeps two runs in one origin apart.
export async function scenario(read, prefix = '') {
  const decide = routerDecide(await loadRouter(read));
  const out = {};
  const td = new TextDecoder();
  const v = await openVault({ decide, name: `${prefix}v1` });
  const A = 'synthetic note: dentist moved to Thursday 15:00';
  const B = 'synthetic note: library books due 2030-01-05';

  const a = await v.put(A, { label: 'confidential' });
  const b = await v.put(B, { label: 'internal' });
  out.putA = a.outcome;
  const ga = await v.get(a.address);
  out.roundtrip = ga.outcome === 'restore' && td.decode(ga.bytes) === A && ga.meta.label === 'confidential';
  out.rederive = (await v.addressOf(A)) === a.address;
  out.idempotent = (await v.put(A, { label: 'confidential' })).address === a.address;

  // A second open of the same vault, as after a reload: no prompt, the same keys, the same value.
  const again = await openVault({ decide, name: `${prefix}v1` });
  const gb = await again.get(b.address);
  out.reopen = gb.outcome === 'restore' && td.decode(gb.bytes) === B;

  // Nothing readable at rest: neither the value nor its label is in the stored bytes or the index.
  const raw = await v._blobs.get(a.address);
  const rawText = td.decode(raw);
  out.noPlaintext = !rawText.includes('dentist') && !rawText.includes('confidential');
  const idx = JSON.stringify(await v.list());
  out.indexClean = !idx.includes('dentist') && !idx.includes('confidential') && (await v.list()).length === 2;
  out.where = (await v.persist()).where;

  // Keys are non-extractable CryptoKeys kept by the browser.
  const ring = await keyRing(`${prefix}v1`);
  out.nonExtractable = ring.aead.extractable === false && ring.mac.extractable === false;
  try { await crypto.subtle.exportKey('raw', ring.aead); out.exportKeyRefused = false; } catch { out.exportKeyRefused = true; }

  // Planted defect 1: one flipped ciphertext bit.
  const t = raw.slice(); t[t.length - 5] ^= 1; await v._blobs.put(a.address, t);
  out.tamper = (await v.get(a.address)).outcome;
  await v._blobs.put(a.address, raw);
  out.repaired = (await v.get(a.address)).outcome;

  // Planted defect 2: two objects' bytes swapped on disk.
  await v._blobs.swap(a.address, b.address);
  out.swapA = (await v.get(a.address)).outcome; out.swapB = (await v.get(b.address)).outcome;
  await v._blobs.swap(a.address, b.address);

  // Planted defect 3: an unknown envelope version.
  const u = raw.slice(); u[0] = 9; await v._blobs.put(a.address, u);
  out.unknownFormat = (await v.get(a.address)).outcome;
  await v._blobs.put(a.address, raw);

  // Planted defect 4: a value filed under an address it does not re-derive to.
  out.mismatchPut = (await v.put('synthetic other', { label: 'internal', address: b.address })).outcome;
  out.bStillB = td.decode((await v.get(b.address)).bytes) === B;

  // Regulated data: the Boundary says hashonly, the vault keeps only a keyed digest and pointer.
  const card = 'synthetic card ending 0000';
  const h = await v.put(card, { label: 'confidential', detector: 'pci', pointer: 'source:synthetic/1' });
  out.hashPut = h.outcome;
  const hg = await v.get(h.address);
  out.hashGet = hg.outcome;
  out.hashHasNoValue = hg.bytes === undefined && hg.pointer === 'source:synthetic/1';
  out.hashRawClean = !td.decode(await v._blobs.get(h.address)).includes('synthetic card');
  out.restrictedPut = (await v.put('synthetic restricted', { label: 'restricted', approval: 'owner' })).outcome;

  // An unlabeled fact may stay in the owner's own browser (the Boundary allows it there).
  out.unlabeledPut = (await v.put('synthetic unlabeled', {})).outcome;

  // Kill switch on: the Boundary denies, so storeDecision refuses; reading stays open to the owner.
  const vh = await openVault({ decide, name: `${prefix}v1`, halted: () => 'yes' });
  out.haltedPut = (await vh.put('synthetic while halted', { label: 'internal' })).outcome;
  out.haltedGet = (await vh.get(b.address)).outcome;

  // A router that answers something unexpected is obeyed as a refusal.
  const odd = await openVault({ decide: routerDecide(async () => 'invalid request'), name: `${prefix}v1` });
  out.oddPut = (await odd.put('synthetic odd', { label: 'internal' })).outcome;
  out.oddGet = (await odd.get(b.address)).outcome;

  const p = await v.persist();
  out.persist = typeof p.persisted === 'boolean' && p.quota > 0;

  // Encrypted export and import into a second vault. The passphrase is asked here only.
  const file = await v.exportTo('synthetic backup phrase');
  out.exportClean = !td.decode(file).includes('dentist') && !td.decode(file).includes('confidential');
  try { await v.exportTo(''); out.exportNeedsPhrase = false; } catch { out.exportNeedsPhrase = true; }
  const w = await openVault({ decide, name: `${prefix}v2` });
  out.wrongPass = (await w.importFrom(file, 'not the phrase')).outcome;
  const tf = file.slice(); tf[tf.length - 3] ^= 1;
  out.tamperedExport = (await w.importFrom(tf, 'synthetic backup phrase')).outcome;
  out.truncatedExport = (await w.importFrom(file.slice(0, file.length - 40), 'synthetic backup phrase')).outcome;
  const imp = await w.importFrom(file, 'synthetic backup phrase');
  out.importOutcomes = imp.results?.map((x) => x.outcome).join(',');
  const wa = imp.results?.find((x) => x.outcome === 'store');
  const all = await Promise.all((await w.list()).map(async (e) => w.get(e.address)));
  const texts = all.filter((x) => x.outcome === 'restore').map((x) => td.decode(x.bytes)).sort();
  out.imported = JSON.stringify(texts) === JSON.stringify([A, B, 'synthetic unlabeled'].sort()) && all.some((x) => x.outcome === 'hashonly');
  out.newDeviceAddress = Boolean(wa) && wa.address !== a.address;

  // Key ring gone (site data partly cleared): every restore and store is refused, nothing is deleted.
  await dropKeyRing(`${prefix}v1`);
  const v1b = await openVault({ decide, name: `${prefix}v1` });
  out.keyState = v1b.keyState();
  out.keyMissingGet = (await v1b.get(a.address)).outcome;
  out.keyMissingPut = (await v1b.put('synthetic', { label: 'internal' })).outcome;
  out.objectsKept = (await v1b.list()).length;

  // A guest whose bytes are not the pinned fingerprint is never compiled.
  const bad = new Uint8Array(await read(GUESTS.store.file)).slice(); bad[bad.length - 1] ^= 1;
  try { await openGuest(bad, GUESTS.store.sha256); out.badGuest = 'opened'; } catch { out.badGuest = 'refused'; }
  return out;
}

// [conformance ID, what is checked, passed]
export function checks(r) {
  return [
    ['VS-01', 'round trip restores the value and its label', r.putA === 'store' && r.roundtrip],
    ['VS-01', 'the address re-derives from the value', r.rederive && r.idempotent],
    ['VS-01', 'stored bytes hold no value or label', r.noPlaintext],
    ['VS-01', 'the index holds no value or label', r.indexClean],
    ['VS-01', 'a value under the wrong address is refused', r.mismatchPut === 'refuse' && r.bStillB],
    ['VS-01', 'card data is kept as a hash only', r.hashPut === 'storehash' && r.hashGet === 'hashonly' && r.hashHasNoValue && r.hashRawClean],
    ['VS-01', 'restricted data is kept as a hash only', r.restrictedPut === 'storehash'],
    ['VS-01', 'an unlabeled value may stay in the browser', r.unlabeledPut === 'store'],
    ['VS-01', 'the kill switch refuses new writes, reading stays open', r.haltedPut === 'refuse' && r.haltedGet === 'restore'],
    ['VS-01', 'an unexpected answer is obeyed as a refusal', r.oddPut !== 'store' && r.oddGet === 'refuse'],
    ['VS-02', 'a flipped bit is refused on restore', r.tamper === 'refuse' && r.repaired === 'restore'],
    ['VS-02', 'swapped objects are refused', r.swapA === 'refuse' && r.swapB === 'refuse'],
    ['VS-02', 'an unknown envelope is refused', r.unknownFormat === 'refuse'],
    ['VS-02', 'a lost key ring refuses restore and store, and deletes nothing', r.keyState === 'missing' && r.keyMissingGet === 'refuse' && r.keyMissingPut === 'refuse' && r.objectsKept === 5],
    ['VS-02', 'a guest with the wrong fingerprint is refused', r.badGuest === 'refused'],
    ['VS-03', 'keys are non-extractable', r.nonExtractable && r.exportKeyRefused],
    ['VS-03', 'reopening needs no passphrase and restores the value', r.reopen],
    ['VS-03', 'persist() is asked and reported', r.persist],
    ['VS-03', 'an export needs a passphrase and holds no value or label', r.exportNeedsPhrase && r.exportClean],
    ['VS-03', 'a wrong backup passphrase is refused', r.wrongPass === 'refuse'],
    ['VS-03', 'a tampered or truncated export is refused', r.tamperedExport === 'refuse' && r.truncatedExport === 'refuse'],
    ['VS-03', 'import restores every value in a new vault', r.imported && r.newDeviceAddress],
  ];
}
