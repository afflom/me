// Where each thing is listed, over the validation oracles' own examples
// (test/oracle/corpus.json: RFC 5322, 5545, 5546, 6047): a message is held once
// per Message-ID (RFC 5322 3.6.4); a message is in the place of messages, an
// event in the calendar's, a to-do or journal entry (RFC 5545 VTODO, VJOURNAL)
// in the notes'; every item that says something has a heading; and an
// invitation a message carries (RFC 6047) is on the calendar as its event.
// The places are the surface's (site/surface/surface.mjs).
// usage: node --test test/oracle/places.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readItem, reconcile, placesOf, useReader } from "../../site/card.mjs";
import * as reader from "../../site/read/read.mjs";
import { PLACES } from "../../site/surface/surface.mjs";
import { PEOPLE } from "../../site/coherence/coherence.mjs";

useReader(reader);
// QR-12's thresholds are its quality record's (app/specs/product/quality/QR-12.json).
const record = JSON.parse(readFileSync(new URL("../../app/specs/product/quality/QR-12.json", import.meta.url), "utf8"));
const threshold = Object.fromEntries(record.measures.map((m) => [m.key, m.threshold]));
const { corpus } = JSON.parse(readFileSync(new URL("corpus.json", import.meta.url), "utf8"));
const ARRIVED = Date.UTC(2026, 10, 14, 12);
const MEDIA = { message: ["message", 4], calendar: ["calendar", 5], recurrence: ["calendar", 5] };
const examples = corpus.filter((e) => MEDIA[e.kind]);
const items = examples.map((e) => readItem({ address: e.id, outcome: "restore", bytes: new TextEncoder().encode(e.raw), meta: { about: { media: MEDIA[e.kind][0], domain: MEDIA[e.kind][1], at: ARRIVED } } }));
const held = reconcile(items);
// The places that list things (the people's place lists people, from what they are in).
const nav = PLACES.filter((p) => p.host === "nav" && p.key !== PEOPLE.place);
const placeOf = (key) => nav.find((p) => p.key === key);
const listedIn = (item) => nav.filter((p) => placesOf(item).some((d) => p.domains.includes(d))).map((p) => p.key);
// The reference: each example's own fields.
const unfold = (raw) => raw.replace(/\r?\n[ \t]/g, "");
const header = (raw, name) => new RegExp(`^${name}:\\s*(.*)$`, "mi").exec(unfold(raw).split(/\r?\n\r?\n/)[0])?.[1]?.trim() ?? "";
const componentOf = (raw) => /^BEGIN:(VEVENT|VTODO|VJOURNAL|VFREEBUSY)\s*$/m.exec(raw)?.[1];

test("a message kept more than once is held once (RFC 5322 Message-ID)", () => {
  const ids = examples.filter((e) => e.kind === "message").map((e) => header(e.raw, "Message-ID")).filter(Boolean);
  assert.ok(new Set(ids).size < ids.length, "the oracles hold copies of one message to check");
  const shown = held.filter((i) => i.media === "message" && i.id).map((i) => i.id);
  const twice = shown.length - new Set(shown).size;
  assert.ok(twice <= threshold["message-twice"], `"message-twice": ${twice}`);
});

test("each message, event, to-do and journal entry is in the place of what it is", () => {
  const want = (item) => (item.media === "message" ? "conversations" : ["VTODO", "VJOURNAL"].includes(item.component) ? "tasks" : item.component === "VFREEBUSY" ? null : "calendar");
  assert.ok(want({ media: "message" }) && placeOf("conversations") && placeOf("calendar") && placeOf("tasks"), "the surface has the places");
  const wrong = held.filter((item) => {
    const where = listedIn(item);
    const own = want(item);
    return own ? where.length !== 1 || where[0] !== own : where.length !== 0;
  }).map((item) => `${item.address} in ${listedIn(item).join("+") || "none"}`);
  assert.ok(wrong.length <= threshold["out-of-place"], `"out-of-place": ${wrong.join(", ")}`);
  assert.ok(held.some((i) => i.component === "VTODO") && held.some((i) => i.component === "VJOURNAL"), "the oracles hold to-dos and journal entries");
});

test("everything that says something is headed by its own words", () => {
  const unheaded = held.filter((item) => item.component !== "VFREEBUSY" && item.body?.trim() && !item.title?.trim()).map((i) => i.address);
  assert.ok(unheaded.length <= threshold.unheaded, `"unheaded": ${unheaded.join(", ")}`);
  const blank = examples.find((e) => e.kind === "message" && !header(e.raw, "Subject"));
  assert.ok(blank, "the oracles hold a message without a subject");
  const item = held.find((i) => i.address === blank.id) ?? held.find((i) => i.id && i.id === header(blank.raw, "Message-ID").match(/<[^>]+>/)?.[0]);
  assert.ok(item.title && reader.messageBody(blank.raw).includes(item.title.replace(/…$/, "")), `${blank.id} is headed by its first words: "${item.title}"`);
});

test("an invitation a message carries is on the calendar as its event (RFC 6047)", () => {
  const carrying = examples.filter((e) => e.kind === "message" && /BEGIN:VEVENT/.test(e.raw));
  assert.ok(carrying.length, "the oracles hold invitations");
  const missed = carrying.filter((e) => {
    const uid = /^UID:(.*)$/m.exec(unfold(e.raw))?.[1]?.trim();
    const method = /^METHOD:(.*)$/m.exec(unfold(e.raw))?.[1]?.trim().toUpperCase();
    if (!uid || ["REPLY", "CANCEL", "REFRESH", "COUNTER", "DECLINECOUNTER"].includes(method)) return false;
    return !held.some((i) => i.media === "calendar" && i.uid === uid && listedIn(i).includes("calendar"));
  }).map((e) => e.id);
  assert.ok(missed.length <= threshold["invitation-missed"], `"invitation-missed": ${missed.join(", ")}`);
});
