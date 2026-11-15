// TM-04: how often a source's content arrives is measured from when its things
// came, on the specifications' own examples (test/oracle/corpus.json): the
// instances RFC 5545 section 3.8.5.3 lists for each recurrence rule are
// arrivals whose rhythm the rule states, read by the reference reader
// (tools/oracle/gen.py). Each listing is cut at every instance: what came
// before is held, and the measured rhythm's next is held to the one listed next.
// QR-11 "rhythm-misread": a single-period rule or a weekly rule by weekday,
// with three cycles held, measured as other than its own rhythm, at most 0.
// QR-11 "rhythm-mispredicted": the share of claimed rhythms whose next misses
// the listed next by more than a tenth of the period, at most 0.03 (a season's
// end, as "every day in January" has on January 31, cannot be foreseen).
// usage: node --test test/time/rhythm.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readItem, useReader } from "../../site/card.mjs";
import * as reader from "../../site/read/read.mjs";
import { everyOf, rhythmOf, rhythms, sourceOf } from "../../site/time/rhythm.mjs";

useReader(reader);
const { corpus } = JSON.parse(readFileSync(new URL("../oracle/corpus.json", import.meta.url), "utf8"));
const rules = corpus.filter((e) => e.kind === "recurrence");
// All the RFC's examples are in the Eastern United States time zone (3.8.5.3).
const zone = /TZID=([^:;]+)/.exec(JSON.parse(rules[0].raw).ical)[1];
const FREQ = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year", HOURLY: "hour", MINUTELY: "minute" };
const part = (rule, name) => new RegExp(`(?:^|;)${name}=([^;]+)`).exec(rule)?.[1];
// The rhythm a rule states, where it has one: a single period, or a week by its weekdays.
function stated(e) {
  const rule = e.expect.rule;
  if (/EXDATE/.test(JSON.parse(e.raw).ical)) return null;
  const by = rule.split(";").map((p) => p.split("=")[0]).filter((k) => k.startsWith("BY"));
  const k = Number(part(rule, "INTERVAL") ?? 1);
  if (!by.length) return { unit: FREQ[part(rule, "FREQ")], k, per: 1 };
  const freq = part(rule, "FREQ");
  const list = (name) => part(rule, name).split(",");
  // A week by its weekdays, a month by its days or by one weekday's place in it, a year by its months.
  if (freq === "WEEKLY" && by.join() === "BYDAY" && !/\d/.test(part(rule, "BYDAY"))) return { unit: "week", k, per: list("BYDAY").length };
  if (freq === "MONTHLY" && by.join() === "BYDAY" && /^[+-]?\d[A-Z]{2}$/.test(part(rule, "BYDAY"))) return { unit: "month", k, per: 1 };
  if (freq === "MONTHLY" && by.join() === "BYMONTHDAY" && list("BYMONTHDAY").every((d) => Number(d) > 0)) return { unit: "month", k, per: list("BYMONTHDAY").length };
  if (freq === "YEARLY" && by.join() === "BYMONTH") return { unit: "year", k, per: list("BYMONTH").length };
  return null;
}

test("the listings hold rhythms of every period and cycles of several arrivals", () => {
  const known = rules.map(stated).filter(Boolean);
  for (const unit of ["minute", "day", "week", "month", "year"]) assert.ok(known.some((r) => r.unit === unit), `no listing keeps a rhythm of a ${unit}`);
  assert.ok(known.some((r) => r.per > 1), "no listing has several arrivals a cycle");
  assert.ok(known.some((r) => r.k > 1), "no listing has a rhythm of more than one period");
});

test("QR-11: a rule's own rhythm is measured, and a claimed rhythm's next is the next listed", () => {
  const misread = [];
  let claimed = 0;
  let missed = 0;
  for (const e of rules) {
    const listed = e.expect.instances;
    const own = stated(e);
    for (let cut = 3; cut < listed.length; cut += 1) {
      const r = rhythmOf(listed.slice(0, cut), { zone });
      if (own && cut - own.per >= 3 && !(r && r.unit === own.unit && r.k === own.k && r.per === own.per && r.next === listed[cut])) {
        misread.push(`${e.id} after ${cut}: ${r ? `${r.per} every ${r.k} ${r.unit}` : "none"}, not ${own.per} every ${own.k} ${own.unit}`);
      }
      if (!r) continue;
      claimed += 1;
      if (Math.abs(r.next - listed[cut]) > 0.1 * r.period) missed += 1;
    }
  }
  const rhythmMisread = misread.length;
  const rhythmMispredicted = missed / claimed;
  assert.ok(claimed > 100, `only ${claimed} claims`);
  assert.ok(rhythmMisread <= 0, `rhythm-misread: ${rhythmMisread} (${misread.slice(0, 6).join("; ")})`);
  assert.ok(rhythmMispredicted <= 0.03, `rhythm-mispredicted: ${rhythmMispredicted.toFixed(3)} (${missed} of ${claimed})`);
});

test("arrivals that keep no cycle have no rhythm", () => {
  // The RFC 5322 Appendix A messages from one sender, at the times the reference reader read.
  const bySender = new Map();
  for (const e of corpus.filter((c) => c.kind === "message" && c.expect.from && Number.isFinite(c.expect.at))) bySender.set(e.expect.from, [...(bySender.get(e.expect.from) ?? []), e.expect.at]);
  for (const [sender, times] of bySender) if (new Set(times).size < 4) assert.equal(rhythmOf(times), null, `${sender}: fewer than three cycles`);
  assert.equal(rhythmOf([]), null);
});

test("the chat says how often a sender writes, beside their message", async () => {
  const { sentenceOf } = await import("../../site/router/answer.mjs");
  const MEDIA = { message: "message" };
  const encoder = new TextEncoder();
  const read = (e) => readItem({ address: e.id, outcome: "restore", bytes: encoder.encode(e.raw), meta: { about: { media: MEDIA[e.kind], domain: 4, at: 0 } } });
  const messages = corpus.filter((e) => e.kind === "message" && e.expect.from).map(read);
  // The source is the sender's address, as the reference reader reads it.
  for (const e of corpus.filter((c) => c.kind === "message" && c.expect.from)) assert.equal(sourceOf(messages.find((m) => m.address === e.id)), e.expect.from, e.id);
  // The examples hold no sender with a rhythm: when one appears, the chat must say it (and this line goes).
  const held = rhythms(messages);
  assert.deepEqual([...held.keys()], [], "an example now keeps a rhythm: hold its sentence to it");
  // Given a rhythm, the sentence says it: a weekly rule's own, and a week of two arrivals.
  const item = messages[0];
  const weekly = rules.filter((e) => stated(e)?.unit === "week").map((e) => rhythmOf(e.expect.instances, { zone })).filter(Boolean);
  assert.ok(weekly.some((r) => r.per === 1) && weekly.some((r) => r.per > 1), "a weekly rhythm of one arrival and one of several");
  for (const r of weekly) {
    const sentence = sentenceOf(item, null, { rhythm: new Map([[sourceOf(item), r]]) });
    const every = everyOf(r, undefined);
    assert.ok(sentence.endsWith(r.per > 1 ? `; they write about ${r.per} times every ${every}` : `; they write about every ${every}`), sentence);
  }
  assert.ok(!sentenceOf(item, null, { rhythm: new Map() }).includes("they write"), "no rhythm, nothing said");
});

test("a period is said in the person's words", () => {
  assert.equal(everyOf({ unit: "week", k: 1 }, "en"), "week");
  assert.equal(everyOf({ unit: "week", k: 2 }, "en"), new Intl.NumberFormat("en", { style: "unit", unit: "week", unitDisplay: "long" }).format(2));
  assert.equal(everyOf(null), "");
});
