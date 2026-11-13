// CO-02: the coherence gate. tools/coherence/gen.py --check passes on the
// registry as committed, and refuses each planted defect: a root facet with no
// model, a live facet whose modules never ask for it, an output nobody takes,
// a setting nothing drives, a feeder's media with no domain, a domain with no
// vocabulary. Then the runtime modules it binds: items find their domains by
// their words, an Ask finds its span, Today asks PrismChronology, and a
// Takeout zip opens to its entries.
// usage: node --test test/coherence/coherence.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

const SPEC = JSON.parse(readFileSync("app/specs/coherence/spec.json", "utf8"));
const gate = (spec) => {
  const args = ["-I", "tools/coherence/gen.py"];
  if (spec) {
    const path = join(mkdtempSync(join(tmpdir(), "coherence-")), "spec.json");
    writeFileSync(path, JSON.stringify(spec));
    args.push("--spec", path);
  } else args.push("--check");
  try {
    execFileSync("python3", args, { stdio: "pipe" });
    return "ok";
  } catch (error) {
    return String(error.stderr);
  }
};
const planted = (change) => { const spec = structuredClone(SPEC); change(spec); return gate(spec); };
const facet = (spec, key) => spec.facets.find((f) => f.key === key);

test("the committed registry is coherent and its generated module is current (CO-02)", () => {
  assert.equal(gate(), "ok");
});

test("each planted defect is refused (CO-02)", () => {
  assert.match(planted((s) => { s.facets = s.facets.filter((f) => f.key !== "when"); }), /the root routes when/);
  assert.match(planted((s) => { facet(s, "when").modules = ["site/coherence/sense.mjs"]; }), /asks the root for 'when'/);
  assert.match(planted((s) => { facet(s, "r4").in = ["owner", "kept"]; }), /gives 'span'/);
  assert.match(planted((s) => { facet(s, "boundary").drives = {}; }), /setting halt is driven by no live facet/);
  assert.match(planted((s) => { s.feeders[0].media.push("fax"); }), /'fax', which has no domain/);
  assert.match(planted((s) => { s.vocabulary[0] = []; }), /every domain of the design model needs its vocabulary/);
  assert.match(planted((s) => { facet(s, "google").drives = { places: ["today"] }; }), /google is sealed but drives the page/);
  assert.match(planted((s) => { facet(s, "dest").drives.acts = ["share"]; }), /act 'write' is driven by no live facet/);
});

const { domainsOf, drawOn, windowOf } = await import(resolve("site/coherence/sense.mjs"));
const { today } = await import(resolve("site/coherence/today.mjs"));

test("items find their domains by their words, and an Ask its span (CO-03)", () => {
  const bank = { domain: 4, media: "message", title: "Your November statement", who: "Example Bank", body: "Payment due", at: Date.now() };
  assert.ok(domainsOf(bank).includes(1), "a statement is about Money");
  assert.ok(domainsOf(bank).includes(4));
  const now = new Date(2026, 10, 13, 10).getTime();
  const span = windowOf("what's on tomorrow?", now);
  assert.equal(new Date(span.from).getDate(), 14);
  assert.equal(windowOf("hello there", now), null);
  const flight = { domain: 5, media: "calendar", title: "Flight to Lisbon", who: "Airport", body: "", at: new Date(2026, 10, 16, 8).getTime() };
  assert.deepEqual(drawOn([bank, flight], "when is my flight?", { now }), [flight]);
  assert.deepEqual(drawOn([bank, flight], "zebra quantum", { now }), []);
  assert.deepEqual(drawOn([{ ...flight, sealed: true }], "flight", { now }), []);
});

test("Today asks PrismChronology what falls today and what clashes (CO-03)", async () => {
  const now = new Date(2026, 10, 13, 9).getTime();
  const ev = (title, h1, h2, day = 13) => ({ media: "calendar", title, at: new Date(2026, 10, day, h1).getTime(), text: "" , domain: 5 });
  const asked = [];
  // A stand-in for the root's `when`, Allen's relations on [a,b) [c,d).
  const relate = async (a, b, c, d) => {
    asked.push([a, b, c, d]);
    if (b <= c) return b === c ? "meets" : "before";
    if (d <= a) return d === a ? "metby" : "after";
    return "overlaps";
  };
  const items = [ev("Review", 10, 11), ev("Dentist", 10, 12), ev("Trip", 8, 9, 16), ev("Old", 6, 7, 1)];
  const { agenda } = await today(items, { now, relate });
  assert.deepEqual(agenda.map((a) => a.item.title), ["Review", "Dentist", "Trip"]);
  assert.deepEqual(agenda.map((a) => a.today), [true, true, false]);
  assert.equal(agenda[0].clash[0].title, "Dentist");
  assert.equal(agenda[2].clash.length, 0);
  assert.ok(asked.every((q) => q.every((m) => m >= 0 && m <= 10080)), "every question is minutes within one week");
});

test("a Takeout zip opens to its entries, deflated and stored (CO-04)", async () => {
  const { zipEntries } = await import(resolve("site/device/zip.mjs"));
  const entry = (name, text, method) => {
    const raw = Buffer.from(text);
    const data = method === 8 ? deflateRawSync(raw) : raw;
    return { name: Buffer.from(name), raw, data, method };
  };
  const entries = [entry("Takeout/Calendar/a.ics", "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n".repeat(50), 8), entry("Takeout/Mail/b.mbox", "From x\r\n\r\nhi\r\n", 0)];
  const parts = [];
  const dirs = [];
  let offset = 0;
  for (const e of entries) {
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(e.method, 8); head.writeUInt32LE(e.data.length, 18); head.writeUInt32LE(e.raw.length, 22); head.writeUInt16LE(e.name.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(e.method, 10); dir.writeUInt32LE(e.data.length, 20); dir.writeUInt32LE(e.raw.length, 24); dir.writeUInt16LE(e.name.length, 28); dir.writeUInt32LE(offset, 42);
    parts.push(head, e.name, e.data);
    dirs.push(dir, e.name);
    offset += 30 + e.name.length + e.data.length;
  }
  const dirBytes = Buffer.concat(dirs);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(2, 8); end.writeUInt16LE(2, 10); end.writeUInt32LE(dirBytes.length, 12); end.writeUInt32LE(offset, 16);
  const file = new File([Buffer.concat([...parts, dirBytes, end])], "takeout.zip");
  const got = await zipEntries(file);
  assert.deepEqual(got.map((e) => [e.name, e.parent]), [["a.ics", "Calendar"], ["b.mbox", "Mail"]]);
  assert.equal(await got[0].text(), entries[0].raw.toString());
  assert.equal(await got[1].text(), entries[1].raw.toString());
  await assert.rejects(zipEntries(new File([Buffer.from("not a zip")], "x.zip")), /not a zip/);
});

test("Needs me holds what asks the person or names a deadline, until cleared (J2)", async () => {
  const { needs } = await import(resolve("site/coherence/today.mjs"));
  const now = Date.now();
  const items = [
    { address: "a", media: "message", at: now, title: "Lunch on Thursday?", body: "Shall we meet at noon? Let me know." },
    { address: "b", media: "message", at: now - 1000, title: "Your statement", body: "Payment is due on the 28th." },
    { address: "c", media: "message", at: now, title: "Your order shipped", body: "Tracking for your package." },
    { address: "d", media: "calendar", at: now, title: "Review?", body: "" },
    { address: "e", media: "message", at: now, title: "Re: plans", body: "Sounds good.\n> Could you come?" },
  ];
  assert.deepEqual(needs(items, { now }).map((n) => [n.item.address, n.why, n.phrase]), [["a", "asks", ""], ["b", "due", "due on the 28th"]]);
  assert.deepEqual(needs(items, { now, done: new Set(["a"]) }).map((n) => n.item.address), ["b"]);
});

test("People are drawn from who wrote, who is invited and whose card is kept (J7)", async () => {
  const { peopleOf, between } = await import(resolve("site/coherence/people.mjs"));
  const now = Date.now();
  const items = [
    { media: "message", at: now - 5, title: "Lunch", text: "From: Robin Example <robin@example.org>\r\nTo: person@example.org\r\n\r\nhi" },
    { media: "calendar", at: now + 600000, title: "Review", text: "BEGIN:VEVENT\r\nATTENDEE;CN=Robin Example:mailto:robin@example.org\r\nEND:VEVENT" },
    { media: "contactCard", at: 0, title: "Jordan Example", text: "BEGIN:VCARD\r\nFN:Jordan Example\r\nEMAIL:jordan@example.org\r\nEND:VCARD" },
  ];
  const all = peopleOf(items);
  assert.deepEqual(all.map((p) => p.name), ["Robin Example", "Jordan Example"]);
  assert.deepEqual(between(all[0], now).map((i) => i.title), ["Review", "Lunch"]);
});

test("Who you are is read from the person's own mail, and they are not one of their People (J9)", async () => {
  const { selfOf, peopleOf, fromMe } = await import(resolve("site/coherence/people.mjs"));
  const m = (from, to) => ({ media: "message", at: 1, text: `From: ${from}\r\nTo: ${to}\r\n\r\nx` });
  const items = [m("Robin <robin@example.org>", "Pat Example <pat@example.org>"), m("Sam <sam@example.org>", "pat@example.org, robin@example.org"), m("Pat Example <pat@example.org>", "Robin <robin@example.org>")];
  const me = selfOf(items);
  assert.deepEqual(me, { names: ["Pat Example"], addresses: ["pat@example.org"] });
  assert.deepEqual(peopleOf(items, me).map((p) => p.name), ["Robin", "Sam"]);
  assert.deepEqual(items.map((i) => fromMe(i, me)), [false, false, true]);
});
