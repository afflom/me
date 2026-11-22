// CO-05: the page as a returning owner meets it, in headless Chromium.
// 1. Every button on Today does something when pressed: a place's card opens
//    that place, a Note feeder opens its place with the note field in hand,
//    and an Add files feeder opens the device's file picker.
// 2. A browser that kept an earlier deploy gets this one: with the kept cache
//    named for another version, the page drops it and loads fresh, once.
// 3. A folder the browser took back says so: File System Access answers
//    queryPermission with "denied" for a handle the page kept, and the folder's
//    row names it apart from one never added.
// pages.yml runs it on the assembled page and again on the published page.
// usage: NODE_PATH="$(npm root --global)" [PAGE_SITE=dir | PAGE_URL=url] node --test test/page/returning.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { chromium, serve, surface } from "../product/harness.mjs";

async function open(run, profile) {
  const server = await serve();
  // Only a profile on disk keeps a folder's handle.
  const context = profile ? await chromium.launchPersistentContext(profile) : await (await chromium.launch()).newContext();
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await run({ page, url: server.url, errors, context });
  } finally {
    await (context.browser() ?? context).close();
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
    // A fresh Today leads with Set up, whose Continue opens its next step; the places' cards show once something is kept.
    const setup = page.locator("#pr-setup .pr-setup-go");
    if (await setup.isVisible()) {
      await setup.click();
      if ((await page.textContent("#pr-title")) === home) dead.push("set up");
    }
    const cards = await page.$$eval("#pr-home:not([hidden]) .pr-card-go", (buttons) => buttons.map((b) => b.dataset.place));
    assert.ok(cards.length > 0 || (await page.locator("#pr-setup").count()), "Today shows its places or Set up");
    for (const place of cards) {
      await page.click('.pr-go[data-place="today"]');
      await page.click(`#pr-home .pr-card-go[data-place="${place}"]`);
      const title = await page.textContent("#pr-title");
      if (title === home) dead.push(`card ${place}`);
    }
    const feeds = await page.$$eval("#pr-home .pr-card-feed[data-feed]", (buttons) => buttons.map((b) => [b.dataset.feed, b.dataset.place]));
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

test("a kept folder the browser took back says so (CO-05)", async () => {
  await open(async ({ page, url, errors, context }) => {
    // The picker hands over a folder of the page's own private file system; the browser's answer for it is the test's to set.
    await context.addInitScript(() => {
      window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("kept", { create: true });
      FileSystemHandle.prototype.queryPermission = async () => localStorage.getItem("test.grant") ?? "granted";
    });
    await page.goto(url);
    await ready(page);
    await page.locator('.pr-go[data-place="boundary"]').evaluate((button) => button.click());
    const row = page.locator("#pr-settings .pr-setting", { has: page.locator("button", { hasText: surface.words["device.folder"] }) });
    const says = (text) => row.locator(".pr-state", { hasText: text }).waitFor({ state: "attached", timeout: 30000 });
    await says(surface.words["device.none"]);
    await row.locator("button", { hasText: surface.words["device.folder"] }).evaluate((button) => button.click());
    await says(/^kept$/);
    await page.evaluate(() => localStorage.setItem("test.grant", "denied"));
    await page.reload();
    await ready(page);
    await page.locator('.pr-go[data-place="boundary"]').evaluate((button) => button.click());
    await says(`kept: ${surface.words["device.taken"]}`);
    assert.deepEqual(errors, [], `page errors: ${errors.join(" | ")}`);
  }, mkdtempSync(`${tmpdir()}/prism-`));
});
