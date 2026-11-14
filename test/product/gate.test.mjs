// PD-03: tools/product/gate.py passes the committed product record and
// refuses each planted defect with its reason.
// usage: node --test test/product/gate.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { load } from "../../tools/specs/record.mjs";

const read = (path) => load(path);
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
  ["a new place with no viewpoint", (f) => { const { viewpoint, ...place } = f.surface.places[0]; f.surface.places.push({ ...place, key: "inbox", name: "Inbox" }); }, /surface place 'inbox' has no viewpoint/],
  ["a new word with no viewpoint", (f) => { f.surface.words["device.sync"] = "Sync now"; }, /surface word 'device.sync' has no viewpoint/],
  ["a person place that offers a system act", (f) => { f.product.surface.acts.note = "system"; }, /person place '[a-z]+' offers act 'note'/],
  ["a new root facet with no product entry", (f) => f.coherence.facets.push({ key: "probe", line: "probe", sealed: "planted" }), /facet 'probe' is in the Prism but not in the product record/],
  ["a facet that serves no journey", (f) => { f.product.facets.kappa.serves = []; }, /facet 'kappa' serves no journey/],
  ["a facet in the person's view", (f) => { f.product.facets.r4.view = "person"; }, /facet 'r4' is a back-end part/],
  ["a facet serving a journey that does not exist", (f) => { f.product.facets.holon.serves = ["J99"]; }, /serves J99, which is not a journey/],
  ["a journey with no measure", (f) => { delete f.product.journeys[2].measure; }, /journey J2 has no usability measure/],
  ["a journey with an unknown status", (f) => { f.product.journeys[0].status = "done"; }, /journey J0 has status 'done'/],
  ["a journey without a done-state", (f) => { f.product.journeys[4].done = ""; }, /journey J4 has no done/],
  ["a viewpoint placed in both the surface and the record", (f) => { f.product.surface.places = { [f.surface.places[0].key]: f.surface.places[0].viewpoint }; }, /surface place '[a-z]+' carries its viewpoint in the surface model; remove the copy/],
  ["a viewpoint in the surface that is neither", (f) => { f.surface.settings[0].viewpoint = "both"; }, /has viewpoint 'both'/],
  ["a person setting the Prism does not require", (f) => { f.product.requires.unrequired = []; }, /setting 'backup' is in the person's view but the Prism does not require it/],
  ["a required setting shown by a section the surface does not have", (f) => { f.product.requires.settings[1].section = "connections"; }, /is shown by section 'connections', which the surface does not have/],
  ["a person setting in a required section is required", (f) => { f.product.requires.settings[1].section = "storage"; }, /setting 'backup' is listed as unrequired but no longer is/],
  ["a journey the record lost while its walk remains", (f) => { f.product.journeys = f.product.journeys.filter((j) => j.key !== "J9"); }, /walk 'j9' in test\/product\/journeys.mjs belongs to no journey/],
  ["a stale unrequired setting", (f) => { f.product.requires.unrequired.push("quiet"); }, /setting 'quiet' is listed as unrequired but no longer is/],
  ["a required setting that works but shows nowhere", (f) => { f.product.requires.settings[0].setting = null; f.product.requires.settings[0].status = "works"; }, /required setting 'identity' works but names no surface setting or section/],
  ["a required setting shown by a setting that does not exist", (f) => { f.product.requires.settings[1].setting = "accounts"; }, /shown by setting 'accounts', which the surface does not have/],
  ["debt that is a person's word", (f) => f.product.debt.push("Today"), /debt 'Today' is not a word of the system view/],
  ["a feature serving no journey", (f) => { f.product.features[0].journeys = []; }, /feature F-01 serves no journey/],
  ["a feature serving a journey that does not exist", (f) => { f.product.features[0].journeys = ["J99"]; }, /feature F-01 serves J99, which is not a journey/],
  ["a feature realized by an export that is not there", (f) => { f.product.features[1].calls.push("site/router/router.mjs#reroute"); }, /feature F-02 is realized by site\/router\/router.mjs#reroute, which site\/router\/router.mjs does not export/],
  ["a feature realized by a file that is not there", (f) => { f.product.features[1].calls = ["site/router/nowhere.mjs#route"]; }, /feature F-02 is realized by site\/router\/nowhere.mjs, which does not exist/],
  ["a feature with no acceptance suite", (f) => { f.product.features[2].acceptance = []; }, /feature F-03 names no suite that accepts it/],
  ["a feature held by no quality requirement", (f) => { f.product.features[3].quality = []; }, /feature F-04 is held by no quality requirement/],
  ["a quality requirement outside ISO/IEC 25010", (f) => { f.product.quality[0].characteristic = "delight"; }, /names characteristic 'delight', which ISO\/IEC 25010 does not have/],
  ["a subcharacteristic of another characteristic", (f) => { f.product.quality[2].subcharacteristic = "learnability"; }, /names subcharacteristic 'learnability', which is not one of performance efficiency/],
  ["a quality requirement that holds no feature", (f) => { for (const x of f.product.features) x.quality = x.quality.filter((q) => q !== "QR-03"); }, /quality requirement QR-03 holds no feature/],
  ["a quality requirement with no measure", (f) => { f.product.quality[1].measures = []; }, /quality requirement QR-02 has no measure/],
  ["a measure with no direction", (f) => { f.product.quality[0].measures[0].direction = "about"; }, /has direction 'about', not atLeast or atMost/],
  ["a measure with no threshold", (f) => { delete f.product.quality[0].measures[1].threshold; }, /quality measure QR-01\/party-accuracy has no threshold/],
  ["a measure held by a gate that is not there", (f) => { f.product.quality[0].measures[0].gate = "test/router/missing.test.mjs"; }, /is held by gate 'test\/router\/missing.test.mjs', which does not exist/],
  ["a measure its gate never computes", (f) => { f.product.quality[0].measures[0].key = "kind-recall"; }, /quality measure QR-01\/kind-recall is held by test\/router\/labels.test.mjs, which never computes it/],
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
