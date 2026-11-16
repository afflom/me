// HW-01: tools/handwritten/gate.py passes the committed tree against itself
// and refuses each planted defect with its reason: a new hand-written part,
// hand-written code that grew in all, upstream bytes edited in place (they
// become hand-written), and a spec declaration widened to hide hand-written code. The base is measured the same way as the tree.
// usage: node --test test/handwritten/gate.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const SPEC = "app/specs/handwritten/spec.json";
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });

// A scratch git repository holding HEAD's tree as its one commit, the base the
// ratchet compares with. The committed tree, not the working one: the page
// build changes tracked files (site/app.json gets its attestation) first.
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "hw-"));
  const archive = spawnSync("git", ["archive", "--format=tar", "HEAD"], { maxBuffer: 1 << 30 });
  assert.equal(archive.status, 0);
  assert.equal(spawnSync("tar", ["-x", "-C", dir], { input: archive.stdout, maxBuffer: 1 << 30 }).status, 0);
  for (const args of [["init", "-q"], ["add", "-A"], ["-c", "user.name=hw", "-c", "user.email=hw@example.invalid", "commit", "-q", "-m", "base"]]) {
    assert.equal(run("git", args, dir).status, 0);
  }
  // The producers' scratch copy and their cargo build stay in this tree's target/.
  mkdirSync("target", { recursive: true });
  symlinkSync(resolve("target"), join(dir, "target"));
  return dir;
}

const gate = (dir, ...extra) => run("python3", ["-I", "tools/handwritten/gate.py", "--root", dir, "--check", "--base", "HEAD", ...extra], ".");
let files;

test("the committed tree passes against itself (HW-01)", () => {
  const dir = scratch();
  const out = join(dir, "target", `hw-ledger-${process.pid}.json`);
  const r = gate(dir, "--ledger", out);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /none added or grown since HEAD/);
  files = JSON.parse(readFileSync(out, "utf8")).files;
  rmSync(out, { force: true });
  rmSync(dir, { recursive: true, force: true });
});

test("refuses a new hand-written part, growth, upstream bytes edited in place, and a declaration that would hide hand-written code", () => {
  const dir = scratch();
  const hand = files.find((e) => e.is === "hand" && e.lines > 0 && /^site\/.*\.mjs$/.test(e.path)).path;
  const up = files.find((e) => e.is === "upstream" && /\.mjs$/.test(e.path) && e.path !== hand).path;
  writeFileSync(join(dir, "tools/glue.mjs"), "export const glue = 1;\n");
  assert.equal(run("git", ["add", "tools/glue.mjs"], dir).status, 0);
  appendFileSync(join(dir, hand), "export const grown = [1, 2, 3];\nexport const more = 4;\n");
  appendFileSync(join(dir, up), "export const edited = 1;\n");
  const spec = JSON.parse(readFileSync(join(dir, SPEC), "utf8"));
  spec.model.push("test/person/");
  writeFileSync(join(dir, SPEC), `${JSON.stringify(spec, null, 2)}\n`);
  const r = gate(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /model gained \['test\/person\/'\]/);
  assert.match(r.stderr, /tools\/glue\.mjs: a new hand-written part/);
  assert.match(r.stderr, new RegExp(`${up.replace(/[.]/g, "\\.")}: a new hand-written part \\(it was upstream`));
  assert.match(r.stderr, /hand-written lines grew/);
  rmSync(dir, { recursive: true, force: true });
});
