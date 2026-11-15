// What the Prism's meaning model reads, over the STS Benchmark's test split
// (its image and video captions, pinned in app/specs/oracle/spec.json and taken
// into test/oracle/corpus.json): the model ranks pairs as the benchmark's
// annotators grade them, the router's near parts the pairs they grade on the
// same topic (1 or more on the 0 to 5 scale) from the rest, and Ask on the page
// finds a kept caption from its pair where their words alone miss each other.
// The model is the one the router spec compiles in (PROVIDERS.meaning), from the
// pinned lock, admitted by the models decision (app/specs/models/spec.json).
// QR-15's thresholds are its quality record's.
// usage: PAGE_SITE=<built site> node --test test/oracle/meaning.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { drawOn } from "../../site/coherence/sense.mjs";
import { PROVIDERS } from "../../site/router/table.mjs";
import { serve } from "./examples.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const published = process.env.PAGE_URL;
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const record = read("../../app/specs/product/quality/QR-15.json");
const threshold = Object.fromEntries(record.measures.map((m) => [m.key, m.threshold]));
const models = read("../../app/specs/models/spec.json");
const pairs = read("corpus.json").corpus.filter((e) => e.kind === "similarity");
const SAME_TOPIC = 1;
const SOME_DETAILS = 2;
// The opening words of the sentence that says nothing held matched the ask.
const UNMATCHED = PROVIDERS.sentence.frames.unmatched.split("{")[0].trim();

const rank = (xs) => {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
    for (let k = i; k <= j; k += 1) r[order[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
};
const spearman = (xs, ys) => {
  const [a, b] = [rank(xs), rank(ys)];
  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const [ma, mb] = [mean(a), mean(b)];
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < a.length; i += 1) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return cov / Math.sqrt(va * vb);
};

let served;
const origin = async () => published?.replace(/\/$/, "") ?? (served ??= await serve()).base;

test("the meaning model ranks the benchmark's pairs as its annotators do, and near is their same topic (QR-15)", { timeout: 900000 }, async () => {
  assert.equal(PROVIDERS.meaning?.kind, "compiled", "the router spec compiles the meaning model in");
  assert.ok(pairs.length >= 500, "the benchmark's captions are in the corpus");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const base = await origin();
    await page.goto(`${base}/`);
    const cosines = await page.evaluate(async ({ base, spec, a, b }) => {
      const { specDecider } = await import(`${base}/r4/decide.mjs`);
      const { meaningReader, nearness } = await import(`${base}/router/meaning.mjs`);
      const decide = specDecider(spec);
      const reader = meaningReader({ line: async (l) => decide(l.replace(/^model /, "")).outcome });
      const [va, vb] = [await reader.embed(a), await reader.embed(b)];
      return va && vb ? va.map((v, i) => nearness(v, vb[i])) : null;
    }, { base, spec: models, a: pairs.map((p) => p.expect.a), b: pairs.map((p) => p.expect.b) });
    assert.ok(cosines, "the meaning model opened");
    const rho = Math.round(100 * spearman(cosines, pairs.map((p) => p.expect.score)));
    const agree = Math.round((100 * pairs.filter((p, i) => (cosines[i] >= PROVIDERS.meaning.near) === (p.expect.score >= SAME_TOPIC)).length) / pairs.length);
    console.log(`# QR-15 meaning-rank ${rho}, near-agreement ${agree}% over ${pairs.length} pairs at near ${PROVIDERS.meaning.near}`);
    assert.ok(rho >= threshold["meaning-rank"], `"meaning-rank": ${rho}`);
    assert.ok(agree >= threshold["near-agreement"], `"near-agreement": ${agree}`);
  } finally {
    await browser.close();
  }
});

test("Ask finds a kept caption from its pair where their words alone miss each other (QR-15)", { timeout: 900000 }, async () => {
  const note = (p) => ({ address: p.id, title: p.expect.a, body: p.expect.a, media: "plainText", at: 0 });
  const missed = pairs.filter((p) => p.expect.score >= SOME_DETAILS && !drawOn([note(p)], p.expect.b, { now: 0 }).length);
  assert.ok(missed.length, "the benchmark holds pairs whose words miss each other");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ timezoneId: "UTC" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${await origin()}/`);
    await page.waitForSelector("html.pr-ready", { timeout: 60000 });
    const say = async (text) => {
      await page.fill("#pr-prompt", text);
      await page.click("#pr-ask-go");
      await page.waitForFunction(() => !document.getElementById("pr-ask-go").disabled, null, { timeout: 30000 });
    };
    for (const p of missed) {
      await say(p.expect.a);
      await page.locator(".pr-offers .pr-offer").last().click();
      await page.waitForTimeout(500);
    }
    const lost = [];
    for (const p of missed) {
      // The kept notes are read by the model in the background; it has read them within the wait.
      let found = false;
      for (let tries = 0; tries < 60 && !found; tries += 1) {
        await say(p.expect.b);
        // Found by what it means: the answer names it, and does not say nothing matched
        // (the overview of everything held would list it either way).
        const said = await page.locator("#pr-out").innerText();
        found = said.includes(p.expect.a) && !said.includes(UNMATCHED);
        if (!found) await page.waitForTimeout(2000);
      }
      if (!found) lost.push(p.id);
    }
    console.log(`# QR-15 meaning-missed ${lost.length} of ${missed.length}`);
    assert.ok(lost.length <= threshold["meaning-missed"], `"meaning-missed": ${lost.join(", ")}`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    served?.close();
  }
});
