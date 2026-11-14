// QR-05, it opens at once (F-06). A person who keeps hundreds of messages
// closes the browser and opens the Prism again: the newest of them is on the
// screen within "restart-ms", and none is lost ("restart-lost") once the rest
// are read. Both thresholds are the quality record's
// (app/specs/product/quality/QR-05.json).
// The messages are invented, at example.org, shaped as Gmail's originals
// read: an encoded sender, multipart, base64 plain and quoted-printable HTML.
// usage: NODE_PATH="$(npm root --global)" [PAGE_SITE=dir | PAGE_URL=url] node --test test/product/start.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium, product, serve, summary } from "./harness.mjs";

const KEPT = 600;
const measures = Object.fromEntries(product.quality.find((q) => q.key === "QR-05").measures.map((m) => [m.key, m.threshold]));
const budget = measures["restart-ms"];
const names = ["Ana", "Kai", "Lee", "Mara", "Noor", "Olu", "Priya", "Sol", "Tove", "Uma"];
const topics = ["Budget", "Garden", "Invoice", "Travel", "Report", "Photos", "School", "Plan"];
function messages(now = Date.now()) {
  return Array.from({ length: KEPT }, (_, i) => {
    const who = names[i % names.length];
    const at = new Date(now - (i + 1) * 3 * 3600_000);
    const subject = `${topics[i % topics.length]} note ${i}`;
    const plain = Buffer.from(`Hi,\r\n\r\nAbout the ${subject.toLowerCase()}: could you look at it?\r\n\r\n${who}\r\n`).toString("base64");
    return { service: "gmail", route: "own", kind: "message", format: "eml", text: [
      `From: =?UTF-8?B?${Buffer.from(`${who} Example`).toString("base64")}?= <${who.toLowerCase()}@example.org>`, "To: person@example.org",
      `Subject: ${subject}`, `Date: ${at.toUTCString()}`, `Message-ID: <st${i}@example.org>`, "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="b${i}"`, "", `--b${i}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", plain,
      `--b${i}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: quoted-printable", "", `<p>About the ${subject.toLowerCase()}.</p>`, `--b${i}--`, "",
    ].join("\r\n") };
  });
}

async function visit(dir, url, items) {
  const context = await chromium.launchPersistentContext(dir, { timezoneId: "UTC", locale: "en-US" });
  await context.addInitScript((items) => {
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.from !== "page") return;
      const answer = (data) => window.postMessage({ ...data, from: "extension" }, location.origin);
      if (event.data.prism === "hello") answer({ prism: "extension", version: 3 });
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
    const newest = "Budget note 0";
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
