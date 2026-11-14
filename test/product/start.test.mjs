// QR-05, it opens at once (F-06). A person who keeps hundreds of messages
// closes the browser and opens the Prism again: the newest of them is on the
// screen within "restart-ms", and none is lost ("restart-lost") once the rest
// are read. Both thresholds are the quality record's
// (app/specs/product/quality/QR-05.json).
// The messages are the validation oracles' own (test/oracle/corpus.json: RFC 5322
// Appendix A and RFC 6047), copied mechanically to the count kept. Each copy is its
// example's very bytes with only its Date and Message-ID fields set, three hours
// apart; the newest is the one example whose subject no other example shares.
// usage: NODE_PATH="$(npm root --global)" [PAGE_SITE=dir | PAGE_URL=url] node --test test/product/start.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium, product, serve, summary } from "./harness.mjs";

const KEPT = 600;
const measures = Object.fromEntries(product.quality.find((q) => q.key === "QR-05").measures.map((m) => [m.key, m.threshold]));
const budget = measures["restart-ms"];
const oracle = JSON.parse(readFileSync(new URL("../oracle/corpus.json", import.meta.url), "utf8")).corpus.filter((e) => e.kind === "message");
const once = oracle.find((e) => e.expect.title && oracle.every((o) => o === e || o.expect.title !== e.expect.title));
const others = oracle.filter((e) => e !== once);
// The example's header with its Date and Message-ID fields (and their folded lines) set anew.
function restamp(raw, at, id) {
  const cut = raw.indexOf("\r\n\r\n");
  const fields = raw.slice(0, cut).split(/\r\n(?![ \t])/u).filter((f) => !/^(date|message-id):/iu.test(f));
  return [`Date: ${at.toUTCString()}`, `Message-ID: <oracle.${id}@example.org>`, ...fields].join("\r\n") + raw.slice(cut);
}
function messages(now = Date.now()) {
  return Array.from({ length: KEPT }, (_, i) => {
    const example = i === 0 ? once : others[(i - 1) % others.length];
    const text = restamp(example.raw, new Date(now - (i + 1) * 3 * 3600_000), `${example.id}.${i}`);
    return { service: "gmail", route: "own", kind: "message", format: "eml", text };
  });
}

async function visit(dir, url, items) {
  const context = await chromium.launchPersistentContext(dir, { timezoneId: "UTC", locale: "en-US" });
  // The stand-in answers with the version the page writes (app/specs/source/services.json).
  await context.addInitScript((version) => { window.__prismExtensionVersion = version; }, JSON.parse(readFileSync(new URL("../../app/specs/source/services.json", import.meta.url), "utf8")).extension.version);
  await context.addInitScript((items) => {
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.from !== "page") return;
      const answer = (data) => window.postMessage({ ...data, from: "extension" }, location.origin);
      if (event.data.prism === "hello") answer({ prism: "extension", version: window.__prismExtensionVersion });
      if (event.data.prism === "pull") answer({ prism: "items", id: event.data.id, items: [true, "yes"].includes(event.data.halted) ? [] : items });
    });
  }, items);
  return { context, page: context.pages()[0] ?? (await context.newPage()) };
}
// How many messages the Prism shows it holds, from the Messages card on Today.
const held = (page) => page.evaluate(() => Number([...document.querySelectorAll("#pr-home .pr-card")].find((c) => c.querySelector(".pr-card-go")?.dataset.place === "conversations")?.querySelector(".pr-card-count")?.textContent || 0));

test("it opens at once: the newest of 600 kept messages shows within the budget after a restart, and none is lost (QR-05)", { timeout: 15 * 60000 }, async () => {
  const server = await serve();
  const dir = mkdtempSync(join(tmpdir(), "prism-start-"));
  const items = messages();
  let context = null;
  let page = null;
  try {
    ({ context, page } = await visit(dir, server.url, items));
    await page.goto(server.url);
    await page.waitForFunction((n) => Number([...document.querySelectorAll("#pr-home .pr-card")].find((c) => c.querySelector(".pr-card-go")?.dataset.place === "conversations")?.querySelector(".pr-card-count")?.textContent || 0) >= n, KEPT, { timeout: 10 * 60000, polling: 500 });
    // The newest screenful is remembered once all are read; a moment more, then the browser closes.
    await page.waitForTimeout(3000);
    await context.close();
    ({ context, page } = await visit(dir, server.url, items));
    const newest = once.expect.title;
    const t0 = Date.now();
    await page.goto(server.url);
    await page.getByText(newest, { exact: true }).first().waitFor({ state: "visible", timeout: 60000 });
    const shown = Date.now() - t0;
    summary([`QR-05 restart-ms: the newest of ${KEPT} kept messages showed ${shown} ms after opening again (budget ${budget} ms)`]);
    assert.ok(shown <= budget, `opening again took ${shown} ms to show the newest message, over the budget of ${budget} ms`);
    await page.waitForFunction((n) => Number([...document.querySelectorAll("#pr-home .pr-card")].find((c) => c.querySelector(".pr-card-go")?.dataset.place === "conversations")?.querySelector(".pr-card-count")?.textContent || 0) >= n, KEPT, { timeout: 120000, polling: 500 }).catch(() => {});
    const lost = KEPT - (await held(page));
    assert.ok(lost <= measures["restart-lost"], `restart-lost: after opening again ${lost} of ${KEPT} kept messages are missing from Messages`);
  } finally {
    await context?.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    server.close();
  }
});
