// The accessible name the Prism's extension reads a service's tab by
// (site/extension/name.js, W3C AccName 1.2), graded on the Web Platform Tests'
// own accname cases, pinned in app/specs/oracle/spec.json and taken whole into
// test/oracle/corpus.json (kind accname). Each case's expected name is the
// test suite's; a case the Prism does not yet name right is listed as debt in
// the oracle spec, which only shrinks: a new miss fails, and so does debt that
// now names right.
// usage: node --test test/oracle/name.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const { chromium } = createRequire(import.meta.url)("playwright");
const { corpus } = JSON.parse(readFileSync("test/oracle/corpus.json", "utf8"));
const spec = JSON.parse(readFileSync("app/specs/oracle/spec.json", "utf8"));
const pages = corpus.filter((c) => c.kind === "accname");
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const key = (m) => `${m.id} ${m.field}`;

test("every Web Platform Tests accname case is named as the suite expects, beyond the listed debt", async () => {
  assert.ok(pages.length >= 3 && pages.reduce((n, p) => n + p.expect.names.length, 0) >= 100, "the accname pages are in the corpus");
  const browser = await chromium.launch();
  const found = [];
  try {
    const page = await browser.newPage();
    for (const example of pages) {
      // The suite's own harness scripts are not the page under test.
      await page.setContent(example.raw.replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/g, ""));
      await page.addScriptTag({ path: "site/extension/name.js" });
      const got = await page.evaluate(() => [...document.querySelectorAll(".ex[data-expectedlabel]")].map((el) => ({ test: el.dataset.testname, name: globalThis.prismName(el) })));
      assert.equal(got.length, example.expect.names.length, `${example.id}: the page's cases are the corpus's`);
      got.forEach((g, i) => { const want = example.expect.names[i]; if (norm(g.name) !== want.name) found.push({ id: example.id, field: want.test, want: want.name, got: norm(g.name) }); });
    }
  } finally {
    await browser.close();
  }
  const ids = new Set(pages.map((p) => p.id));
  const debt = new Map((spec.debt ?? []).filter((d) => ids.has(d.id)).map((d) => [key(d), d]));
  const fresh = found.filter((m) => !debt.has(key(m)));
  assert.deepEqual(fresh, [], `the Prism now misnames these: fix site/extension/name.js, or list each under "debt" in app/specs/oracle/spec.json with why`);
  const gone = [...debt.keys()].filter((k) => !found.some((m) => key(m) === k));
  assert.deepEqual(gone, [], `these now name right: remove them from "debt" in app/specs/oracle/spec.json`);
  console.log(`accname: ${pages.reduce((n, p) => n + p.expect.names.length, 0) - found.length} of ${pages.reduce((n, p) => n + p.expect.names.length, 0)} cases named as the suite expects; ${found.length} listed as debt`);
});

test("a page's items are what W3C's own feed example renders, each article heard by its name", async () => {
  const feeds = corpus.filter((c) => c.kind === "feed");
  assert.ok(feeds.length >= 1, "the feed example is in the corpus");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const example of feeds) {
      await page.setContent('<!doctype html><title>Restaurants</title><div id="restaurant-feed" role="feed"></div>');
      // The example's own renderer, with its own data, each item as it renders one.
      await page.addScriptTag({ content: example.raw });
      await page.evaluate(() => { const feed = document.getElementById("restaurant-feed"); const display = Object.create(globalThis.aria.FeedDisplay.prototype); display.feedSize = 0; for (const item of globalThis.aria.RestaurantData) feed.append(display.renderItemData(item)); });
      await page.addScriptTag({ path: "site/extension/name.js" });
      const items = await page.evaluate(() => globalThis.prismItems({ select: '[role="article"]', where: "title" }));
      assert.deepEqual(items.map((i) => i.words), example.expect.names, `${example.id}: each article, in order, by its name`);
      assert.ok(items.every((i) => i.where === "Restaurants" && i.at === null && i.who === null), `${example.id}: where is the page's title; no time or speaker the page does not show`);
    }
  } finally {
    await browser.close();
  }
});
