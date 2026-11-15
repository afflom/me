// HW-01: tools/handwritten/gate.py passes the committed tree and refuses each
// planted defect with its reason: a new hand-written part, hand-written
// code that grew in all, a stale ledger, upstream bytes edited in place, and (in
// full) a hand-written file the ledger calls generated.
// usage: node --test test/handwritten/gate.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { mkdirSync, symlinkSync } from "node:fs";

const LEDGER = "app/specs/handwritten/ledger.json";
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8" });

// A scratch git repository holding this tree as its one commit, the base the
// ratchet compares with.
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "hw-"));
  const files = run("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], ".").stdout.split("\0").filter(Boolean);
  for (const f of files) {
    try {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      cpSync(f, join(dir, f));
    } catch {
      // a file deleted in the working tree is not part of it
    }
  }
  // The producers' scratch copy and their cargo build stay in this tree's target/.
  mkdirSync("target", { recursive: true });
  symlinkSync(resolve("target"), join(dir, "target"));
  for (const args of [["init", "-q"], ["add", "-A"], ["-c", "user.name=hw", "-c", "user.email=hw@example.invalid", "commit", "-q", "-m", "base"]]) {
    assert.equal(run("git", args, dir).status, 0);
  }
  return dir;
}

const gate = (dir, ...extra) => run("python3", ["-I", "tools/handwritten/gate.py", "--root", dir, "--check", "--base", "HEAD", ...extra], ".");
const ledger = (dir) => JSON.parse(readFileSync(join(dir, LEDGER), "utf8"));
const hand = (dir) => ledger(dir).files.filter((e) => e.is === "hand" && e.lines > 0 && /\.mjs$/.test(e.path))[0].path;

test("the committed tree passes (HW-01)", () => {
  const r = run("python3", ["-I", "tools/handwritten/gate.py", "--check"], ".");
  assert.equal(r.status, 0, r.stderr);
});

test("refuses a new hand-written part", () => {
  const dir = scratch();
  writeFileSync(join(dir, "site/glue.mjs"), "export const glue = 1;\n");
  assert.equal(run("git", ["add", "site/glue.mjs"], dir).status, 0);
  // even with the ledger written for it, the base never had it
  assert.equal(run("python3", ["-I", "tools/handwritten/gate.py", "--root", dir, "--base", "HEAD"], ".").status, 1);
  const r = gate(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /site\/glue\.mjs: a new hand-written part|is stale/);
  rmSync(dir, { recursive: true, force: true });
});

test("refuses hand-written code that grew, even with its ledger rewritten", () => {
  const dir = scratch();
  const file = hand(dir);
  appendFileSync(join(dir, file), "export const grown = 1;\n");
  const l = ledger(dir);
  for (const e of l.files) if (e.path === file) e.lines += 1;
  writeFileSync(join(dir, LEDGER), `${JSON.stringify(l, null, 2)}\n`);
  const r = gate(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /hand-written lines grew/);
  rmSync(dir, { recursive: true, force: true });
});

test("refuses a stale ledger", () => {
  const dir = scratch();
  const file = hand(dir);
  writeFileSync(join(dir, file), readFileSync(join(dir, file), "utf8").split("\n").slice(1).join("\n"));
  const r = gate(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /is stale/);
  rmSync(dir, { recursive: true, force: true });
});

test("refuses upstream bytes edited in place", () => {
  const dir = scratch();
  const up = ledger(dir).files.find((e) => e.is === "upstream" && /\.mjs$/.test(e.path)).path;
  appendFileSync(join(dir, up), "// edited\n");
  const r = gate(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no longer the upstream bytes/);
  rmSync(dir, { recursive: true, force: true });
});

test("the full measure refuses a hand-written file the ledger calls generated", () => {
  const dir = scratch();
  const file = hand(dir);
  const l = ledger(dir);
  for (const e of l.files) if (e.path === file) { e.is = "generated"; e.from = "prompts"; delete e.class; delete e.lines; }
  writeFileSync(join(dir, LEDGER), `${JSON.stringify(l, null, 2)}\n`);
  assert.equal(gate(dir).status, 0, "the quick check trusts the ledger's producer claims; the full one must not");
  const r = gate(dir, "--full");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /is stale/);
  rmSync(dir, { recursive: true, force: true });
});
