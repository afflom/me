// RT-01: the vocabulary register the page reads (site/vocab/register.json)
// agrees, row for row, with the Lean registers it was generated beside
// (app/src/Foundation/Vocab/V1). The Lean modules hold indices only; the page
// needs the names, so the two must list the same rows in the same order.
// Usage: node tools/route/check-register.mjs [register.json] [app/src]
import { readFileSync } from "node:fs";

const registerPath = process.argv[2] ?? "site/vocab/register.json";
const src = process.argv[3] ?? "app/src";
const register = JSON.parse(readFileSync(registerPath, "utf8"));
const schemaOrg = readFileSync(`${src}/Foundation/Vocab/V1/SchemaOrg.lex.tex`, "utf8");
const crosswalk = readFileSync(`${src}/Foundation/Vocab/V1/Crosswalk.lex.tex`, "utf8");
const design = readFileSync(`${src}/Foundation/Me/V1/Model.lex.tex`, "utf8");

const failures = [];
const fail = (message) => failures.push(message);

const nats = (term) => [...term.matchAll(/cons (\d+)/g)].map((m) => Number(m[1]));
const records = (text, name) =>
  [...text.matchAll(new RegExp(`record ${name} \\{([^}]*)\\}`, "g"))].map((m) => {
    const fields = {};
    for (const part of m[1].split(/, (?=\w+ := )/)) {
      const [key, value] = part.split(" := ");
      fields[key] = /^\d+$/.test(value) ? Number(value) : nats(value);
    }
    return fields;
  });

const types = records(schemaOrg, "VocabTypeRow");
const properties = records(schemaOrg, "VocabPropertyRow");
const terms = records(crosswalk, "CrosswalkTermRow");
const so = register.schemaorg;

if (register.spec !== "me/vocabulary-register/1") fail(`spec is ${register.spec}`);
if (so.release !== "30.1") fail(`schema.org release is ${so.release}`);
const counts = [
  ["types", so.types.length, types.length, 939],
  ["properties", so.properties.length, properties.length, 1538],
  ["crosswalk rows", register.crosswalk.length, terms.length, 1229],
];
for (const [what, page, lean, expected] of counts) {
  if (page !== expected || lean !== expected) fail(`${what}: page ${page}, Lean ${lean}, expected ${expected}`);
}

const typeIndex = new Map(so.types.map((t, i) => [t.id, i]));
const propertyIndex = new Map(so.properties.map((p, i) => [p.id, i]));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const asIndices = (list, index) => list.map((x) => (typeof x === "number" ? x : index.get(x)));

types.forEach((row, i) => {
  if (row.index !== i) fail(`Lean type row ${i} has index ${row.index}`);
  const page = so.types[i];
  if (!page) return;
  if (page.status !== row.status) fail(`type ${page.id}: status ${page.status} vs Lean ${row.status}`);
  if (!same(asIndices(so.typeParents[i], typeIndex), row.parents)) fail(`type ${page.id}: parents differ`);
});
properties.forEach((row, i) => {
  if (row.index !== i) fail(`Lean property row ${i} has index ${row.index}`);
  const page = so.properties[i];
  if (!page) return;
  if (page.status !== row.status) fail(`property ${page.id}: status differs`);
  if (!same(asIndices(so.propertyDomains[i], typeIndex), row.domains)) fail(`property ${page.id}: domains differ`);
  if (!same(asIndices(so.propertyRanges[i], typeIndex), row.ranges)) fail(`property ${page.id}: ranges differ`);
});

// Kind and match are small enumerations; each page word must map to exactly
// one Lean number, and the vocabulary key to its position in `vocabularies`.
const bijection = (label) => {
  const forward = new Map();
  const backward = new Map();
  return (word, number, where) => {
    if ((forward.has(word) && forward.get(word) !== number) || (backward.has(number) && backward.get(number) !== word)) {
      fail(`${where}: ${label} ${word} is ${number}, inconsistent`);
    }
    forward.set(word, number);
    backward.set(number, word);
  };
};
const kind = bijection("kind");
const match = bijection("match");
const vocabularyIndex = new Map(register.vocabularies.map((v, i) => [v.key, i]));
register.crosswalk.forEach((page, i) => {
  const row = terms[i];
  if (!row) return;
  const where = `crosswalk row ${i} (${page.vocabulary} ${page.term})`;
  if (vocabularyIndex.get(page.vocabulary) !== row.vocabulary) fail(`${where}: vocabulary differs`);
  kind(page.kind, row.kind, where);
  match(page.match, row.match, where);
  const target = typeIndex.has(page.target) && row.kind === 0 ? typeIndex.get(page.target) : propertyIndex.get(page.target) ?? typeIndex.get(page.target);
  if (target !== row.target) fail(`${where}: target ${page.target} is ${target}, Lean ${row.target}`);
});

const leanDomains = [...design.matchAll(/then "([a-z]+)" else/g)].map((m) => m[1]);
const domainKeys = register.domains.map((d) => d.key);
const domainWords = design.match(/name: designDomainKey,[\s\S]*?\n\}/)?.[0] ?? "";
const keysInLean = [...domainWords.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
if (!same(domainKeys, keysInLean) || domainKeys.length !== 12) fail(`domains: page ${domainKeys} vs Lean ${keysInLean}`);
if (leanDomains.length === 0) fail("no domain words found in the design model");

for (const source of register.sources) {
  if (!/^[0-9a-f]{64}$/.test(source.sha256 ?? "")) fail(`source ${source.file} is not pinned by sha256`);
}
if (register.sources.length !== 13) fail(`expected 13 pinned sources, found ${register.sources.length}`);

if (failures.length) {
  console.error(`RT-01: ${failures.length} disagreement(s)\n${failures.slice(0, 20).join("\n")}`);
  process.exit(1);
}
console.log(`RT-01: ${types.length} types, ${properties.length} properties, ${terms.length} crosswalk rows, 12 domains, ${register.sources.length} pinned sources agree`);
