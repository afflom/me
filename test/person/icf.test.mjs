// WP-01: the whole-person model is the whole ICF, as WHO publishes it.
// tools/person/gen.py checks the release pinned in app/specs/oracle/spec.json
// (both of its forms, field by field) against the rows; the LexLean program
// generators/person writes site/person/icf.mjs and refuses the structure's
// defects; each check refuses the defect it is for, planted in the pinned
// release itself; and the page's module keeps every entity's code, title and
// URI, as the licence requires.
// usage: node --test test/person/icf.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

// The classification's structure is refused by the LexLean program
// generators/person, as tools/generators/run.sh runs it: GenIcf on each piece
// of the tabulation, then GenIcfTree's summaries and keys over all pieces.
const TABULATION = "app/specs/oracle/icf/SimpleTabulation-ICF-en.txt";
const PIECE = JSON.parse(readFileSync("generators/pipeline.json", "utf8")).pieceMaximum;
const program = (generator, files) => {
  const stage = mkdtempSync(join(tmpdir(), "prism-icf-"));
  for (const [path, bytes] of files) mkdirSync(join(stage, dirname(path)), { recursive: true }), writeFileSync(join(stage, path), bytes);
  const tar = spawnSync("tar", ["--format=ustar", "--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-b", "1", "-cf", "-", "-C", stage, ...files.map(([p]) => p)]);
  writeFileSync(join(stage, "request"), Buffer.concat([Buffer.from(`${generator} out\n`), tar.stdout]));
  const run = spawnSync(`generators/person/bin/prism-generators${process.arch === "arm64" ? ".aarch64" : ""}`, ["run", join(stage, "request")]);
  rmSync(stage, { recursive: true, force: true });
  const report = run.stdout.toString("utf8");
  return report.startsWith("written\n") ? { out: report.slice(8) } : { why: report };
};
// Cut at line ends into pieces of at most PIECE bytes, as split -C does.
const pieces = (bytes, out = []) => {
  for (let start = 0, end; start < bytes.length; start = end) out.push(bytes.subarray(start, (end = start + PIECE >= bytes.length ? bytes.length : bytes.lastIndexOf(10, start + PIECE - 1) + 1)));
  return out;
};
const structure = (bytes) => {
  const why = [];
  let tree = "", keys = "";
  for (const piece of pieces(bytes)) {
    for (const [name, add] of [["icf", null], ["icftree", (o) => (tree += o)], ["icfids", (o) => (keys += o)]]) {
      const r = program(name, [[TABULATION, piece]]);
      if (r.why) why.push(r.why); else if (add) add(r.out);
    }
  }
  if (!why.length) {
    for (const [name, path, text] of [["icftreecheck", ".gen/icf-tree", tree], ["icfunique", ".gen/icf-ids", keys]]) {
      const r = program(name, [[path, Buffer.from(text)]]);
      if (r.why) why.push(r.why);
    }
  }
  return why.join("");
};
const tabulation = readFileSync(TABULATION);
const planted = (old, now) => {
  const text = tabulation.toString("latin1");
  assert.equal(text.split(old).length, 2, `${old} is in the tabulation once`);
  return Buffer.from(text.replace(old, now), "latin1");
};

test("the release's structure holds, as the LexLean program checks it", () => {
  assert.equal(structure(tabulation), "");
});

// Each check, shown to refuse its own defect in the real release.
const PLANTED = [
  ["the two forms differ", () => gen("--plant", "workbook", "Self-employment", "Self employment").stderr, /the tabulation's Title is .* the workbook's/],
  ["a code outside its component", () => structure(planted("\td8500\t", "\ts8500\t")), /: its code is not in its parent's component/],
  ["a code that skips a level", () => structure(planted("\tb1102\t", "\tb11020\t")), /: its code does not extend its parent's by one level/],
  ["a code out of order or used twice", () => structure(planted("\tb1102\t", "\tb1100\t")), /b1100: its code does not follow b1101 in the release's order/],
  ["a title out of its level", () => structure(planted("- - - - - Quality of consciousness", "- - - - Quality of consciousness")), /: its title is not one level below its parent's/],
  ["a kind the ICF has not", () => structure(planted("\tBlockL2-b11\t\"- - Mental functions\"\tblock", "\tBlockL2-b11\t\"- - Mental functions\"\tblocks")), /: its kind is not chapter, block or category/],
];
// QR-13 planted-unrefused: none of these may pass.
test("refuses every planted defect, each with its own diagnostic", { timeout: 600000 }, () => {
  const unrefused = [];
  for (const [what, run, diagnostic] of PLANTED) {
    const why = run();
    if (!diagnostic.test(why)) unrefused.push(`${what}: ${why.trim().slice(0, 300)}`);
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
