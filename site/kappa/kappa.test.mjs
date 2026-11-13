// KP-01..KP-02: the kappa facet, run in Node against the real guest.
// No network: the bytes are synthetic, the digests are WebCrypto's.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GUEST, openGuest } from './guest.mjs';
import { AXES, FIELDS, ANSWERS, GUARANTEES, EXAMPLES, MAX_LINE, NAMED, read, judge, answer as mirror } from './table.mjs';
import { makeKappa, labelOf, digestWord, parseAnswer } from './kappa.mjs';

const here = new URL('./', import.meta.url);
const bytes = new Uint8Array(await readFile(new URL(GUEST.path, here)));
const kappa = await openGuest(bytes, GUEST.sha256);
let checks = 0;
const ok = (cond, message) => { assert.ok(cond, message); checks += 1; };

// A guest whose bytes are not the pinned fingerprint is refused before it compiles.
const tampered = bytes.slice();
tampered[tampered.length - 1] ^= 1;
await assert.rejects(openGuest(tampered, GUEST.sha256), /guest refused/);
checks += 1;

// KP-01: the spec's examples, then labels of every shape on every axis, for every digest word.
for (const [line, expected] of EXAMPLES) {
  ok((await kappa(line)) === expected, `example ${line} -> ${expected}`);
}
const digests = FIELDS.find(([n]) => n === 'digest')[1];
const labels = ['', ':', 'nocolon', 'md5:d41d8cd98f00b204e9800998ecf8427e', ':' + 'a'.repeat(64), 'SHA256:' + 'a'.repeat(64)];
for (const a of AXES) {
  const n = 2 * a.digestBytes;
  labels.push(
    `${a.wire}:${'0123456789abcdef'.repeat(8).slice(0, n)}`,
    `${a.wire}:${'a'.repeat(n - 1)}`,
    `${a.wire}:${'a'.repeat(n + 1)}`,
    `${a.wire}:`,
    `${a.wire}:${'A'.repeat(n)}`,
    `${a.wire}:${'a'.repeat(n - 1)}g`,
    `${a.wire}:${'a'.repeat(n - 2)}é`,
    `${a.wire}:${'a'.repeat(n - 1)}:`,
    `${a.wire}::${'a'.repeat(n - 1)}`,
  );
}
let total = 0;
for (const label of labels) {
  for (const digest of digests) {
    const line = `${label} ${digest}`;
    const got = await kappa(line);
    const why = `${line} -> ${got}`;
    ok(got === mirror(line), `mirror ${why}`);
    if (new TextEncoder().encode(line).length > MAX_LINE) {
      ok(got === 'invalid', `too long ${why}`);
      total += 1;
      continue;
    }
    const word = got.split(' ')[0];
    ok(ANSWERS.includes(word), why);
    const r = read(label, digest);
    ok(word === judge(r), `judge ${why}`);
    for (const g of GUARANTEES) {
      if (!g.when.every(([f, v]) => r[f] === v)) continue;
      if (g.always) ok(word === g.always, `${g.id} ${why}`);
      if (g.never) ok(!g.never.includes(word), `${g.id} ${why}`);
    }
    total += 1;
  }
}
assert.equal(total, labels.length * digests.length);
const long = `sha512:${'a'.repeat(128)} uncomputed`;
assert.equal(long.length, MAX_LINE);
ok((await kappa(long)) === 'unverified sha512 1 64', 'the longest request is read');
for (const bad of ['', 'match', `sha256:${'a'.repeat(64)}`, `sha256:${'a'.repeat(64)} Match`, `sha256:${'a'.repeat(64)} match extra`, `${long}x`, 'x'.repeat(MAX_LINE + 1)]) {
  ok((await kappa(bad)) === 'invalid', `invalid: ${bad.slice(0, 40)}`);
}

// KP-02: the adapter re-derives digests in the browser and admits only on the guest's word.
const decide = kappa;
const facet = makeKappa({ decide });
const object = new TextEncoder().encode('hello world');
ok((await labelOf(object)) === 'sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9', 'kappa-registry blob_kappa_is_sha256');
ok((await labelOf(object, 'sha512')).startsWith('sha512:309ecc489c12d6eb'), 'sha512 label');
for (const wire of ['blake3', 'sha1', 'sha3-256', 'keccak256']) {
  await assert.rejects(labelOf(object, wire), (e) => e.code === 'kappa.host');
  checks += 1;
}
await assert.rejects(labelOf(object, 'md5'), (e) => e.code === 'kappa.axis');
checks += 1;
for (const wire of ['sha256', 'sha512']) {
  const label = await labelOf(object, wire);
  const axis = AXES.find((a) => a.wire === wire);
  const got = await facet.admit(label, object);
  ok(got.outcome === 'admit' && got.axis === wire && got.discriminant === axis.discriminant && got.digestBytes === axis.digestBytes, `admit ${wire}`);
  ok(got.sha256 === (await labelOf(object)), `secondary sha256 for ${wire}`);
  const flipped = object.slice();
  flipped[0] ^= 1;
  ok((await facet.admit(label, flipped)).outcome === 'mismatch', `a flipped bit on ${wire} is refused`);
  ok((await digestWord(label, null)) === 'uncomputed', `no bytes on ${wire}`);
}
ok((await facet.admit('blake3:d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24', object)).outcome === 'unverified', 'an axis the host cannot compute is never admitted');
ok((await facet.admit('sha1:2aae6c35c94fcfb415dbe95f408b9ce91ee846ed', object)).outcome === 'unverified', 'SHA-1 is never admitted without collision detection');
ok((await facet.admit('sha256:abcd', object)).outcome === 'digits', 'a short digest is refused');
ok((await facet.admit('md5:d41d8cd98f00b204e9800998ecf8427e', object)).outcome === 'unknownaxis', 'an unknown axis is refused');
ok((await facet.admit((await labelOf(object)).toUpperCase().replace('SHA256', 'sha256'), object)).outcome === 'badhex', 'uppercase hex is refused');
// An answer the adapter does not expect is a refusal, never an admission.
for (const text of ['admit', 'admit sha256 0', 'admit sha256 1 32', 'admit sha256 0 32 x', 'admit md5 0 16', 'ADMIT sha256 0 32', 'mismatch sha256']) {
  ok(parseAnswer(text).outcome !== 'admit' || false, `unexpected answer ${text}`);
}
const liar = makeKappa({ decide: async () => 'admit sha512 0 32' });
ok((await liar.admit(await labelOf(object), object)).outcome === 'invalid', 'a malformed admission is not obeyed');
ok(NAMED.every((a) => ANSWERS.includes(a)), 'named answers are answers');

console.log(`kappa: ${checks} checks, ${total} requests`);
