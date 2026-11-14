// Records kept as parts (one file per journey or facet) read the same from
// Python and JavaScript, and a part whose key is not its file name is refused.
// usage: node --test test/specs/record.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { load } from "../../tools/specs/record.mjs";

const RECORDS = ["app/specs/product/spec.json", "app/specs/coherence/spec.json"];
const python = (path) => {
  const code = "import importlib.util,json,sys\ns=importlib.util.spec_from_file_location('r','tools/specs/record.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nprint(json.dumps(m.load(sys.argv[1])))";
  const run = spawnSync("python3", ["-I", "-c", code, path], { encoding: "utf8" });
  return { status: run.status, value: run.status === 0 ? JSON.parse(run.stdout) : null, stderr: run.stderr };
};

for (const path of RECORDS) {
  test(`${path} reads the same in both languages`, () => {
    const js = load(path);
    const py = python(path);
    assert.equal(py.status, 0, py.stderr);
    assert.deepEqual(js, py.value);
    assert.ok(Array.isArray(js.facets) || Object.keys(js.facets).length > 0);
  });
}

test("a part whose key is not its file name is refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "record-"));
  mkdirSync(join(dir, "journeys"));
  writeFileSync(join(dir, "spec.json"), JSON.stringify({ journeys: { parts: "journeys" } }));
  writeFileSync(join(dir, "journeys", "J1.json"), JSON.stringify({ key: "J2" }));
  assert.throws(() => load(join(dir, "spec.json")), /names key "J2"/);
  const py = python(join(dir, "spec.json"));
  assert.notEqual(py.status, 0);
  assert.match(py.stderr, /names key 'J2'/);
});

test("parts are ordered by key, J2 before J10", () => {
  const dir = mkdtempSync(join(tmpdir(), "record-"));
  mkdirSync(join(dir, "journeys"));
  writeFileSync(join(dir, "spec.json"), JSON.stringify({ journeys: { parts: "journeys" } }));
  for (const key of ["J10", "J2", "J0"]) writeFileSync(join(dir, "journeys", `${key}.json`), JSON.stringify({ key }));
  assert.deepEqual(load(join(dir, "spec.json")).journeys.map((j) => j.key), ["J0", "J2", "J10"]);
  assert.deepEqual(python(join(dir, "spec.json")).value.journeys.map((j) => j.key), ["J0", "J2", "J10"]);
});
