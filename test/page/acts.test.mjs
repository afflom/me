// PG-03 in headless Chromium, against the assembled page (pages.yml runs it
// after `node bootstrap/page.mjs site`, with the verified app.holo in place).
// Every act runs end to end: what is sent is kept where it left from, a kept
// item opens to its words, and Ask draws on what is kept, never while halted.
// usage: NODE_PATH="$(npm root --global)" [PAGE_SITE=dir | PAGE_URL=url] node --test test/page/acts.test.mjs
import assert from "node:assert/strict";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import test from "node:test";

const { chromium } = createRequire(import.meta.url)("playwright");
// What the owner types comes from the specifications' own examples: a to-do,
// a meeting and a message (RFC 5546 §4.4, §4.2.4; RFC 5322 Appendix A.1.1).
const { titleOf, expectOf, bodyOf, toOf } = await import(resolve("test/oracle/examples.mjs"));
const TASK = titleOf("rfc5546-47");
const MEETING = titleOf("rfc5546-9");
const MEETING_AT = new Date(expectOf("rfc5546-9").start.at).toISOString().slice(0, 16);
const TO = toOf("rfc5322-1");
const [FIRST_LINE, ...REST] = bodyOf("rfc5322-1").split("\n");
const site = resolve(process.env.PAGE_SITE ?? "site");
const published = process.env.PAGE_URL;
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

test("every act completes: sent things are kept where they left from, items open, Ask draws on what is kept (PG-03)", async () => {
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
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const downloads = [];
    page.on("download", (download) => downloads.push(download.suggestedFilename()));
    await page.goto(published ?? `http://127.0.0.1:${server.address().port}/me/`);
    await page.waitForSelector("html.pr-ready", { timeout: 60000 });
    const settle = (text) => page.waitForFunction((t) => document.getElementById("pr-out").textContent.trim() === t, text, { timeout: 10000 });
    const listed = (text) => page.waitForFunction((t) => document.getElementById("pr-list").innerText.includes(t), text, { timeout: 10000 });
    const review = async () => {
      await page.click('#pr-act button[type="submit"]');
      await settle("Ready to send");
    };

    // A task is kept, for Ask to draw on later.
    await page.click('.pr-go[data-place="tasks"]');
    await page.fill("#pr-act input", TASK);
    await page.click("#pr-act button");
    await settle("Kept");

    // An event: the one reviewed is the one sent, and it is kept in Calendar.
    await page.click('.pr-go[data-place="calendar"]');
    await page.fill('#pr-act input[type="datetime-local"]', MEETING_AT);
    await page.fill('#pr-act input[type="text"]', MEETING);
    await review();
    // An owner reads before pressing Send; the event's stamp has one-second grain.
    await page.waitForTimeout(1500);
    await page.click("#pr-act .pr-primary");
    await settle("Sent to your app");
    await listed(MEETING);
    assert.ok(downloads.includes("event.ics"), "the event went to the owner's calendar app");

    // A message: sent through the owner's mail app, kept in Conversations, and it opens to its body.
    await page.click('.pr-go[data-place="conversations"]');
    await page.fill('#pr-act input[type="email"]', TO);
    await page.fill("#pr-act textarea", bodyOf("rfc5322-1"));
    await review();
    await page.click("#pr-act .pr-primary");
    await settle("Sent to your app");
    await listed(TO);
    const row = page.locator("#pr-list .pr-item", { hasText: FIRST_LINE });
    await row.click();
    assert.equal(await row.locator(".pr-row").getAttribute("aria-expanded"), "true");
    assert.match(await row.locator(".pr-preview").textContent(), new RegExp(REST.join("\n").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    // Ask draws on the kept task before the model answers.
    await page.fill("#pr-prompt", "What about the status reports?");
    await page.click("#pr-ask-go");
    await page.waitForFunction(() => document.querySelector(".pr-drawn")?.innerText.includes("Send Status Reports"), null, { timeout: 10000 });

    // Halted, Ask draws on nothing kept.
    await page.click('.pr-go[data-place="boundary"]');
    await page.check("#pr-halt");
    await page.waitForFunction(() => !document.getElementById("pr-ask-go").disabled, null, { timeout: 120000 });
    await page.fill("#pr-prompt", "What about the status reports?");
    await page.click("#pr-ask-go");
    await page.waitForFunction(() => document.querySelector(".pr-drawn")?.children.length === 0, null, { timeout: 10000 });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    if (server.listening) server.close();
  }
});
