// The intent head: what a line that is not a question asks of the owner, a task
// or a fact, read from what it means. The compiled meaning model
// (PROVIDERS.meaning, run on this page as the router runs it) reads each act of
// the AMI Meeting Corpus's scenario training partition (the "train" series of
// the ami source, app/specs/oracle/spec.json; tools/oracle/gen.py --fit-acts
// writes them outside the repository) that the question rule does not take,
// and a logistic regression over its vectors is fit to AMI's annotation: Suggest
// and Offer are a task, Inform a fact. Full-batch gradient descent from zero,
// in a fixed number of steps, so the same vectors fit the same head. The head is
// written to the router spec (providers.intent.head) and held by QR-16 on the
// test partition (test/oracle/intent.test.mjs), which it never sees.
// It is owed to LexLean: a generator takes it once a generator's input may hold
// the vectors (the PrismPM request bound, /mnt/project-files/f1/upstream-input-bound.md).
//
// usage: python3 -I tools/oracle/gen.py --fit-acts ACTS && PAGE_SITE=<built site> node tools/oracle/fit-intent.mjs ACTS
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import { asksQuestion } from "../../site/router/features.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = new URL("../../", import.meta.url);
const SPEC = new URL("app/specs/router/spec.json", ROOT);
const site = resolve(process.env.PAGE_SITE ?? "site");
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm" };
const STEPS = 2000;
const RATE = 4;
const DECAY = 1e-4;
const PLACES = 4;

const acts = readFileSync(process.argv[2], "utf8").trim().split("\n").map((l) => JSON.parse(l))
  .filter((a) => (a.intent === "task" || a.intent === "fact") && !asksQuestion(a.text));
const models = JSON.parse(readFileSync(new URL("app/specs/models/spec.json", ROOT), "utf8"));

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
const page = await browser.newPage();
await page.goto(`${base}/`);
const vectors = [];
for (let i = 0; i < acts.length; i += 512) {
  const got = await page.evaluate(async ({ base, spec, texts }) => {
    const { specDecider } = await import(`${base}/r4/decide.mjs`);
    const { meaningReader } = await import(`${base}/router/meaning.mjs`);
    const decide = specDecider(spec);
    window.reader ??= meaningReader({ line: async (l) => decide(l.replace(/^model /, "")).outcome });
    const v = await window.reader.embed(texts);
    return v && v.map((x) => Array.from(x));
  }, { base, spec: models, texts: acts.slice(i, i + 512).map((a) => a.text) });
  if (!got) throw new Error("the meaning model did not open");
  vectors.push(...got);
  console.error(`fit-intent: read ${vectors.length} of ${acts.length}`);
}
await browser.close();
server.close();

const n = vectors.length;
const d = vectors[0].length;
const y = acts.map((a) => (a.intent === "task" ? 1 : 0));
const w = new Float64Array(d);
let b = 0;
for (let step = 0; step < STEPS; step += 1) {
  const g = new Float64Array(d);
  let gb = 0;
  for (let i = 0; i < n; i += 1) {
    const v = vectors[i];
    let z = b;
    for (let k = 0; k < d; k += 1) z += w[k] * v[k];
    const e = 1 / (1 + Math.exp(-z)) - y[i];
    for (let k = 0; k < d; k += 1) g[k] += e * v[k];
    gb += e;
  }
  for (let k = 0; k < d; k += 1) w[k] -= RATE * (g[k] / n + DECAY * w[k]);
  b -= (RATE * gb) / n;
}
const round = (x) => Number(x.toFixed(PLACES));
const spec = JSON.parse(readFileSync(SPEC, "utf8"));
spec.providers.intent.head = {
  comment: "Whether a line that is not a question is a task (positive) or a fact: the sign of bias plus the dot product of weights with the line's meaning vector (PROVIDERS.meaning.model). Fit by tools/oracle/fit-intent.mjs on the AMI Meeting Corpus's scenario training partition and held by QR-16 on its test partition. Owed to LexLean.",
  model: spec.providers.meaning.model,
  fit: { source: "ami", acts: n, tasks: y.reduce((s, x) => s + x, 0), steps: STEPS, rate: RATE, decay: DECAY },
  bias: round(b),
  weights: Array.from(w, round),
};
writeFileSync(SPEC, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`fit-intent: head fit on ${n} acts (${spec.providers.intent.head.fit.tasks} tasks) into app/specs/router/spec.json`);
