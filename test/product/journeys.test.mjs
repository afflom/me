// PD-01: every journey of the product record is walked by a synthetic person
// whose device holds a day of mail and calendar (test/product/person.mjs).
// A journey whose status is "works" must pass, in a fresh profile and again
// after a reload (a returning browser); a journey that passes while it is
// still "not yet" fails too, until the record says it works, so a working
// journey is always held. The scoreboard goes to the job summary, never to
// the page.
//
// pages.yml runs it on the assembled page and again on the published page.
// usage: NODE_PATH="$(npm root --global)" [PAGE_SITE=dir | PAGE_URL=url] node --test test/product/journeys.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { chromium, open, product, serve, summary, verdict } from "./harness.mjs";
import { walks } from "./journeys.mjs";
import { device } from "./person.mjs";

async function walk(browser, url, journey, returning) {
  const context = await browser.newContext({ timezoneId: "UTC", locale: "en-US" });
  await device(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await open(page, url);
    if (returning) { await page.reload(); await page.waitForSelector("html.pr-ready", { timeout: 60000 }); }
    await walks[journey.walk](page);
    assert.deepEqual(errors, [], `page errors: ${errors.join(" | ")}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, why: String(error?.message ?? error).split("\n")[0] };
  } finally {
    await context.close();
  }
}

test("every journey that works for the person keeps working, and none works unrecorded (PD-01)", { timeout: 20 * 60000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const rows = [];
  try {
    for (const journey of product.journeys) {
      const fresh = await walk(browser, server.url, journey, false);
      const back = journey.status === "works" ? await walk(browser, server.url, journey, true) : fresh;
      rows.push({ journey, fresh, back });
    }
  } finally {
    await browser.close();
    server.close();
  }
  const works = rows.filter((r) => r.fresh.ok && r.back.ok).length;
  summary([
    "### Journeys for the synthetic person (PD-01)",
    `${works} of ${rows.length} journeys work.`,
    "",
    "| Journey | Recorded | Walk | What the person meets first |",
    "| --- | --- | --- | --- |",
    ...rows.map(({ journey, fresh, back }) => `| ${journey.key} ${journey.name} | ${journey.status} | ${fresh.ok && back.ok ? "works" : "not yet"} | ${fresh.ok ? (back.ok ? "" : `after a reload: ${back.why}`) : fresh.why} |`),
  ]);
  const { broken, unrecorded } = verdict(rows);
  assert.deepEqual(broken.map((r) => `${r.journey.key}: ${r.fresh.why ?? `after a reload: ${r.back.why}`}`), [], "a journey that worked no longer works");
  assert.deepEqual(unrecorded.map((r) => r.journey.key), [], "these journeys now work: set their status to \"works\" in app/specs/product/spec.json so they are held from now on");
});
