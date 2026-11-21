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
import { asksQuestion, plain } from "../../site/router/features.mjs";
import { answer } from "../../site/router/answer.mjs";
import { specDecider } from "../../site/r4/decide.mjs";
import { serve } from "./examples.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const threshold = Object.fromEntries(read("../../app/specs/product/quality/QR-16.json").measures.map((m) => [m.key, m.threshold]));
const { corpus } = read("corpus.json");
const acts = corpus.filter((e) => e.kind === "act").map((e) => e.expect);
const line = async (text) => judge(Object.fromEntries(FIELDS.map(([name], i) => [name, text.split(" ")[i + 1]])));

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
      const reader = meaningReader({ line: async (l) => specDecider(spec)(l.replace(/^model /, "")).outcome });
      const v = await reader.embed(texts);
      return v && v.map((x) => Array.from(x));
    }, { base, spec: read("../../app/specs/models/spec.json"), texts });
    assert.ok(vectors, "the meaning model opened");
    return new Map(texts.map((t, i) => [t, vectors[i]]));
  } finally {
    await browser.close();
    close();
  }
}

// The percent of each intent's acts the router reads as their annotators marked them; then, for
// each dimension head (PROVIDERS.intent.heads), the percent of that dimension's acts it reads as
// such and of all the other acts it leaves alone, as the router reads the act (route's `act`).
async function found(acts, keys) {
  const vectors = await meanings([...new Set(acts.flatMap((a) => [a.text, plain(a.text)]))]);
  const learned = { meaning: { read: async (text) => vectors.get(text) ?? null } };
  const held = { question: [0, 0], task: [0, 0], fact: [0, 0] };
  for (const act of acts) {
    const mapped = (act.mapped = await route({ source: "note", values: { text: act.text }, line, halted: () => "no", now: 0, learned }));
    if (act.intent) held[act.intent][Number(({ event: "fact" }[mapped.intent] ?? mapped.intent) === act.intent)] += 1;
  }
  // An act the router reads as feedback is taken as heard when a turn came before it, and only then (the Ask decision, app/specs/ask/spec.json).
  const nod = acts.find((a) => a.mapped.act === "autoFeedback" && a.mapped.intent === "fact" && a.mapped.start == null), ask = specDecider(read("../../app/specs/ask/spec.json"));
  for (const after of nod ? [1, null] : []) assert.equal((await answer(nod.text, { line: async (l) => (l.startsWith("ask ") ? ask(l.slice(4)).outcome : line(l)), halted: () => "no", meaning: learned.meaning, after })).sentences[0] === `${PROVIDERS.sentence.frames.heard}.`, Boolean(after), `“${nod.text}” after ${after}`);
  const percent = Object.entries(held).map(([intent, [missed, hit]]) => [keys[intent], Math.floor((100 * hit) / (missed + hit))]);
  for (const [name, head] of Object.entries(PROVIDERS.intent.heads)) {
    assert.equal(head.model, PROVIDERS.meaning.model, `the ${name} head reads the compiled meaning model's vectors`);
    const read = [[0, 0], [0, 0]];
    for (const act of acts) read[Number(act.dimension === name)][Number((act.mapped.act === name) === (act.dimension === name))] += 1;
    percent.push(...keys[name].map((key, i) => [key, Math.floor((100 * read[1 - i][1]) / (read[1 - i][0] + read[1 - i][1]))]));
  }
  console.log(`# QR-16 ${percent.map(([k, v]) => `${k} ${v}%`).join(", ")} over ${acts.length} acts`);
  for (const [key, value] of percent) assert.ok(value >= (threshold[key] ?? 0), `"${key}": ${value}% < ${threshold[key]}%`);
}

test("the router reads what each act asks as AMI's annotators marked it (QR-16)", { timeout: 1800000 }, async () => {
  for (const mark of ["question", "task", "fact", "autoFeedback"]) assert.ok(acts.some((a) => (a.intent ?? a.dimension) === mark), `the corpus holds no ${mark} act of the AMI test partition`);
  assert.equal(PROVIDERS.intent.head?.model, PROVIDERS.meaning.model, "the intent head reads the compiled meaning model's vectors");
  await found(acts, { question: "question-found", task: "task-found", fact: "fact-found", autoFeedback: ["feedback-found", "feedback-kept"] });
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
  await found(text.trim().split("\n").map((l) => JSON.parse(l)), { question: "dialogue question-found", task: "dialogue task-found", fact: "dialogue fact-found", autoFeedback: ["dialogue feedback-found", "dialogue feedback-kept"] });
});

test("the heads are fit on the training partition", { skip: !process.env.INTENT_FIT, timeout: 7200000 }, async () => {
  const rows = readFileSync(process.env.INTENT_FIT, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const vectors = await meanings([...new Set(rows.flatMap((a) => [a.text, plain(a.text)]))]);
  const [STEPS, RATE, DECAY] = [2000, 4, 1e-4];
  const url = new URL("../../app/specs/router/spec.json", import.meta.url);
  const spec = JSON.parse(readFileSync(url, "utf8"));
  // One head: the acts `is` marks against the rest of `train`, counted in the fit record as `count`.
  const fit = (train, is, count, read = (t) => t) => {
    const xs = train.map((a) => vectors.get(read(a.text)));
    const y = train.map((a) => Number(is(a)));
    const w = new Float64Array(xs[0].length + 1);
    for (let step = 0; step < STEPS; step += 1) {
      const g = new Float64Array(w.length);
      xs.forEach((v, i, _, e = 1 / (1 + Math.exp(-v.reduce((z, x, k) => z + w[k] * x, w.at(-1)))) - y[i]) => g.forEach((__, k) => { g[k] += e * (v[k] ?? 1); }));
      w.forEach((_, k) => { w[k] -= RATE * (g[k] / xs.length + (k < xs[0].length ? DECAY * w[k] : 0)); });
    }
    return { model: spec.providers.meaning.model, fit: { source: "ami", acts: xs.length, [count]: y.filter(Boolean).length, steps: STEPS, rate: RATE, decay: DECAY }, bias: Number(w.at(-1).toFixed(4)), weights: Array.from(w.slice(0, -1), (x) => Number(x.toFixed(4))) };
  };
  Object.assign(spec.providers.intent.head, fit(rows.filter((a) => a.intent && a.intent !== "question" && !asksQuestion(a.text)), (a) => a.intent === "task", "tasks"));
  for (const [name, head] of Object.entries(spec.providers.intent.heads)) Object.assign(head, fit(rows.filter((a) => plain(a.text)), (a) => a.dimension === name, "marked", plain));
  writeFileSync(url, `${JSON.stringify(spec, null, 2)}\n`);
});
