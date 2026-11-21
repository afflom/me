// UO-01: the uorc facet, run in Node against the real guest, over every request.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GUEST, opened } from './guest.mjs';
// The decision as the model states it (app/specs/uorc/spec.json): the guest
// built from it must answer every request as the spec's own tree does.
const SPEC = JSON.parse(await readFile(new URL('../../app/specs/uorc/spec.json', import.meta.url), 'utf8'));
const FIELDS = SPEC.fields.map((f) => [f.name, f.values]);
const ANSWERS = SPEC.outcomes;
const GUARANTEES = SPEC.guarantees.map((g, i) => ({ id: `INV-${String(i + 1).padStart(3, '0')}`, ...g }));
const MAX_LINE = FIELDS.reduce((n, [, v]) => n + Math.max(...v.map((x) => x.length)), FIELDS.length - 1);
const walk = (t, r) => (typeof t === 'string' ? t : walk(r[t.if[0]] === t.if[1] ? t.then : t.else, r));
const judge = (r) => walk(SPEC.tree, r);
const lineOf = (r) => FIELDS.map(([name]) => r[name]).join(' ');

const uorc = await opened(GUEST);
let checks = 0;
const ok = (cond, message) => { assert.ok(cond, message); checks += 1; };

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
for (const [request, expected] of SPEC.examples) ok((await uorc(request)) === expected, `example ${request} -> ${expected}`);
assert.equal(total, 576);
for (const bad of ['', 'keep', 'Keep no ok known self one same admit', 'keep no ok known self one same admit extra', 'x'.repeat(MAX_LINE + 1)]) {
  ok((await uorc(bad)) === 'invalid', `invalid: ${bad.slice(0, 40)}`);
}
console.log(`uorc: ${checks} checks, ${total} requests`);
