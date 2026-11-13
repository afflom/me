// PD-02: the system view never reaches the screen. Every place is opened in a
// fresh profile and again after a reload (a returning browser), and every
// word the product record assigns to the system view is looked for in what
// the person can see; then again with the synthetic person's day arrived and
// each place's first item opened. What shows today is listed as debt in
// app/specs/product/spec.json, word by word: a word not listed fails, and a
// listed word that no longer shows anywhere fails until its line is removed, so the list only
// shrinks.
//
// pages.yml runs it on the assembled page and again on the published page.
// usage: NODE_PATH="$(npm root --global)" [PAGE_SITE=dir | PAGE_URL=url] node --test test/product/screen.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { chromium, leaks, open, product, ratchet, serve, summary, surface, systemWords, visible } from "./harness.mjs";
import { device } from "./person.mjs";

test("no word or control of the system view is on the screen beyond the listed debt (PD-02)", async () => {
  const words = systemWords();
  const server = await serve();
  const browser = await chromium.launch();
  const shown = new Map();
  try {
    const errors = [];
    let page;
    for (const pass of ["fresh", "returning", "with the day"]) {
      if (pass === "returning") { await page.reload(); await page.waitForSelector("html.pr-ready", { timeout: 60000 }); }
      else {
        const context = await browser.newContext({ timezoneId: "UTC", locale: "en-US" });
        if (pass === "with the day") await device(context);
        page = await context.newPage();
        page.on("pageerror", (error) => errors.push(error.message));
        await open(page, server.url);
        if (pass === "with the day") await page.waitForFunction(() => /Lisbon/.test(document.getElementById("stage")?.innerText ?? ""), null, { timeout: 30000 }).catch(() => {});
      }
      for (const place of surface.places) {
        const go = page.locator(`.pr-go[data-place="${place.key}"]`).first();
        if (await go.count() && await go.isVisible()) {
          await go.click();
          await page.waitForTimeout(250);
        }
        const seen = await visible(page);
        // With the day arrived, each place's first row is opened too: what an item reads like is on the screen.
        if (pass === "with the day") {
          const row = page.locator("#stage [role=button][aria-expanded]").first();
          if (await row.count() && await row.isVisible()) { await row.click(); await page.waitForTimeout(250); seen.push(...await visible(page)); }
        }
        for (const term of leaks(seen, words)) shown.set(term, (shown.get(term) ?? new Set()).add(place.key));
      }
    }
    assert.deepEqual(errors, [], `page errors: ${errors.join(" | ")}`);
  } finally {
    await browser.close();
    server.close();
  }
  const debt = product.debt;
  const where = (term) => `"${term}" (${words.get(term)}, on ${[...shown.get(term)].join(", ")})`;
  const { fresh, gone } = ratchet(new Set(shown.keys()), debt);
  summary([
    "### The system view on the screen (PD-02)",
    `${shown.size} system words show; ${debt.length} are listed as debt; the target is 0.`,
    ...fresh.map((term) => `- new: ${where(term)}`),
    ...gone.map((term) => `- gone, remove from debt: "${term}"`),
  ]);
  assert.deepEqual(fresh, [], `the system view reached the screen: ${fresh.map(where).join(", ")}`);
  assert.deepEqual(gone, [], `these leaks no longer show; remove them from "debt" in app/specs/product/spec.json so they cannot come back: ${gone.join(", ")}`);
});
