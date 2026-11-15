// What a line asks of the owner, as the router reads it (PROVIDERS.intent),
// over the AMI Meeting Corpus's dialogue acts in its scenario test partition
// (pinned in app/specs/oracle/spec.json and taken into test/oracle/corpus.json):
// each act its annotators marked Inform is a fact, an Elicit act a question, and
// a Suggest or an Offer a task, the general-purpose functions of ISO 24617-2.
// The router reads an untimed happening as an event; ISO 24617-2 and AMI hold
// it as information provided, so an event is read here as a fact.
// The router reads them as the page does once its meaning model has opened:
// each act's meaning vector from the compiled model, in a browser on the built
// site, so the intent head (PROVIDERS.intent.head) reads the tasks.
// The same reading is measured on DialogBank, ISO 24617-2 annotated by its own
// editors, where its acts are supplied (DIALOGUE_HELD); no gate holds it.
// QR-16's thresholds are its quality record's.
// INTENT_FIT=<acts> instead fits the head on AMI's scenario training partition
// (written outside the repository by tools/oracle/gen.py --fit-acts): a logistic
// regression, task against fact, over the meaning vectors of the acts the
// question rule does not take, by full-batch gradient descent from zero, written
// to providers.intent.head in the router spec. Owed to LexLean, once a
// generator's request can hold the vectors.
// usage: PAGE_SITE=<built site> [INTENT_FIT=<acts>] [DIALOGUE_HELD=<acts>] node --test test/oracle/intent.test.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { FIELDS, judge, PROVIDERS } from "../../site/router/table.mjs";
import { route } from "../../site/router/router.mjs";
import { asksQuestion } from "../../site/router/features.mjs";
import { serve } from "./examples.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const record = read("../../app/specs/product/quality/QR-16.json");
const threshold = Object.fromEntries(record.measures.map((m) => [m.key, m.threshold]));
const { corpus } = read("corpus.json");
const acts = corpus.filter((e) => e.kind === "act").map((e) => e.expect);
const line = async (text) => judge(Object.fromEntries(FIELDS.map(([name], i) => [name, text.split(" ")[i + 1]])));
const AS_ISO = { event: "fact" };
const models = read("../../app/specs/models/spec.json");

// Each act's meaning vector, from the compiled model on the built page.
async function meanings(texts) {
  const { base, close } = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/`);
    const vectors = await page.evaluate(async ({ base, spec, texts }) => {
      const { specDecider } = await import(`${base}/r4/decide.mjs`);
      const { meaningReader } = await import(`${base}/router/meaning.mjs`);
      const decide = specDecider(spec);
      const reader = meaningReader({ line: async (l) => decide(l.replace(/^model /, "")).outcome });
      const v = await reader.embed(texts);
      return v && v.map((x) => Array.from(x));
    }, { base, spec: models, texts });
    assert.ok(vectors, "the meaning model opened");
    return new Map(texts.map((t, i) => [t, vectors[i]]));
  } finally {
    await browser.close();
    close();
  }
}

test("the corpus holds the AMI test partition's acts of every intent", () => {
  for (const intent of ["question", "task", "fact"]) assert.ok(acts.some((a) => a.intent === intent), `no ${intent} act`);
});

// The percent of each intent's acts the router reads as their annotators marked them.
async function found(acts, keys) {
  const vectors = await meanings([...new Set(acts.map((a) => a.text))]);
  const learned = { meaning: { read: async (text) => vectors.get(text) ?? null } };
  const held = { question: [0, 0], task: [0, 0], fact: [0, 0] };
  for (const act of acts) {
    const mapped = await route({ source: "note", values: { text: act.text }, line, halted: () => "no", now: 0, learned });
    held[act.intent][1] += 1;
    if ((AS_ISO[mapped.intent] ?? mapped.intent) === act.intent) held[act.intent][0] += 1;
  }
  const percent = Object.entries(held).map(([intent, [hit, of]]) => [keys[intent], Math.floor((100 * hit) / of)]);
  console.log(`# QR-16 ${percent.map(([k, v]) => `${k} ${v}%`).join(", ")} over ${acts.length} acts`);
  for (const [key, value] of percent) assert.ok(value >= (threshold[key] ?? 0), `"${key}": ${value}% < ${threshold[key]}%`);
}

test("the router reads what each act asks as AMI's annotators marked it (QR-16)", { timeout: 1800000 }, async () => {
  assert.equal(PROVIDERS.intent.head?.model, PROVIDERS.meaning.model, "the intent head reads the compiled meaning model's vectors");
  await found(acts, { question: "question-found", task: "task-found", fact: "fact-found" });
});

// DialogBank's dialogues are held out of the repository and no gate downloads
// them (the oracle spec says why), so this runs only where DIALOGUE_HELD names
// the acts (tools/oracle/gen.py --fetch --held), checked against the count and
// SHA-256 the corpus carries. Where it does not run it says so on the job's
// summary: nothing here is a threshold.
test("the router reads what each act asks as DialogBank's gold ISO 24617-2 annotation marks it", { timeout: 1800000 }, async (t) => {
  const kept = corpus.find((e) => e.id === "dialogbank-held").expect;
  if (!process.env.DIALOGUE_HELD) {
    const why = `DialogBank's ${kept.acts} acts are not enforced here: they are not in the repository and no gate downloads them`;
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${why}\n`);
    return t.skip(why);
  }
  const text = readFileSync(process.env.DIALOGUE_HELD, "utf8");
  assert.equal(createHash("sha256").update(text).digest("hex"), kept.sha256, "the dialogues are the ones the corpus counts");
  const gold = text.trim().split("\n").map((l) => JSON.parse(l));
  await found(gold.filter((a) => a.intent), { question: "dialogue question-found", task: "dialogue task-found", fact: "dialogue fact-found" });
  const debt = read("../../app/specs/oracle/spec.json").sources.find((s) => s.key === "dialogbank").unenforced.map((u) => u.what);
  console.log(`# DialogBank, not enforced: ${debt.map((what) => (what in kept ? `${what} on ${kept[what]} acts` : what)).join(", ")}; ${gold.length - kept.intents} of ${gold.length} acts have no intent`);
});

test("the intent head is fit on the training partition", { skip: !process.env.INTENT_FIT, timeout: 7200000 }, async () => {
  const train = readFileSync(process.env.INTENT_FIT, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((a) => a.intent !== "question" && !asksQuestion(a.text));
  const vectors = await meanings(train.map((a) => a.text));
  const [STEPS, RATE, DECAY] = [2000, 4, 1e-4];
  const xs = train.map((a) => vectors.get(a.text));
  const y = train.map((a) => (a.intent === "task" ? 1 : 0));
  const w = new Float64Array(xs[0].length);
  let b = 0;
  for (let step = 0; step < STEPS; step += 1) {
    const g = new Float64Array(w.length);
    let gb = 0;
    xs.forEach((v, i) => {
      const e = 1 / (1 + Math.exp(-v.reduce((z, x, k) => z + w[k] * x, b))) - y[i];
      v.forEach((x, k) => { g[k] += e * x; });
      gb += e;
    });
    w.forEach((_, k) => { w[k] -= RATE * (g[k] / xs.length + DECAY * w[k]); });
    b -= (RATE * gb) / xs.length;
  }
  const url = new URL("../../app/specs/router/spec.json", import.meta.url);
  const spec = JSON.parse(readFileSync(url, "utf8"));
  const round = (x) => Number(x.toFixed(4));
  Object.assign(spec.providers.intent.head, { model: spec.providers.meaning.model, fit: { source: "ami", acts: xs.length, tasks: y.filter(Boolean).length, steps: STEPS, rate: RATE, decay: DECAY }, bias: round(b), weights: Array.from(w, round) });
  writeFileSync(url, `${JSON.stringify(spec, null, 2)}\n`);
});
