// CO-05: the page as a returning owner meets it, in headless Chromium.
// 1. Every button on Today does something when pressed: a place's card opens
//    that place, a Note feeder opens its place with the note field in hand,
//    and an Add files feeder opens the device's file picker.
// 2. A browser that kept an earlier deploy gets this one: with the kept cache
//    named for another version, the page drops it and loads fresh, once.
// pages.yml runs it on the assembled page and again on the published page.
// usage: NODE_PATH="$(npm root --global)" [PAGE_SITE=dir | PAGE_URL=url] node --test test/page/returning.test.mjs
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

async function open(run) {
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
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const url = published ?? `http://127.0.0.1:${server.address().port}/me/`;
    await run({ page, url, errors });
  } finally {
    await browser.close();
    server.close();
  }
}

const ready = (page) => page.waitForSelector("html.pr-ready", { state: "attached", timeout: 60000 });

test("every button on Today does something when pressed (CO-05)", async () => {
  await open(async ({ page, url, errors }) => {
    await page.goto(url);
    await ready(page);
    const home = await page.textContent("#pr-title");
    const dead = [];
    const cards = await page.$$eval("#pr-home .pr-card-go", (buttons) => buttons.map((b) => b.dataset.place));
    assert.ok(cards.length > 0, "Today shows its places");
    for (const place of cards) {
      await page.click('.pr-go[data-place="today"]');
      await page.click(`#pr-home .pr-card-go[data-place="${place}"]`);
      const title = await page.textContent("#pr-title");
      if (title === home) dead.push(`card ${place}`);
    }
    const feeds = await page.$$eval("#pr-home .pr-card-feed", (buttons) => buttons.map((b) => [b.dataset.feed, b.dataset.place]));
    for (const [feed, place] of feeds) {
      await page.click('.pr-go[data-place="today"]');
      const button = page.locator(`#pr-home .pr-card-feed[data-feed="${feed}"][data-place="${place}"]`);
      if (!(await button.isVisible())) continue;
      const chooser = page.waitForEvent("filechooser", { timeout: 5000 }).then(() => "picker", () => null);
      await button.click();
      const picked = feed === "device" ? await chooser : null;
      const focused = await page.evaluate(() => Boolean(document.activeElement?.closest("#pr-act")));
      const moved = (await page.textContent("#pr-title")) !== home;
      if (!picked && !focused && !moved) dead.push(`${feed} on ${place}`);
    }
    assert.deepEqual(dead, [], `buttons that did nothing: ${dead.join(", ")}`);
    assert.deepEqual(errors, [], `page errors: ${errors.join(" | ")}`);
  });
});

test("a browser that kept an earlier deploy loads this one (CO-05)", async () => {
  await open(async ({ page, url, errors }) => {
    await page.goto(url);
    await ready(page);
    // The worker keeps this deploy's files; wait until it controls the page.
    await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 30000 });
    await page.reload();
    await ready(page);
    const served = await page.evaluate(async () => (await (await fetch("./precache.json", { cache: "no-store" })).json()).version);
    // Make the kept deploy an earlier one: the same files under another version's name.
    await page.evaluate(async (version) => {
      const from = await caches.open(`prism-${version}`);
      const to = await caches.open("prism-0000000000000000");
      for (const request of await from.keys()) await to.put(request, await from.match(request));
      await caches.delete(`prism-${version}`);
    }, served);
    await page.reload();
    await page.waitForFunction(() => sessionStorage.getItem("me.healed"), null, { timeout: 30000 });
    await ready(page);
    const kept = await page.evaluate(() => caches.keys());
    assert.ok(!kept.includes("prism-0000000000000000"), `the earlier deploy is dropped: ${kept.join(", ")}`);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("me.healed")), served);
    assert.deepEqual(errors, [], `page errors: ${errors.join(" | ")}`);
  });
});
