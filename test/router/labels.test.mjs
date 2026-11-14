// The labels of an invented, real-shaped mailbox and calendar, read the way
// the page reads them (site/card.mjs readItem with site/read/read.mjs), then
// taken apart and labeled through the router (site/router/labels.mjs). The
// router's decisions come from the generated tree, which tools/facet/gen.py
// holds to the compiled guest. Every quality measure of the product record
// whose gate is this file is computed here and held to its own threshold.
// usage: node test/router/labels.test.mjs
import assert from "node:assert/strict";
import { judge, FIELDS, GUARANTEES } from "../../site/router/table.mjs";
import { learn, labelAll } from "../../site/router/labels.mjs";
import { readItem, useReader } from "../../site/card.mjs";
import * as reader from "../../site/read/read.mjs";
import { load } from "../../tools/specs/record.mjs";
import { corpus } from "./corpus.mjs";

const GATE = "test/router/labels.test.mjs";
const product = load("app/specs/product/spec.json");
useReader(reader);

const asked = [];
const line = async (text) => {
  const [facet, ...rest] = text.split(" ");
  assert.equal(facet, "router", "labels ask only the router facet");
  asked.push(rest.join(" "));
  return judge(Object.fromEntries(FIELDS.map(([name], i) => [name, rest[i]])));
};
const me = { names: ["Robin Vale"], addresses: ["robin.vale@example.net"] };
const encoder = new TextEncoder();
const itemsOf = () => corpus.map(({ media, raw }, i) => readItem({ address: `a${i}`, outcome: "restore", bytes: encoder.encode(raw), meta: { about: { media, domain: 4, at: Date.UTC(2026, 10, 1) + i } } }));

// Time behaviour, from a cold start, over ten mailboxes' worth of items.
const many = Array.from({ length: 10 }, () => corpus).flat();
const started = performance.now();
const bulk = many.map(({ media, raw }, i) => readItem({ address: `m${i}`, outcome: "restore", bytes: encoder.encode(raw), meta: { about: { media, domain: 4, at: i } } }));
await labelAll(bulk, { line, halted: () => "no", me });
const ms = performance.now() - started;

const items = itemsOf();
await labelAll(items, { line, halted: () => "no", me, now: Date.UTC(2026, 10, 14) });

const wrong = { kind: [], party: [] };
items.forEach((item, i) => {
  const { expect } = corpus[i];
  const label = item.labels;
  if (label?.kind !== expect.kind) wrong.kind.push(`${item.title || item.body.slice(0, 30)}: ${label?.kind} (a person says ${expect.kind})`);
  const names = (label?.parties ?? []).map((p) => p.name).sort();
  if (JSON.stringify(names) !== JSON.stringify([...expect.parties].sort())) wrong.party.push(`${item.title || item.body.slice(0, 30)}: ${names.join(", ") || "no one"} (a person says ${expect.parties.join(", ") || "no one"})`);
});
const share = (bad) => Math.floor((100 * (items.length - bad.length)) / items.length);
// What each message a person wrote says first, against what a person reads as its first sentence.
const leads = items.map((item, i) => [item, corpus[i].expect.lead]).filter(([, lead]) => lead);
const wrongLead = leads.filter(([item, lead]) => item.labels?.lead !== lead).map(([item, lead]) => `${item.title}: ${JSON.stringify(item.labels?.lead)} (a person reads ${JSON.stringify(lead)})`);

// What the content taught the readers.
const learned = learn(itemsOf());
const topicsShown = items.filter((item) => item.labels?.topics.length).length;
const measured = {
  "kind-accuracy": share(wrong.kind),
  "party-accuracy": share(wrong.party),
  "unlabeled-items": items.filter((item) => !item.labels).length,
  "labeling-ms-per-100": Math.ceil((ms * 100) / many.length),
  "topic-coverage": Math.floor((100 * topicsShown) / items.length),
  "lead-accuracy": Math.floor((100 * (leads.length - wrongLead.length)) / leads.length),
};
console.log(`labels: ${items.length} items; ${JSON.stringify(measured)}; ${learned.people.length} people and ${learned.topics.size} topics learned`);
if (wrong.kind.length) console.log(`  kind: ${wrong.kind.join("\n        ")}`);
if (wrong.party.length) console.log(`  party: ${wrong.party.join("\n         ")}`);
if (wrongLead.length) console.log(`  lead: ${wrongLead.join("\n        ")}`);

// Each measure this file is named the gate of, against its record's own threshold.
let held = 0;
for (const requirement of product.quality) {
  for (const m of requirement.measures) {
    if (m.gate !== GATE) continue;
    assert.ok(m.key in measured, `${requirement.key} measure ${m.key} names this gate, which does not compute it`);
    const value = measured[m.key];
    if (m.direction === "atLeast") assert.ok(value >= m.threshold, `${requirement.key} ${m.key}: ${value} is below ${m.threshold}`);
    else assert.ok(value <= m.threshold, `${requirement.key} ${m.key}: ${value} is above ${m.threshold}`);
    held += 1;
  }
}
assert.ok(held >= Object.keys(measured).length, "every measure computed here is held by a quality requirement");

// The content extends the readers: a topic the person's content keeps using is
// known, and a person who wrote is found in a note that names them.
assert.ok(learned.topics.has("reunion") && learned.topics.has("garden"), "the words the content keeps using are its topics");
assert.ok(!learned.topics.has("mara"), "a person's name is a person, not a topic");
const note = items.find((item) => item.body === "Ask Mara about the book club pick");
assert.deepEqual(note.labels.parties.map((p) => p.name), ["Mara Quill"], "a note names a person the content knows");
assert.ok(note.labels.topics.includes("book") || note.labels.topics.includes("club"), "a note is about what the content talks about");

// A planted defect: a router that never lets the kind reader see the parts.
// The kind measure must fall below its own threshold, or it holds nothing.
const blind = itemsOf();
await labelAll(blind, { line: async (text) => (text.includes(" shape kind ") ? "skip" : line(text)), halted: () => "no", me });
const blindKind = Math.floor((100 * blind.filter((item, i) => item.labels?.kind === corpus[i].expect.kind).length) / blind.length);
const kindMeasure = product.quality.flatMap((q) => q.measures).find((m) => m.key === "kind-accuracy");
assert.ok(blindKind < kindMeasure.threshold, `the kind measure misses a router that hides an item's parts (${blindKind})`);

// The halt switch: nothing is labeled.
const stopped = itemsOf();
await labelAll(stopped, { line, halted: () => "yes", me });
assert.ok(stopped.every((item) => item.labels === null), "halted, nothing is labeled");

// A sealed item is never read.
const sealed = readItem({ address: "s", outcome: "hashonly", bytes: new Uint8Array(), meta: { about: { media: "message" } } });
await labelAll([sealed], { line, halted: () => "no" });
assert.equal(sealed.labels, null);

// Every decision taken keeps every guarantee of the router.
for (const request of new Set(asked)) {
  const fields = Object.fromEntries(FIELDS.map(([name], i) => [name, request.split(" ")[i]]));
  const answer = judge(fields);
  for (const g of GUARANTEES) {
    if (!g.when.every(([f, v]) => fields[f] === v)) continue;
    if (g.always) assert.equal(answer, g.always, `${g.id} for ${request}`);
    if (g.never) assert.ok(!g.never.includes(answer), `${g.id} for ${request}`);
  }
}
console.log(`labels: ${held} quality measures held`);
