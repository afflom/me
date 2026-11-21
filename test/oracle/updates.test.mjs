// RFC 5546 (iTIP) and RFC 5545 over the validation oracles' own calendar examples
// (test/oracle/corpus.json): the calendar the person holds has each event once, at
// its latest revision per instance; a REPLY, CANCEL, REFRESH, COUNTER or
// DECLINECOUNTER is folded into the event it names and never shows as an event of
// its own; a cancellation of the whole event marks it cancelled; and an object
// with no time of its own (no DTSTART or DUE) is never placed at the time it
// arrived. The reference reading below is the examples' own content lines.
// usage: node --test test/oracle/updates.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readItem, reconcile, useReader } from "../../site/card.mjs";
import * as reader from "../../site/read/read.mjs";

useReader(reader);
// QR-08's thresholds are its quality record's (app/specs/product/quality/QR-08.json).
const record = JSON.parse(readFileSync(new URL("../../app/specs/product/quality/QR-08.json", import.meta.url), "utf8"));
const threshold = Object.fromEntries(record.measures.map((m) => [m.key, m.threshold]));
const corpus = JSON.parse(readFileSync(new URL("corpus.json", import.meta.url), "utf8")).corpus.filter((e) => e.kind === "calendar");
const ARRIVED = Date.UTC(2026, 10, 14, 12);
const UPDATES = ["REPLY", "CANCEL", "REFRESH", "COUNTER", "DECLINECOUNTER"];
// The reference: each example's METHOD and its first component's UID, SEQUENCE, RECURRENCE-ID and times.
const lines = (raw) => raw.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
// A line whose parameter has no "=" is not a content line (RFC 5545 3.1): RFC 5546 writes one, RECURRENCE-ID;THISANDFUTURE, and it is not read.
const field = (ls, name) => ls.find((l) => new RegExp(`^${name}(;[^;:=]+=[^;:]*)*:`, "i").test(l))?.replace(/^[^:]*:/, "").trim() ?? "";
const reference = corpus.map((example) => {
  const all = lines(example.raw);
  const begin = all.findIndex((l) => /^BEGIN:V(EVENT|TODO|JOURNAL)$/i.test(l));
  const end = all.findIndex((l, i) => i > begin && /^END:V(EVENT|TODO|JOURNAL)$/i.test(l));
  // An object with no event, to-do or journal (a VFREEBUSY) is read whole.
  const own = begin < 0 ? all : all.slice(begin, end).filter((l, i, ls) => !ls.slice(0, i).some((x) => /^BEGIN:VALARM/i.test(x)) || ls.slice(0, i).some((x) => /^END:VALARM/i.test(x)));
  return { example, method: field(all, "METHOD").toUpperCase(), uid: field(own, "UID"), sequence: Number(field(own, "SEQUENCE")) || 0, recurrence: field(own, "RECURRENCE-ID"), timed: Boolean(field(own, "DTSTART") || field(own, "DUE")) };
});
const items = reference.map(({ example }) => readItem({ address: example.id, outcome: "restore", bytes: new TextEncoder().encode(example.raw), meta: { about: { media: "calendar", domain: 5, at: ARRIVED } } }));
const held = reconcile(items);

test("no reply, cancellation or request about an event shows as an event of its own", () => {
  const shown = held.map((item) => reference[items.indexOf(item)] ?? reference.find((r) => r.example.id === item.address.replace(/#.*$/, "")));
  const updates = shown.filter((r) => UPDATES.includes(r.method)).map((r) => `${r.example.id} ${r.method}`);
  assert.ok(updates.length <= threshold["update-shown"], `"update-shown": ${updates.join(", ")}`);
  assert.ok(reference.some((r) => UPDATES.includes(r.method)), "the oracles hold replies and cancellations to check");
});

test("each event is held once per instance, at its latest revision", () => {
  const groups = new Map();
  for (const r of reference) if (r.uid && !UPDATES.includes(r.method)) groups.set(`${r.uid}|${r.recurrence}`, [...(groups.get(`${r.uid}|${r.recurrence}`) ?? []), r]);
  for (const [key, group] of groups) {
    const kept = held.filter((item) => `${item.uid}|${item.recurrence ?? ""}` === key);
    assert.equal(kept.length, 1, `${key} is held ${kept.length} times`);
    assert.equal(kept[0].sequence, Math.max(...group.map((r) => r.sequence)), `${key} is held at revision ${kept[0].sequence}`);
  }
});

test("a cancellation of the whole event marks it cancelled, and of one instance only that instance", () => {
  for (const r of reference.filter((r) => r.method === "CANCEL" && r.uid)) {
    const event = held.find((item) => item.uid === r.uid && (item.recurrence ?? "") === r.recurrence);
    const latest = held.filter((item) => item.uid === r.uid && (item.recurrence ?? "") === r.recurrence);
    if (!event) continue;
    assert.equal(Boolean(event.cancelled), r.sequence >= Math.max(...latest.map((i) => i.sequence)), `${r.example.id} cancels ${r.uid} ${r.recurrence || "(all)"}`);
  }
  const masters = held.filter((item) => !item.recurrence && item.cancelled);
  for (const m of masters) assert.ok(reference.some((r) => r.method === "CANCEL" && r.uid === m.uid && !r.recurrence), `${m.address} is cancelled by no whole-event cancellation`);
});

test("an object with no time of its own is never placed at the time it arrived", () => {
  const placed = items.filter((item, i) => !reference[i].timed && item.at === ARRIVED).map((item) => item.address);
  assert.ok(placed.length <= threshold["undated-placed"], `"undated-placed": ${placed.join(", ")}`);
  assert.ok(items.every((item, i) => reference[i].timed || item.undated), "and it is marked as having no time");
});
