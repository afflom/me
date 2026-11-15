// PT-01: tools/parts/gate.py passes the committed record, where every part of
// the Prism answers what, why, who, where, when and how, and refuses each
// planted defect with its reason.
// usage: node --test test/parts/gate.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { load } from "../../tools/specs/record.mjs";

const NAMES = { parts: "app/specs/parts/spec.json", product: "app/specs/product/spec.json", coherence: "app/specs/coherence/spec.json" };

function gate(edit = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), "parts-"));
  const files = Object.fromEntries(Object.entries(NAMES).map(([k, p]) => [k, load(p)]));
  edit(files);
  const paths = Object.keys(NAMES).map((k) => { const p = join(dir, `${k}.json`); writeFileSync(p, JSON.stringify(files[k])); return p; });
  return spawnSync("python3", ["-I", "tools/parts/gate.py", ...paths], { encoding: "utf8" });
}
const refuses = (edit, reason) => {
  const r = gate(edit);
  assert.notEqual(r.status, 0, `planted defect passed: ${reason}`);
  assert.match(r.stderr, reason);
};

test("the committed record passes (PT-01)", () => {
  const r = spawnSync("python3", ["-I", "tools/parts/gate.py"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /parts certified/);
});

test("a part no stratum grounds is refused", () =>
  refuses((f) => { f.parts.strata = f.parts.strata.filter((s) => s.key !== "decision"); }, /app\/src\/PrismRouter\.lex\.tex is grounded in no stratum/));

test("a part that stops answering a question is refused", () =>
  refuses((f) => { delete f.parts.debt.parts["site/r4/r4.mjs"]; }, /site\/r4\/r4\.mjs does not answer why, when/));

test("debt that is answered now is refused", () =>
  refuses((f) => { f.parts.debt.parts["site/app.mjs"] = ["how"]; }, /site\/app\.mjs answers every question now/));

test("a journey that answers no concern is refused", () =>
  refuses((f) => { f.product.journeys.find((j) => j.key === "J4").answers = []; }, /journey J4 answers no concern/));

test("a concern no journey answers is refused", () =>
  refuses((f) => { f.product.journeys.find((j) => j.key === "J11").answers = ["day"]; }, /concern quiet is answered by no journey/));

test("a journey in a regime that does not exist is refused", () =>
  refuses((f) => { f.product.journeys.find((j) => j.key === "J1").when = ["dawn"]; }, /journey J1 happens in 'dawn', which is no regime/));

test("a working journey no part serves is refused", () =>
  refuses((f) => { f.product.features = f.product.features.filter((x) => x.key !== "F-32"); }, /journey J11 works, but no feature or facet names a part that serves it/));

test("a stratum naming an agency that does not exist is refused", () =>
  refuses((f) => { f.parts.strata[0].who = ["nobody"]; }, /stratum harness names agency 'nobody'/));
