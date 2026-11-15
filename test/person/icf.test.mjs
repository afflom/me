// WP-01: the whole-person model is the whole ICF, as WHO publishes it.
// tools/person/gen.py re-derives site/person/icf.mjs from the release pinned in
// app/specs/oracle/spec.json (both of its forms, field by field) and refuses a
// stale model; each check it makes refuses the defect it is for, planted in the
// pinned release itself; and the page's module keeps every entity's code, title
// and URI, as the licence requires.
// usage: node --test test/person/icf.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as icf from "../../site/person/icf.mjs";

const spec = JSON.parse(readFileSync("app/specs/oracle/spec.json", "utf8"));
const source = spec.classifications.find((c) => c.key === "icf");
const QUALITY = JSON.parse(readFileSync("app/specs/product/quality/QR-13.json", "utf8"));
// A measure of QR-13 holds when its count is on the right side of the record's threshold.
const holds = (key, count) => {
  const m = QUALITY.measures.find((x) => x.key === key);
  assert.ok(m, `QR-13 has no measure ${key}`);
  assert.ok(m.direction === "atMost" ? count <= m.threshold : count >= m.threshold, `QR-13 ${key} is ${count}, the record allows ${m.direction} ${m.threshold}`);
};
const gen = (...extra) => spawnSync("python3", ["-I", "tools/person/gen.py", "--cache", join(tmpdir(), "prism-person"), ...extra], { encoding: "utf8" });

test("the model is the pinned release, re-derived from both of its forms", () => {
  const run = gen("--check");
  assert.equal(run.status, 0, run.stderr || run.stdout);
});

// Each check, shown to refuse its own defect in the real release.
const PLANTED = [
  ["the two forms differ", ["workbook", "Self-employment", "Self employment"], /the tabulation's Title is .* the workbook's/],
  ["a code outside its component", ["both", "d8500", "s8500"], /s8500 is under Activities and participation, not Body structures/],
  ["a code that skips a level", ["both", "b1102", "b11020"], /b11020 does not extend its parent b110 by one level/],
  ["a code used twice", ["both", "b1102", "b1100"], /is a category with code 'b1100', empty or seen before/],
  ["a title out of its level", ["both", "- - - - - Quality of consciousness", "- - - - Quality of consciousness"], /does not carry its 5 levels/],
];
// QR-13 planted-unrefused: none of these may pass.
test("refuses every planted defect, each with its own diagnostic", () => {
  const unrefused = [];
  for (const [what, plant, diagnostic] of PLANTED) {
    const run = gen("--plant", ...plant);
    if (run.status === 0 || !diagnostic.test(run.stderr)) unrefused.push(`${what}: ${run.stderr.trim()}`);
  }
  assert.deepEqual(unrefused, []);
  holds("planted-unrefused", unrefused.length);
});

// QR-13 entities-unkept: every entity is held with its code, title and URI.
test("every entity keeps its code, title and URI (ICF licence terms 1.2.3)", () => {
  const { counts } = icf.RELEASE;
  assert.equal(icf.RELEASE.sha256, source.sha256);
  assert.equal(icf.RELEASE.citation, source.licence.citation);
  const kept = icf.ENTITIES.filter((e) =>
    e.title && e.release.startsWith("http://id.who.int/icd/release/11/icf/") && icf.byUri(e.release) === e && (!e.uri || icf.byUri(e.uri) === e) && (e.kind !== "category" || icf.byCode(e.code) === e));
  holds("entities-unkept", counts.chapter + counts.block + counts.category - kept.length);
});

test("the classification's four components, thirty chapters and qualifier scales", () => {
  assert.deepEqual(icf.COMPONENTS.map((c) => c.title).sort(), ["Activities and participation", "Body functions", "Body structures", "Environmental factors"]);
  assert.equal(icf.CHAPTERS.length, 30);
  assert.equal(icf.CATEGORIES.length + icf.QUALIFIERS.length, icf.RELEASE.counts.category);
  for (const c of icf.CATEGORIES) {
    const chapter = icf.chapterOf(c);
    assert.ok(chapter, `${c.code} is in no chapter`);
    assert.equal(chapter.block.slice(-3, -2), c.code[0], `${c.code} is in ${chapter.title}`);
    assert.ok(icf.ancestors(c).at(-1).title === "ICF Category");
  }
  for (const q of icf.QUALIFIERS) assert.equal(icf.chapterOf(q), null);
});
