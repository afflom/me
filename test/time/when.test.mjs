// The Prism reads back its own dates: every event, to-do and journal entry of the
// specifications' examples (test/oracle/corpus.json, RFC 5545 and RFC 5546) is said
// by the Prism's own sentence (site/router/answer.mjs whenOf, "Tue, Jul 1 at 8:00 PM"),
// and the time reader the router maps "startTime" with (site/router/features.mjs)
// reads that sentence back to the same day and minute, its month and day outranking
// its weekday. The examples' times are the reference reader's (tools/oracle/ical.py).
// usage: node --test test/time/when.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readItem, useReader } from "../../site/card.mjs";
import * as reader from "../../site/read/read.mjs";
import { whenOf } from "../../site/router/answer.mjs";
import { READERS } from "../../site/router/features.mjs";

useReader(reader);
const { corpus } = JSON.parse(readFileSync(new URL("../oracle/corpus.json", import.meta.url), "utf8"));
const encoder = new TextEncoder();
const items = corpus.filter((e) => e.kind === "calendar").map((example) => ({ example, item: readItem({ address: example.id, outcome: "restore", bytes: encoder.encode(example.raw), meta: { about: { media: "calendar", domain: 5, at: 0 } } }) }))
  .filter(({ item }) => !item.undated && Number.isFinite(item.at));
const minute = (at) => Math.floor(at / 60_000);

test("the examples hold dated items to say", () => {
  assert.ok(items.length >= 10, `only ${items.length} dated examples`);
  assert.ok(items.some(({ item }) => item.allDay) && items.some(({ item }) => !item.allDay), "the examples hold both all-day and timed items");
});

test("each example's time, said by the Prism, reads back to the same day and minute", () => {
  for (const { example, item } of items) {
    const said = whenOf(item.at, item.allDay);
    // Said a week before it happens, as a reminder would say it.
    const read = READERS.time(said, { now: item.at - 7 * 86_400_000 });
    assert.ok(read, `${example.id}: "${said}" reads as no time`);
    const at = item.allDay ? new Date(item.at).setHours(0, 0, 0, 0) : item.at;
    assert.equal(minute(read.start), minute(at), `${example.id}: "${said}" reads as ${new Date(read.start).toISOString()}, not ${new Date(at).toISOString()}`);
    assert.equal(read.allDay, Boolean(item.allDay), `${example.id}: "${said}" all day`);
  }
});
