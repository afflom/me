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
// QR-16's thresholds are its quality record's.
// usage: PAGE_SITE=<built site> node --test test/oracle/intent.test.mjs
import assert from "node:assert/strict";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import test from "node:test";
import { FIELDS, judge, PROVIDERS } from "../../site/router/table.mjs";
import { route } from "../../site/router/router.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const site = resolve(process.env.PAGE_SITE ?? "site");
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const record = read("../../app/specs/product/quality/QR-16.json");
const threshold = Object.fromEntries(record.measures.map((m) => [m.key, m.threshold]));
const acts = read("corpus.json").corpus.filter((e) => e.kind === "act");
const line = async (text) => judge(Object.fromEntries(FIELDS.map(([name], i) => [name, text.split(" ")[i + 1]])));
const AS_ISO = { event: "fact" };
const models = read("../../app/specs/models/spec.json");

// Each act's meaning vector, from the compiled model on the built page.
async function meanings(texts) {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/me\//, "/");
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(join(site, path));
    if (!file.startsWith(site) || !existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${server.address().port}/me`;
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
    server.close();
  }
}

test("the corpus holds the AMI test partition's acts of every intent", () => {
  for (const intent of ["question", "task", "fact"]) assert.ok(acts.some((a) => a.expect.intent === intent), `no ${intent} act`);
});

test("the router reads what each act asks as AMI's annotators marked it (QR-16)", { timeout: 1800000 }, async () => {
  assert.equal(PROVIDERS.intent.head?.model, PROVIDERS.meaning.model, "the intent head reads the compiled meaning model's vectors");
  const vectors = await meanings([...new Set(acts.map((a) => a.expect.text))]);
  const learned = { meaning: { read: async (text) => vectors.get(text) ?? null } };
  const held = { question: [0, 0], task: [0, 0], fact: [0, 0] };
  for (const act of acts) {
    const mapped = await route({ source: "note", values: { text: act.expect.text }, line, halted: () => "no", now: 0, learned });
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
