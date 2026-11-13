// PG-01 in headless Chromium, against the assembled page (pages.yml runs it
// after `node bootstrap/page.mjs site`, with the verified app.holo in place).
// After a deploy, pages.yml runs it again with PAGE_URL set to the published
// page, so a site that does not work fails the run instead of shipping quietly.
// usage: NODE_PATH="$(npm root --global)" [PAGE_SITE=dir | PAGE_URL=url] node --test test/page/card.test.mjs
import assert from "node:assert/strict";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import test from "node:test";

const { chromium } = createRequire(import.meta.url)("playwright");
const site = resolve(process.env.PAGE_SITE ?? "site");
const published = process.env.PAGE_URL;
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

test("the Prism keeps at the model's floors, refuses while halted and drafts only through the app (PG-01)", async () => {
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
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(published ?? `http://127.0.0.1:${server.address().port}/me/`);
    // The Prism is ready once the vault has opened and every place is drawn.
    await page.waitForSelector("html.pr-ready", { timeout: 60000 });
    const settle = (text) => page.waitForFunction((t) => document.getElementById("pr-out").textContent.trim() === t, text, { timeout: 10000 });
    // The list repaints after the result is said: wait for the count, then read it.
    const count = async (selector, n) => {
      await page.waitForFunction(([s, k]) => document.querySelectorAll(s).length === k, [selector, n], { timeout: 10000 }).catch(() => {});
      return page.locator(selector).count();
    };
    const rows = async (n = 1) => count("#pr-list .pr-item", n);
    const note = async (place, text) => {
      await page.click(`.pr-go[data-place="${place}"]`);
      await page.fill("#pr-act input", text);
      await page.click("#pr-act button");
    };

    // Every owner view of the design model is one place, in the model's order.
    const places = await page.$$eval(".pr-go", (buttons) => buttons.map((b) => b.dataset.place));
    assert.deepEqual(places, ["today", "conversations", "people", "calendar", "tasks", "places", "money", "things", "me", "health", "work", "library", "explore", "timeline", "presence", "boundary"]);

    // A task is kept at its domain's floor (internal): the Boundary allows it, the vault keeps it.
    await note("tasks", "An example task");
    await settle("Kept");
    assert.equal(await rows(), 1);

    // Health's floor is restricted: the Boundary answers hashonly, so only its digest is kept.
    await note("health", "An example health note");
    await settle("Kept sealed");
    assert.equal(await count("#pr-list .pr-sealed", 1), 1);

    // Halted, the Boundary denies every keep.
    await page.click('.pr-go[data-place="boundary"]');
    await page.check("#pr-halt");
    await settle("Halted");
    await note("tasks", "Another example task");
    await settle("Refused");
    assert.equal(await rows(), 1);

    // Resumed, a draft is prepared through PrismDest and nothing leaves without Send.
    await page.click('.pr-go[data-place="boundary"]');
    await page.uncheck("#pr-halt");
    await page.click('.pr-go[data-place="conversations"]');
    await page.fill('#pr-act input[type="email"]', "someone@example.org");
    await page.fill("#pr-act textarea", "An example message");
    await page.click('#pr-act button[type="submit"]');
    await settle("Ready to send");
    assert.match(await page.textContent("#pr-act pre"), /^To: someone@example\.org/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    if (server.listening) server.close();
  }
});
