// UO-01: the uorc facet, run in Node against the real guest, over every request.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GUEST, openGuest } from './guest.mjs';
import { FIELDS, ANSWERS, GUARANTEES, MAX_LINE, judge, line as lineOf } from './table.mjs';

const here = new URL('./', import.meta.url);
const bytes = new Uint8Array(await readFile(new URL(GUEST.path, here)));
const uorc = await openGuest(bytes, GUEST.sha256);
let checks = 0;
const ok = (cond, message) => { assert.ok(cond, message); checks += 1; };

const tampered = bytes.slice();
tampered[tampered.length - 1] ^= 1;
await assert.rejects(openGuest(tampered, GUEST.sha256), /guest refused/);
checks += 1;

const product = (lists) => lists.reduce((acc, list) => acc.flatMap((a) => list.map((b) => [...a, b])), [[]]);
const names = FIELDS.map(([name]) => name);
let total = 0;
for (const values of product(FIELDS.map(([, v]) => v))) {
  const r = Object.fromEntries(names.map((n, i) => [n, values[i]]));
  const answer = await uorc(lineOf(r));
  const why = `${lineOf(r)} -> ${answer}`;
  ok(ANSWERS.includes(answer), why);
  ok(answer === judge(r), `mirror ${why}`);
  for (const g of GUARANTEES) {
    if (!g.when.every(([f, v]) => r[f] === v)) continue;
    if (g.always) ok(answer === g.always, `${g.id} ${why}`);
    if (g.never) ok(!g.never.includes(answer), `${g.id} ${why}`);
  }
  total += 1;
}
assert.equal(total, 576);
for (const bad of ['', 'keep', 'Keep no ok known self one same admit', 'keep no ok known self one same admit extra', 'x'.repeat(MAX_LINE + 1)]) {
  ok((await uorc(bad)) === 'invalid', `invalid: ${bad.slice(0, 40)}`);
}
console.log(`uorc: ${checks} checks, ${total} requests`);
