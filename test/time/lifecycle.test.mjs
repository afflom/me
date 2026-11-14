// TM-02: what is before the person stays as long as it is resolved, not for a
// fixed window (UOR-Framework#2, saturation-derived decay), on the
// specifications' own examples (test/oracle/corpus.json). Which message
// references which, and whose reply answers what, is the reference reader's
// reading (tools/oracle/gen.py), never the Prism's.
// QR-09 "lifecycle-inverted": a message that later mail references weighing
// less than one of the same age that nothing references, at most 0.
// usage: node --test test/time/lifecycle.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readItem, useReader } from "../../site/card.mjs";
import * as reader from "../../site/read/read.mjs";
import { resolver } from "../../site/time/time.mjs";
import { answeredBy } from "../../site/coherence/today.mjs";
import { TODAY } from "../../site/coherence/coherence.mjs";

useReader(reader);
const { corpus } = JSON.parse(readFileSync(new URL("../oracle/corpus.json", import.meta.url), "utf8"));
const encoder = new TextEncoder();
const MEDIA = { message: "message", calendar: "calendar", contact: "contactCard" };
const read = (e) => readItem({ address: e.id, outcome: "restore", bytes: encoder.encode(e.raw), meta: { about: { media: MEDIA[e.kind], domain: 4, at: 0 } } });
const examples = corpus.filter((e) => MEDIA[e.kind]);
const messages = examples.filter((e) => e.kind === "message" && e.expect.id && Number.isFinite(e.expect.at));
const items = examples.map(read);
const rule = TODAY.needs;
const weight = resolver(items, rule);
const HALF = rule.halfLife * 86_400_000;
// The reference reading: the first time a later message names each one.
const namedAt = (e) => Math.min(...messages.filter((o) => o.expect.id !== e.expect.id && [...(o.expect.refs ?? []), ...(o.expect.replyTo ?? [])].includes(e.expect.id)).map((o) => o.expect.at));
const itemOf = (e) => items.find((i) => i.address === e.id);

test("the registry's lifecycle is whole: a half-life, a keep, and fibers the Prism reads", () => {
  assert.ok(rule.halfLife > 0 && rule.keep > 0 && rule.keep < 1, JSON.stringify(rule));
  assert.ok(rule.fibers.length > 0 && rule.fibers.every((f) => ["referenced", "corroborated"].includes(f)), rule.fibers.join(","));
});

test("nothing pins it: it halves in the half-life, and keeps falling", () => {
  const lone = messages.filter((e) => !Number.isFinite(namedAt(e)));
  assert.ok(lone.length > 0, "an example nothing references");
  for (const e of lone) {
    const at = e.expect.at;
    assert.ok(Math.abs(weight(itemOf(e), at) - 1) < 1e-12, `${e.id} starts whole`);
    assert.ok(Math.abs(weight(itemOf(e), at + HALF) - 0.5) < 1e-9, `${e.id} halves in ${rule.halfLife} days`);
    assert.ok(weight(itemOf(e), at + 2 * HALF) < weight(itemOf(e), at + HALF), `${e.id} keeps falling`);
  }
});

test("QR-09 lifecycle-inverted: a referenced message stays longer than one nothing references", () => {
  const named = messages.filter((e) => Number.isFinite(namedAt(e)));
  const lone = messages.filter((e) => !Number.isFinite(namedAt(e)));
  assert.ok(named.length > 0, "an example later mail references (RFC 5322 Appendix A.2)");
  let lifecycleInverted = 0;
  for (const e of named) {
    const item = itemOf(e);
    // Before anything names it, it cools like any other; after, more slowly.
    const pin = namedAt(e);
    if (pin > e.expect.at) assert.ok(Math.abs(weight(item, pin) - Math.exp(-Math.LN2 * (pin - e.expect.at) / HALF)) < 1e-9, `${e.id} decays unpinned until ${pin}`);
    for (const age of [HALF, 2 * HALF, 10 * HALF]) {
      const mine = weight(item, e.expect.at + age);
      // Named before that age, it weighs more than anything of that age nothing names.
      for (const o of lone) if (e.expect.at + age > pin ? mine <= weight(itemOf(o), o.expect.at + age) : mine < weight(itemOf(o), o.expect.at + age)) lifecycleInverted += 1;
    }
  }
  assert.ok(lifecycleInverted <= 0, `lifecycle-inverted: ${lifecycleInverted}`);
});

test("the dimensions this set exercises are named: corroboration has no example yet", () => {
  // A kept contact card or an invitation that names a message's sender, in the specifications' own examples.
  const others = new Set(examples.flatMap((e) => (e.kind === "contact" ? [e.expect.who] : e.kind === "calendar" ? (e.expect.addresses ?? []) : [])).filter(Boolean).map((a) => a.toLowerCase()));
  const corroborated = messages.filter((e) => others.has(e.expect.from));
  // When the corpus gains one, this fails: then test the corroborated fiber on it and drop this line.
  assert.deepEqual(corroborated.map((e) => e.id), [], "an example now corroborates a sender: hold the corroborated fiber to it");
});

test("what the person answered no longer needs them (RFC 5322 3.6.4)", () => {
  // Each sender in the Appendix A exchange, as the person: what their reply names is answered.
  for (const e of messages.filter((m) => m.expect.replyTo?.length)) {
    const mine = (item) => item.address === e.id;
    const answered = answeredBy(items, mine);
    for (const id of [...e.expect.replyTo, ...(e.expect.refs ?? [])]) assert.ok(answered.has(id), `${e.id} answers ${id}`);
    for (const o of messages) if (o.id !== e.id && !(e.expect.refs ?? []).includes(o.expect.id) && !e.expect.replyTo.includes(o.expect.id)) assert.ok(!answered.has(o.expect.id), `${e.id} does not answer ${o.expect.id}`);
  }
});
