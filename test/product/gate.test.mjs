// The page gates' own decisions (PD-01, PD-02), each against a planted defect.
// PD-03, the product record's gate, is the LexLean program generators/product:
// its acceptance vectors are its planted defects, replayed by every build.
// usage: node --test test/product/gate.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

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
