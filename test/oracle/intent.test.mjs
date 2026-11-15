// What a line asks of the owner, as the router reads it (PROVIDERS.intent),
// over the AMI Meeting Corpus's dialogue acts in its scenario test partition
// (pinned in app/specs/oracle/spec.json and taken into test/oracle/corpus.json):
// each act its annotators marked Inform is a fact, an Elicit act a question, and
// a Suggest or an Offer a task, the general-purpose functions of ISO 24617-2.
// The router reads an untimed happening as an event; ISO 24617-2 and AMI hold
// it as information provided, so an event is read here as a fact.
// QR-16's thresholds are its quality record's.
// usage: node --test test/oracle/intent.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FIELDS, judge } from "../../site/router/table.mjs";
import { route } from "../../site/router/router.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const record = read("../../app/specs/product/quality/QR-16.json");
const threshold = Object.fromEntries(record.measures.map((m) => [m.key, m.threshold]));
const acts = read("corpus.json").corpus.filter((e) => e.kind === "act");
const line = async (text) => judge(Object.fromEntries(FIELDS.map(([name], i) => [name, text.split(" ")[i + 1]])));
const AS_ISO = { event: "fact" };

test("the corpus holds the AMI test partition's acts of every intent", () => {
  for (const intent of ["question", "task", "fact"]) assert.ok(acts.some((a) => a.expect.intent === intent), `no ${intent} act`);
});

test("the router reads what each act asks as AMI's annotators marked it (QR-16)", async () => {
  const held = { question: [0, 0], task: [0, 0], fact: [0, 0] };
  for (const act of acts) {
    const mapped = await route({ source: "note", values: { text: act.expect.text }, line, halted: () => "no", now: 0 });
    const got = AS_ISO[mapped.intent] ?? mapped.intent;
    const tally = held[act.expect.intent];
    tally[1] += 1;
    if (got === act.expect.intent) tally[0] += 1;
  }
  const percent = ([hit, of]) => Math.floor((100 * hit) / of);
  const found = { "question-found": percent(held.question), "task-found": percent(held.task), "fact-found": percent(held.fact) };
  console.log(`# QR-16 ${Object.entries(found).map(([k, v]) => `${k} ${v}%`).join(", ")} over ${acts.length} acts`);
  for (const [key, value] of Object.entries(found)) assert.ok(value >= threshold[key], `"${key}": ${value}% < ${threshold[key]}%`);
});
