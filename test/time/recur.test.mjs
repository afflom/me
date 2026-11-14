// TM-03: a repeating thing keeps its own rhythm, on the specification's own
// examples (test/oracle/corpus.json): RFC 5545 section 3.8.5.3's recurrence
// rules and the instances it lists for each, read by the reference reader
// (tools/oracle/gen.py), with the RFC Editor's verified errata applied.
// QR-10 "recurrence-misplaced": moments within a listing where the Prism's
// next instance is not the specification's, at most 0.
// usage: node --test test/time/recur.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readItem, useReader } from "../../site/card.mjs";
import * as reader from "../../site/read/read.mjs";
import { instances, nextInstance } from "../../site/time/recur.mjs";

useReader(reader);
const { corpus } = JSON.parse(readFileSync(new URL("../oracle/corpus.json", import.meta.url), "utf8"));
const rules = corpus.filter((e) => e.kind === "recurrence");
const ical = (e) => JSON.parse(e.raw).ical;
const rule = (e) => e.expect.rule;

test("the examples cover the rule's parts and its zone's changes", () => {
  for (const part of ["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "HOURLY", "MINUTELY", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYYEARDAY", "BYWEEKNO", "BYMONTH", "BYSETPOS", "BYHOUR", "BYMINUTE", "WKST"]) {
    assert.ok(rules.some((e) => new RegExp(`(^|[;=])${part}([=;]|$)`).test(rule(e))), `no example uses ${part}`);
  }
  assert.ok(rules.some((e) => /^EXDATE/m.test(ical(e))), "no example excludes an instance");
  // The listings cross daylight saving: the same 9:00 AM is a different UTC hour in each half.
  const hours = new Set(rules.flatMap((e) => e.expect.instances.map((at) => new Date(at).getUTCHours())));
  assert.ok(hours.has(13) && hours.has(14), [...hours].join(","));
});

test("QR-10 recurrence-misplaced: from any moment in a listing, the next instance is the one listed next", () => {
  const misplaced = [];
  for (const e of rules) {
    const listed = e.expect.instances;
    listed.forEach((at, i) => {
      // At an instance, it is that one; just after the one before, it is this one.
      if (nextInstance(ical(e), at) !== at) misplaced.push(`${e.id} at ${new Date(at).toISOString()}`);
      if (i > 0 && nextInstance(ical(e), listed[i - 1] + 1) !== at) misplaced.push(`${e.id} after ${new Date(listed[i - 1]).toISOString()}`);
    });
    // A whole listing has nothing after its last: it is over, and stays at the last time it had.
    if (e.expect.whole && nextInstance(ical(e), listed.at(-1) + 1) !== listed.at(-1)) misplaced.push(`${e.id} after its end`);
  }
  assert.ok(misplaced.length <= 0, `recurrence-misplaced: ${misplaced.length} (${misplaced.slice(0, 8).join("; ")})`);
});

test("a repeating event in the person's content appears at its next time, by its own rule", () => {
  const MEDIA = { calendar: "calendar" };
  const encoder = new TextEncoder();
  const repeating = corpus.filter((e) => e.kind === "calendar" && e.expect.repeats && e.expect.start && "at" in e.expect.start);
  assert.ok(repeating.length > 0, "an RFC 5546 example that repeats");
  for (const e of repeating) {
    const component = /BEGIN:(?:VEVENT|VTODO|VJOURNAL)[\s\S]*?END:(?:VEVENT|VTODO|VJOURNAL)/.exec(e.raw)[0];
    const now = Date.now();
    const item = readItem({ address: e.id, outcome: "restore", bytes: encoder.encode(e.raw), meta: { about: { media: MEDIA[e.kind], domain: 4, at: 0 } } });
    const all = instances(component, { limit: 100_000 });
    assert.ok(all.includes(item.at) || item.at >= now, `${e.id}: ${new Date(item.at).toISOString()} is one of its own instances`);
    // Still repeating: at or after now. Run out: the last time it had.
    const next = all.find((at) => at >= now);
    assert.equal(item.at, next ?? all.at(-1), `${e.id}: ${next === undefined ? "its last" : "its next"} instance`);
  }
});
