// UX-01: every screen the person meets is held to a published standard, not a
// home-made one: WCAG 2.2 at level AA (W3C), checked by axe-core, the W3C
// ACT-aligned engine, fetched at a pinned version and SHA-256. The walk runs
// on the specifications' own examples (test/oracle/corpus.json) on the day
// they happen, at a desktop and a phone width, in light and dark: the first
// visit, every place in the person's view, an opened item, Settings and an
// answer. A violation the debt below does not list fails, and so does listed
// debt that is gone, so the debt only shrinks and a fixed class stays fixed.
//
// pages.yml runs it on the assembled page and again on the published page.
// usage: NODE_PATH="$(npm root --global)" [PAGE_SITE=dir | PAGE_URL=url] node --test test/page/standards.test.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import test from "node:test";

const { chromium } = createRequire(import.meta.url)("playwright");
const site = resolve(process.env.PAGE_SITE ?? "site");
const published = process.env.PAGE_URL;
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const { PLACES } = await import(resolve("site/surface/surface.mjs"));
const { example } = await import(resolve("test/oracle/examples.mjs"));

// The standard and its checker.
const STANDARD = { name: "WCAG 2.2 AA", tags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] };
const ENGINE = { url: "https://cdn.jsdelivr.net/npm/axe-core@4.10.3/axe.min.js", sha256: "880970c081707360e64f34cea25ff91892f5bc95675b0776925b9709dd8a68bb" };
// QR-20's measure: rules violated on any screen beyond the debt, at most 0.
const MEASURE = "wcag-violations";
// What still violates it, as "rule at screen": this list only shrinks.
const DEBT = [];

async function engine() {
  const dir = join(tmpdir(), "prism-standards");
  const path = join(dir, ENGINE.sha256);
  let bytes = existsSync(path) ? readFileSync(path) : Buffer.from(await (await fetch(ENGINE.url)).arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest, ENGINE.sha256, `${ENGINE.url} is ${digest}, not the pinned engine`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, bytes);
  return bytes.toString("utf8");
}

// The day of the examples: three meetings (two clash), two messages and a card.
const DAY = "1997-07-01T15:00:00Z";
const FEED = [["rfc5546-9", "ics"], ["rfc5546-6", "ics"], ["rfc5546-1", "ics"], ["rfc5322-1", "eml"], ["rfc5322-6", "eml"], ["rfc6350-9", "vcf"]];
const VIEWS = [
  { name: "desktop light", viewport: { width: 1280, height: 800 }, colorScheme: "light" },
  { name: "desktop dark", viewport: { width: 1280, height: 800 }, colorScheme: "dark" },
  { name: "phone light", viewport: { width: 390, height: 844 }, colorScheme: "light" },
  { name: "phone dark", viewport: { width: 390, height: 844 }, colorScheme: "dark" },
];

test(`every screen the person meets meets ${STANDARD.name} (UX-01)`, { timeout: 15 * 60000 }, async () => {
  const axe = await engine();
  const dir = mkdtempSync(join(tmpdir(), "standards-"));
  const files = FEED.map(([id, ext]) => { const path = join(dir, `${id}.${ext}`); writeFileSync(path, example(id)); return path; });
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/me\//, "/");
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(join(site, path));
    if (!file.startsWith(site) || !existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  });
  if (!published) await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch();
  const found = new Map();
  try {
    for (const view of VIEWS) {
      // The page's own CSP refuses injected scripts; the checker is let in for the audit only.
      const context = await browser.newContext({ timezoneId: "UTC", locale: "en-US", bypassCSP: true, viewport: view.viewport, colorScheme: view.colorScheme });
      await context.clock.install({ time: new Date(DAY) });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(published ?? `http://127.0.0.1:${server.address().port}/me/`);
      await page.waitForSelector("html.pr-ready", { timeout: 60000 });
      const audit = async (screen) => {
        await page.waitForTimeout(300);
        if (!(await page.evaluate(() => typeof window.axe === "object"))) await page.evaluate(axe);
        const result = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] }), STANDARD.tags);
        for (const v of result.violations) {
          const key = `${v.id} at ${screen}`;
          if (!found.has(key)) found.set(key, `${v.impact}: ${v.help} (${view.name}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")})`);
        }
      };
      const go = (key) => page.click(`.pr-go[data-place="${key}"]`);

      await audit("first visit");
      // Content arrives as the person brings it: the device row's file picker in Settings.
      const settings = PLACES.find((p) => p.show === "settings");
      await page.click("#pr-setup .pr-setup-go").catch(() => {});
      await go(settings.key);
      const picker = page.locator('#pr-settings label.pr-file input[type="file"][accept*=".ics"]').first();
      await picker.waitFor({ state: "attached", timeout: 15000 });
      await picker.setInputFiles(files);
      await page.waitForFunction(() => /^\d+ items$/.test(document.getElementById("pr-out").textContent), null, { timeout: 30000 });
      await audit(settings.key);
      for (const place of PLACES.filter((p) => p.viewpoint === "person" && p.host !== "composer" && p.show !== "settings")) {
        await go(place.key);
        await audit(place.key);
        const row = page.locator("#pr-list [aria-expanded=false]").first();
        if (await row.count()) { await row.click(); await audit(`${place.key}, opened`); }
      }
      await page.fill("#pr-prompt", "What is going on with John?");
      await page.click("#pr-ask-go");
      await page.waitForFunction(() => !document.getElementById("pr-ask-go").disabled, null, { timeout: 15000 });
      await audit("answer");
      assert.deepEqual(errors, [], `page errors (${view.name}): ${errors.join(" | ")}`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  const fresh = [...found].filter(([key]) => !DEBT.includes(key)).map(([key, why]) => `${key}: ${why}`);
  assert.deepEqual(fresh, [], `${MEASURE}: these screens violate ${STANDARD.name}: fix them, or list each under DEBT with why`);
  const gone = DEBT.filter((key) => !found.has(key));
  assert.deepEqual(gone, [], "these now meet the standard: remove them from DEBT so they stay met");
});
