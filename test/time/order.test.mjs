// TM-01: the Prism orders content by its own order before the clock, on the
// specifications' own examples (test/oracle/corpus.json): a conversation by
// what each message replies to and references (RFC 5322 3.6.4, the Appendix A
// exchange), an event by its revisions (RFC 5545 and RFC 5546 UID and
// SEQUENCE). What each example depends on is the reference reader's reading
// (tools/oracle/gen.py), never the Prism's; and wall-time says how far a thing
// is from now in the period it spans.
// QR-07 "order-misplaced": examples placed before what they build on, or out
// of their own SEQUENCE, at most 0.
// usage: node --test test/time/order.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readItem, useReader } from "../../site/card.mjs";
import * as reader from "../../site/read/read.mjs";
import { relativeOf, sequence } from "../../site/time/time.mjs";

useReader(reader);
const { corpus } = JSON.parse(readFileSync(new URL("../oracle/corpus.json", import.meta.url), "utf8"));
const encoder = new TextEncoder();
const MEDIA = { message: "message", calendar: "calendar" };
const read = (example) => readItem({ address: example.id, outcome: "restore", bytes: encoder.encode(example.raw), meta: { about: { media: MEDIA[example.kind], domain: 4, at: 0 } } });
const messages = corpus.filter((e) => e.kind === "message" && e.expect.id);
const events = corpus.filter((e) => e.kind === "calendar" && e.expect.uid);

test("the examples hold a conversation and revisions to order", () => {
  assert.ok(messages.some((e) => e.expect.refs?.length >= 2), "no message that references two before it");
  const uids = new Map();
  for (const e of events) uids.set(e.expect.uid, new Set([...(uids.get(e.expect.uid) ?? []), e.expect.sequence ?? 0]));
  assert.ok([...uids.values()].some((s) => s.size >= 3), "no event with three revisions");
});

test("a conversation is in the order of what each message builds on (RFC 5322 3.6.4)", () => {
  const order = sequence(messages.map(read));
  // The reference reading's conversations: messages joined by what they name.
  const byId = new Map(messages.map((e) => [e.expect.id, e]));
  const deps = (e) => [...(e.expect.refs ?? []), ...(e.expect.replyTo ?? [])].filter((id) => byId.has(id) && id !== e.expect.id);
  const group = (e, seen = new Set()) => {
    for (const next of [e.expect.id, ...deps(e)]) {
      if (seen.has(next)) continue;
      seen.add(next);
      for (const other of messages) if (other.expect.id === next || deps(other).includes(next)) group(other, seen);
    }
    return seen;
  };
  for (const e of messages) {
    const place = order.get(e.id);
    assert.ok(place, `${e.id} has no place in a conversation`);
    assert.equal(place.of, group(e).size, `${e.id}: its conversation holds ${group(e).size} messages`);
    for (const id of deps(e)) {
      const before = order.get(byId.get(id).id);
      assert.ok(before.turn < place.turn, `${e.id} (turn ${place.turn}) builds on ${id} (turn ${before.turn}), so comes after it`);
      assert.equal(before.root, place.root, `${e.id} and ${id} are one conversation`);
    }
  }
  // Dependence decides even against the clock: the reply read first still comes second.
  const reply = messages.find((e) => e.expect.refs?.length >= 2);
  const early = messages.map(read).map((item) => (item.address === reply.id ? { ...item, at: -1e15 } : item));
  const moved = sequence(early).get(reply.id);
  assert.equal(moved.turn, order.get(reply.id).turn, "a reply stamped before what it answers keeps its place after it");
});

test("QR-07 order-misplaced: nothing comes before what it builds on or out of its own SEQUENCE", () => {
  const conversation = sequence(messages.map(read));
  const byId = new Map(messages.map((e) => [e.expect.id, e]));
  const before = messages.filter((e) => [...(e.expect.refs ?? []), ...(e.expect.replyTo ?? [])].some((id) => byId.has(id) && id !== e.expect.id && conversation.get(byId.get(id).id).turn >= conversation.get(e.id).turn));
  const revisions = sequence(events.map(read));
  const outOfStep = events.filter((e) => events.some((o) => o.expect.uid === e.expect.uid && (o.expect.sequence ?? 0) < (e.expect.sequence ?? 0) && revisions.get(o.id).revision >= revisions.get(e.id).revision));
  const orderMisplaced = before.length + outOfStep.length;
  assert.ok(orderMisplaced <= 0, `order-misplaced: ${orderMisplaced} (${[...before, ...outOfStep].map((e) => e.id).join(", ")})`);
});

test("an event's revisions are in its own SEQUENCE order, the latest marked (RFC 5545, RFC 5546)", () => {
  const order = sequence(events.map(read));
  for (const e of events) {
    const steps = [...new Set(events.filter((o) => o.expect.uid === e.expect.uid).map((o) => o.expect.sequence ?? 0))].sort((a, b) => a - b);
    const place = order.get(e.id);
    assert.ok(place, `${e.id} has no revision`);
    assert.equal(place.revision, steps.indexOf(e.expect.sequence ?? 0) + 1, `${e.id}: SEQUENCE ${e.expect.sequence ?? 0} of ${steps.join(",")}`);
    assert.equal(place.of, steps.length);
    assert.equal(place.latest, (e.expect.sequence ?? 0) === steps.at(-1));
  }
});

test("wall-time tells how far a thing is from now, in the period it spans", () => {
  // The Appendix A exchange's own times: the reply came 58 minutes before the reply to it.
  const [first, second] = [messages.find((e) => e.expect.replyTo?.length && !(e.expect.refs?.length >= 2)), messages.find((e) => e.expect.refs?.length >= 2)];
  const words = (n, unit) => new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(n, unit);
  const gap = second.expect.at - first.expect.at;
  assert.equal(relativeOf(first.expect.at, second.expect.at, "en"), words(-Math.trunc(gap / 60_000), "minute"));
  assert.equal(relativeOf(second.expect.at, first.expect.at, "en"), words(Math.trunc(gap / 60_000), "minute"));
  assert.equal(relativeOf(first.expect.at, first.expect.at, "en"), words(0, "second"));
  // Days by the calendar: one minute before the start of a day is yesterday from the minute after it.
  const midnight = new Date(first.expect.at); midnight.setHours(24, 0, 0, 0);
  assert.equal(relativeOf(midnight.getTime() - 60_000, midnight.getTime() + 60_000, "en"), words(-1, "day"));
  // Beyond a week, weeks; beyond a month, months; beyond a year, years: the RFC's 1997 message from its 2003 one.
  const later = messages.find((e) => e.expect.at > first.expect.at + 31_556_952_000 * 5);
  assert.match(relativeOf(first.expect.at, later.expect.at, "en"), / years ago$/);
  assert.match(relativeOf(first.expect.at + 20 * 86_400_000, first.expect.at, "en"), /^in \d+ weeks$/);
  assert.match(relativeOf(first.expect.at - 90 * 86_400_000, first.expect.at, "en"), / months ago$/);
  assert.equal(relativeOf(Number.NaN, first.expect.at), "");
});

// The chat, on the same examples: it says what time it is from the Prism's own
// clock, how far a message is from now, and where it stands in its conversation.
test("the chat answers from now: the time, how long ago, and a message's turn", async () => {
  const { judge, FIELDS } = await import("../../site/router/table.mjs");
  const { answer } = await import("../../site/router/answer.mjs");
  const { specDecider } = await import("../../site/r4/decide.mjs");
  const askDecide = specDecider(JSON.parse(readFileSync(new URL("../../app/specs/ask/spec.json", import.meta.url), "utf8")));
  const line = async (text) => {
    const [facet, ...rest] = text.split(" ");
    if (facet === "boundary") return "allow";
    if (facet === "ask") return askDecide(rest.join(" ")).outcome;
    return judge(Object.fromEntries(FIELDS.map(([name], i) => [name, rest[i]])));
  };
  const thread = messages.filter((e) => e.source === "rfc5322").map(read).map((item) => ({ ...item, label: "confidential" }));
  const reply = messages.find((e) => e.expect.refs?.length >= 2);
  const now = reply.expect.at + 86_400_000;
  const ask = (text) => answer(text, { items: thread, line, halted: () => "no", now, keep: false });
  for (const question of ["What time is it?", "what's the date", "What day is it today?"]) {
    const said = await ask(question);
    const full = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(new Date(now));
    assert.deepEqual(said.sentences, [`It is ${full}.`], question);
    assert.deepEqual(said.sources, [], "the time draws on nothing held");
  }
  const item = read(reply);
  const said = await ask(`what did ${item.who.split(" ")[0]} write about ${item.title.replace(/^Re:\s*/i, "").split(" ").at(-1)}?`);
  const sentence = said.sentences.find((s) => s.startsWith(`${item.who} wrote “${item.title}”`));
  assert.ok(sentence, said.sentences.join(" | "));
  const order = sequence(thread).get(reply.id);
  assert.ok(sentence.includes(`(${relativeOf(item.at, now)})`), `${sentence}: says how far it is from now`);
  assert.ok(sentence.includes(`, ${order.turn} of ${order.of} in its conversation`), `${sentence}: says its turn`);
  const { spanOf } = await import("../../site/time/time.mjs");
  assert.ok(sentence.includes(`, ${spanOf(order.after)} after the message it answers`), `${sentence}: says how long after what it answers`);
});

// A reply's own time is how long after the message it answers it came: the
// reference reading's Date of each, by its In-Reply-To (RFC 5322 3.6.4).
test("a reply says how long after the message it answers it came", async () => {
  const { spanOf } = await import("../../site/time/time.mjs");
  const order = sequence(messages.map(read));
  const byId = new Map(messages.map((e) => [e.expect.id, e]));
  const replies = messages.filter((e) => e.expect.replyTo?.some((id) => byId.has(id)));
  assert.ok(replies.length >= 2, "the Appendix A exchange holds replies");
  for (const e of replies) {
    const parent = byId.get(e.expect.replyTo.filter((id) => byId.has(id)).at(-1));
    assert.equal(order.get(e.id).after, e.expect.at - parent.expect.at, `${e.id} came ${e.expect.at - parent.expect.at} ms after ${parent.id}`);
  }
  for (const e of messages.filter((m) => !replies.includes(m))) assert.equal(order.get(e.id)?.after, undefined, `${e.id} answers nothing held`);
  // In the largest period the span fills.
  const six = replies.map((e) => order.get(e.id).after).sort((a, b) => a - b)[0];
  assert.equal(spanOf(six, "en"), new Intl.NumberFormat("en", { style: "unit", unit: "minute", unitDisplay: "long" }).format(Math.trunc(six / 60_000)));
  assert.equal(spanOf(Number.NaN), "");
});
