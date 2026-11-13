// PD-03: tools/product/gate.py passes the committed product record and
// refuses each planted defect with its reason.
// usage: node --test test/product/gate.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const PRODUCT = "app/specs/product/spec.json";
const SURFACE = "app/specs/surface/spec.json";
const COHERENCE = "app/specs/coherence/spec.json";
const WALKS = "test/product/journeys.mjs";

function gate(edit = {}) {
  const dir = mkdtempSync(join(tmpdir(), "product-"));
  const files = { product: read(PRODUCT), surface: read(SURFACE), coherence: read(COHERENCE) };
  let walks = readFileSync(WALKS, "utf8");
  edit.json?.(files);
  if (edit.walks) walks = edit.walks(walks);
  const paths = ["product", "surface", "coherence"].map((name) => { const p = join(dir, `${name}.json`); writeFileSync(p, JSON.stringify(files[name])); return p; });
  const w = join(dir, "journeys.mjs");
  writeFileSync(w, walks);
  return spawnSync("python3", ["-I", "tools/product/gate.py", ...paths, w], { encoding: "utf8" });
}

test("the committed product record passes (PD-03)", () => {
  const run = gate();
  assert.equal(run.status, 0, run.stderr);
});

const DEFECTS = [
  ["a new place with no viewpoint", (f) => f.surface.places.push({ ...f.surface.places[0], key: "inbox", name: "Inbox" }), /surface place 'inbox' has no viewpoint/],
  ["a new word with no viewpoint", (f) => { f.surface.words["device.sync"] = "Sync now"; }, /surface word 'device.sync' has no viewpoint/],
  ["a person place that offers a system act", (f) => { f.product.surface.acts.note = "system"; }, /person place '[a-z]+' offers act 'note'/],
  ["a new root facet with no product entry", (f) => f.coherence.facets.push({ key: "uorc", line: "uorc", sealed: "planted" }), /facet 'uorc' is in the Prism but not in the product record/],
  ["a facet that serves no journey", (f) => { f.product.facets.kappa.serves = []; }, /facet 'kappa' serves no journey/],
  ["a facet in the person's view", (f) => { f.product.facets.r4.view = "person"; }, /facet 'r4' is a back-end part/],
  ["a facet serving a journey that does not exist", (f) => { f.product.facets.holon.serves = ["J9"]; }, /serves J9, which is not a journey/],
  ["a journey with no measure", (f) => { delete f.product.journeys[2].measure; }, /journey J2 has no usability measure/],
  ["a journey with an unknown status", (f) => { f.product.journeys[0].status = "done"; }, /journey J0 has status 'done'/],
  ["a journey without a done-state", (f) => { f.product.journeys[4].done = ""; }, /journey J4 has no done/],
  ["a viewpoint placed in both the surface and the record", (f) => { f.surface.places[0].viewpoint = "person"; }, /surface place 'today' carries its viewpoint in the surface model; remove the copy/],
  ["a viewpoint in the surface that is neither", (f) => { f.surface.settings[0].viewpoint = "both"; delete f.product.surface.settings[f.surface.settings[0].key]; }, /has viewpoint 'both'/],
  ["debt that is a person's word", (f) => f.product.debt.push("Today"), /debt 'Today' is not a word of the system view/],
];
for (const [name, json, why] of DEFECTS) {
  test(`the gate refuses ${name} (PD-03)`, () => {
    const run = gate({ json });
    assert.notEqual(run.status, 0, `${name} passed`);
    assert.match(run.stderr, why);
  });
}

test("the gate refuses a journey whose walk is not defined (PD-03)", () => {
  const run = gate({ walks: (source) => source.replace("async j7(page)", "async j7later(page)") });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /journey J7 names walk 'j7', which test\/product\/journeys.mjs does not define/);
});

// The page gates' own decisions, each against a planted defect.
const { leaks, ratchet, verdict, systemWords } = await import("./harness.mjs");

test("a system word on the screen that the debt does not list fails, and so does listed debt that is gone (PD-02)", () => {
  const words = systemWords();
  assert.ok(words.has("Boundary") && words.has("Add files") && !words.has("Today"), "the system words come from the record");
  const shown = leaks(["Today", "Settings: Boundary", "Add files", "Lunch on Thursday?"], words);
  assert.deepEqual([...shown].sort(), ["Add files", "Boundary"]);
  assert.deepEqual(ratchet(shown, ["Add files", "Boundary"]), { fresh: [], gone: [] });
  assert.deepEqual(ratchet(shown, ["Add files"]).fresh, ["Boundary"], "a planted leak is new");
  assert.deepEqual(ratchet(shown, ["Add files", "Boundary", "Export"]).gone, ["Export"], "a fixed leak left in the debt is gone");
  assert.equal(leaks(["Mention Boundaryless"], words).size, 0, "a word inside another word is not a leak");
});

test("a working journey that breaks fails, and so does one that works unrecorded (PD-01)", () => {
  const row = (status, ok, back = ok) => ({ journey: { key: "J9", status }, fresh: { ok }, back: { ok: back } });
  assert.equal(verdict([row("works", true)]).broken.length, 0);
  assert.equal(verdict([row("works", false)]).broken.length, 1, "a planted break in a working journey");
  assert.equal(verdict([row("works", true, false)]).broken.length, 1, "a working journey that breaks only for a returning browser");
  assert.equal(verdict([row("not yet", true)]).unrecorded.length, 1, "a journey that works but is not recorded");
  assert.equal(verdict([row("not yet", false)]).unrecorded.length + verdict([row("not yet", false)]).broken.length, 0);
});
