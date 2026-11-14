// Each site the Prism reads has a contract (app/specs/source/contracts.json):
// the site's own terms quoted, the routes it allows live, history from the
// site's own download, every threat answered, and a rest with a step for the
// owner when the site challenges. tools/source/gen.py refuses a declaration
// that reads outside its contract; these are the refusals it must make.
// usage: node --test test/source/contract.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CONTRACTS, SERVICES } from "../../site/source/declared.mjs";

const contracts = JSON.parse(readFileSync("app/specs/source/contracts.json", "utf8"));
const check = (file) => spawnSync("python3", ["-I", "tools/source/gen.py", "--check", ...(file ? ["--contracts", file] : [])], { encoding: "utf8" });
const dir = mkdtempSync(join(tmpdir(), "prism-contract-"));
const altered = (name, change) => {
  const copy = structuredClone(contracts);
  change(copy, (key) => copy.sites.find((s) => s.service === key));
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify(copy));
  return check(file);
};

test("the declared services and their contracts are current and agree", () => {
  const run = check();
  assert.equal(run.status, 0, run.stderr || run.stdout);
  for (const s of SERVICES) assert.ok(CONTRACTS[s.key], `${s.key} has no contract`);
});

test("a declared route stays within its site's contract", () => {
  for (const s of SERVICES) {
    if (s.seen) assert.ok(CONTRACTS[s.key].live.includes("seen"), `${s.key} reads what its tab shows outside its contract`);
    if (s.own?.length) assert.ok(CONTRACTS[s.key].live.includes("own"), `${s.key} reads its own pages outside its contract`);
  }
});

test("a site whose terms bar browser extensions is read from its download only", () => {
  const run = altered("linkedin-live", (_, site) => { site("linkedin").live = ["seen"]; site("linkedin").backoff = { on: [429], hours: 24, step: "Open LinkedIn" }; });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /linkedin terms bar the extension/);
});

test("a contract never allows a route PrismSource refuses", () => {
  const run = altered("discord-own", (_, site) => { site("discord").live = ["seen", "own"]; });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /discord contract allows own live, which PrismSource refuses/);
});

test("a live site rests and shows the owner a step when it challenges", () => {
  const run = altered("no-backoff", (_, site) => { site("whatsapp").backoff = null; });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /whatsapp reads live, so it must rest/);
});

test("a declared route the contract does not allow is refused", () => {
  const run = altered("gmail-seen", (_, site) => { site("gmail").live = ["own"]; });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /gmail reads by \['seen'\], which its contract does not allow/);
});

test("every contract quotes its site's own words and answers every threat", () => {
  for (const name of ["no-terms", "no-threat"]) {
    const run = altered(name, (copy, site) => { if (name === "no-terms") site("discord").terms = []; else site("gmail").threats = site("gmail").threats.slice(1); });
    assert.notEqual(run.status, 0, name);
  }
  for (const c of contracts.sites) for (const t of c.terms) assert.ok(t.says.length > 10 && /^https:\/\//.test(t.url), `${c.service} ${t.section}`);
});
