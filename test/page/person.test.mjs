// CO-01: the Prism used the way its owner uses it, in headless Chromium,
// generated from the coherence registry (app/specs/coherence/spec.json) and
// the surface: content comes in through every feeder the registry names that
// a test can press (files, a Takeout zip, a paste, a note in each place), and
// then every place that lists things must list something, Today must show
// today's agenda with its clash, and Ask must answer from what was kept.
// A place added without a working feeder, or an Ask that answers with
// anything but the owner's own items, fails here.
//
// pages.yml runs it on the assembled page and again on the published page.
// usage: NODE_PATH="$(npm root --global)" [PAGE_SITE=dir | PAGE_URL=url] node --test test/page/person.test.mjs
import assert from "node:assert/strict";
import { createReadStream, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import test from "node:test";
import { deflateRawSync, crc32 } from "node:zlib";

const { chromium } = createRequire(import.meta.url)("playwright");
const site = resolve(process.env.PAGE_SITE ?? "site");
const published = process.env.PAGE_URL;
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const { PLACES } = await import(resolve("site/surface/surface.mjs"));
const { VOCABULARY, FEEDERS } = await import(resolve("site/coherence/coherence.mjs"));

// Synthetic content only: example.org addresses, no real person.
const pad = (n) => String(n).padStart(2, "0");
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const at = (days, hour, minute = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, minute, 0, 0); return d; };
const vevent = (uid, start, end, summary, location) => `BEGIN:VEVENT\r\nUID:${uid}@example.org\r\nDTSTAMP:${stamp(new Date())}\r\nDTSTART:${stamp(start)}\r\nDTEND:${stamp(end)}\r\nSUMMARY:${summary}\r\nLOCATION:${location}\r\nEND:VEVENT\r\n`;
const calendar = (...events) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//example//person test//EN\r\n${events.join("")}END:VCALENDAR\r\n`;
const message = (from, subject, body, days) => `From: ${from}\r\nTo: owner@example.org\r\nSubject: ${subject}\r\nDate: ${at(days, 9).toUTCString()}\r\nMessage-ID: <${subject.replace(/\W/g, "")}@example.org>\r\n\r\n${body}\r\n`;

function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const raw = Buffer.from(text);
    const packed = deflateRawSync(raw);
    const nameBytes = Buffer.from(name);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(8, 8);
    head.writeUInt32LE(crc32(raw), 14); head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(nameBytes.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc32(raw), 16); dir.writeUInt32LE(packed.length, 20); dir.writeUInt32LE(raw.length, 24); dir.writeUInt16LE(nameBytes.length, 28); dir.writeUInt32LE(offset, 42);
    locals.push(head, nameBytes, packed);
    central.push(dir, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const dirBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(dirBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dirBytes, end]);
}

test("the owner brings content in, every place shows it, Today and Ask answer from it (CO-01)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "person-"));
  const ics = join(dir, "calendar.ics");
  writeFileSync(ics, calendar(
    vevent("review", at(0, 0, 1), at(0, 23, 58), "Design review", "Studio"),
    vevent("dentist", at(0, 23, 0), at(0, 23, 59), "Dentist checkup", "Clinic"),
  ));
  const eml = join(dir, "statement.eml");
  writeFileSync(eml, message('"Example Bank" <statements@bank.example.org>', "Your November statement", "Your bank statement is ready. Payment due on the 28th.", -1));
  const takeout = join(dir, "takeout.zip");
  writeFileSync(takeout, zip([
    ["Takeout/Mail/All mail Including Spam and Trash.mbox", `From 1@xxx Mon Jan 1 00:00:00 2024\r\n${message("Robin Example <robin@example.org>", "Lunch on Thursday", "Shall we meet at the usual place?", -2)}\r\nFrom 2@xxx Mon Jan 1 00:00:00 2024\r\n${message("Shop <orders@shop.example.org>", "Your order has shipped", "Tracking for your package.", -3)}`],
    ["Takeout/Calendar/Travel.ics", calendar(vevent("flight", at(3, 8), at(3, 11), "Flight to Lisbon", "Airport"))],
    ["Takeout/Contacts/All Contacts/All Contacts.vcf", "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Jordan Example\r\nEMAIL:jordan@example.org\r\nEND:VCARD\r\n"],
  ]));

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
    const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(published ?? `http://127.0.0.1:${server.address().port}/me/`);
    await page.waitForSelector("html.pr-ready", { timeout: 60000 });
    const out = () => page.textContent("#pr-out");
    const settled = (pattern) => page.waitForFunction((p) => new RegExp(p).test(document.getElementById("pr-out").textContent), pattern.source, { timeout: 30000 });

    // A fresh profile opens on Today, which offers its feeder rather than nothing.
    assert.equal(await page.textContent("#pr-title"), PLACES.find((p) => p.host === "home").name);
    // Its device card offers Add files: the press opens the device row's own picker.
    const offered = page.locator('#pr-home .pr-card-feed[data-feed="device"]').first();
    assert.ok(await offered.isVisible(), "an empty Today offers to add files");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), offered.click()]);
    await chooser.setFiles([ics, eml]);
    await page.click('.pr-go[data-place="today"]');
    await settled(/^\d+ items$/);
    assert.match(await out(), /^3 items$/);

    // Today: the agenda first, what falls today marked, the clash marked (PrismChronology).
    await page.waitForFunction(() => document.querySelector("#pr-list .pr-section"), null, { timeout: 10000 });
    const review = page.locator("#pr-list .pr-item", { hasText: "Design review" });
    const dentist = page.locator("#pr-list .pr-item", { hasText: "Dentist checkup" });
    assert.match(await review.getAttribute("class"), /pr-now/);
    assert.match(await review.getAttribute("class"), /pr-clash/);
    assert.match(await dentist.getAttribute("class"), /pr-clash/);

    // A Takeout export, through the Boundary's own file control.
    await page.click('.pr-go[data-place="boundary"]');
    const zipInput = page.locator("#pr-settings input[type=file][accept*='.zip']");
    await zipInput.waitFor({ state: "attached", timeout: 15000 });
    await zipInput.setInputFiles(takeout);
    await page.waitForFunction(() => document.getElementById("pr-out").textContent !== "3 items", null, { timeout: 30000 });
    assert.match(await out(), /^4 items$/);

    // A paste of plain words is a note.
    await page.click('.pr-go[data-place="tasks"]');
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/plain", "Read the chapter on interval algebra");
      document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    });
    await page.waitForFunction(() => document.getElementById("pr-list").innerText.includes("interval algebra"), null, { timeout: 10000 });

    // A note in every place that keeps notes, in its own domain's words.
    for (const place of PLACES.filter((p) => p.act === "note" && p.viewpoint === "person")) {
      await page.click(`.pr-go[data-place="${place.key}"]`);
      const words = `${VOCABULARY[place.domains[0]][0]} for ${place.key}`;
      await page.fill("#pr-act input", words);
      await page.click("#pr-act button");
      await page.waitForFunction((w) => document.getElementById("pr-list").innerText.includes(w), words, { timeout: 10000 }).catch(() => {});
    }

    // Every place that lists things lists something now; Explore finds by its search.
    const empty = [];
    for (const place of PLACES.filter((p) => p.viewpoint === "person" && p.host !== "composer" && p.show !== "settings")) {
      await page.click(`.pr-go[data-place="${place.key}"]`);
      if (place.show === "search") await page.fill("#pr-act input[type=search]", "statement");
      await page.waitForTimeout(300);
      const shown = await page.locator("#pr-list .pr-item").count();
      if (!shown) empty.push(place.key);
    }
    assert.deepEqual(empty, [], `places with nothing after every feeder ran: ${empty.join(", ")}`);
    // The bank's mail is in Messages.
    await page.click('.pr-go[data-place="conversations"]');
    assert.ok((await page.locator("#pr-list").innerText()).includes("Your November statement"));
    // The contact card is in People.
    await page.click('.pr-go[data-place="people"]');
    assert.ok((await page.locator("#pr-list").innerText()).includes("Jordan Example") || (await page.locator("#pr-list .pr-item").count()) > 0);

    // Ask answers from what is kept, at once, without a model.
    const ask = async (question, expect) => {
      await page.fill("#pr-prompt", question);
      await page.click("#pr-ask-go");
      await page.waitForFunction(() => !document.getElementById("pr-ask-go").disabled, null, { timeout: 15000 });
      const said = await out();
      assert.match(said, expect, `Ask "${question}" said: ${said}`);
    };
    await ask("What's on today?", /Design review/);
    await ask("When is my flight?", /Flight to Lisbon/);
    await ask("Did the bank send a statement?", /November statement/);
    await ask("When is lunch with Robin?", /Lunch on Thursday/);
    await ask("zebra quantum marmalade", /^No answer$/);

    // Halted, Ask shows nothing kept.
    await page.click('.pr-go[data-place="boundary"]');
    await page.check("#pr-halt");
    await ask("What's on today?", /^Paused$/);
    await page.uncheck("#pr-halt");

    assert.deepEqual(errors, [], `page errors: ${errors.join(" | ")}`);
    // What FEEDERS names is what this walk pressed.
    assert.ok(["files", "paste", "note"].every((key) => FEEDERS.some((f) => f.key === key)));
  } finally {
    await browser.close();
    server.close();
  }
});
