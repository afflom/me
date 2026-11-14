// The R4 router over the generated decision: run with `node site/router/router.test.mjs`.
// The page asks the root guest; here the same tree (table.mjs, held to the
// LexLean module by tools/facet/gen.py --check) stands in for it.
import assert from "node:assert/strict";
import { judge, FIELDS, GUARANTEES } from "./table.mjs";
import { route } from "./router.mjs";

const asked = [];
const line = async (text) => {
  asked.push(text);
  const [facet, ...rest] = text.split(" ");
  assert.equal(facet, "router", "the router asks only the router facet");
  return judge(Object.fromEntries(FIELDS.map(([name], i) => [name, rest[i]])));
};
const at = (text) => new Date(text).getTime();
const WEDNESDAY = at("2026-11-11T09:00:00");
const FRIDAY_MORNING = at("2026-11-13T07:30:00");
const FRIDAY_EVENING = at("2026-11-13T18:00:00");
const jot = (text, now = WEDNESDAY, halted = "no") => route({ source: "note", values: { text }, line, halted: () => halted, now });
const clock = (ms) => { const d = new Date(ms); return [d.getDay(), d.getHours(), d.getMinutes()]; };

// The dentist: a task on Friday at 3 PM, in the tasks and time places only.
for (const now of [WEDNESDAY, FRIDAY_MORNING]) {
  const r = await jot("Call the dentist Friday at 3", now);
  assert.deepEqual(clock(r.start), [5, 15, 0], "Friday at 3 is Friday, 3 PM");
  assert.equal(r.allDay, false);
  assert.equal(r.intent, "task");
  assert.deepEqual(r.domains, [9, 5], "a timed task lands in tasks and time, nowhere else");
  assert.ok(r.start > now, "the time is ahead of the jot");
}
const late = await jot("Call the dentist Friday at 3", FRIDAY_EVENING);
assert.ok(late.start > FRIDAY_EVENING && clock(late.start)[0] === 5, "a Friday already past is next Friday");

// Other days, clocks and intents.
const cases = [
  ["lunch with Sam tomorrow at noon", [4, 12, 0], "event"],
  ["Dentist fri 3:30pm", [5, 15, 30], "event"],
  ["standup at 9", [4, 9, 0], "event"],
  ["meeting today 10am", [3, 10, 0], "event"],
];
for (const [text, want, intent] of cases) {
  const r = await jot(text);
  assert.deepEqual(clock(r.start), want, text);
  assert.equal(r.intent, intent, text);
}
const allDay = await jot("pay rent friday");
assert.equal(allDay.allDay, true, "a day with no clock is all day");
assert.equal(allDay.intent, "task");
const none = await jot("buy milk");
assert.equal(none.start, null, "no day and no clock is no time");
assert.deepEqual(none.domains, [9]);
assert.equal((await jot("When is my flight?")).intent, "question");
assert.equal((await jot("Room 12 has 3 chairs")).start, null, "a bare number is not a time");

// Halted: the first decision refuses and nothing is mapped.
const halted = await jot("Call the dentist Friday at 3", WEDNESDAY, "yes");
assert.equal(halted.refused, true);
assert.equal(halted.start, null);

// Every decision the router took is the guest's, and keeps every guarantee.
for (const text of asked) {
  const [, ...rest] = text.split(" ");
  const r = Object.fromEntries(FIELDS.map(([name], i) => [name, rest[i]]));
  const a = judge(r);
  for (const g of GUARANTEES) {
    if (g.when.every(([f, v]) => r[f] === v)) {
      assert.ok(!("always" in g) || a === g.always, `${g.id} on ${text}`);
      assert.ok(!(g.never ?? []).includes(a), `${g.id} on ${text}`);
    }
  }
}
// Features with no compiled model are asked about and skipped, never run.
assert.ok(asked.some((t) => t.endsWith("meaning absent no")), "meaning has no compiled model yet and is skipped");
console.log(`router: ${asked.length} decisions, all held`);

// The chat's answers: a question is answered in a sentence from what is held,
// under the Boundary; anything else is offered to keep with its confirmation.
const { answer } = await import("./answer.mjs");
const boundaryLine = async (text) => (text.startsWith("boundary") ? (text.trim().endsWith(" yes") ? "deny" : "allow") : line(text));
const flight = { address: "f", media: "calendar", title: "Flight to Lisbon", who: "Airport", body: "", label: "confidential", at: new Date(2026, 10, 16, 8).getTime(), domains: [5] };
const mail = { address: "m", media: "message", title: "Lunch on Thursday?", who: "Robin Example", body: "Are you free?", label: "confidential", at: new Date(2026, 10, 12, 9).getTime(), domains: [4] };
const ask = (text, halted = "no") => answer(text, { items: [flight, mail], line: boundaryLine, halted: () => halted, now: WEDNESDAY });
const flightAnswer = await ask("When is my flight?");
assert.equal(flightAnswer.mapped.intent, "question");
assert.deepEqual(flightAnswer.sources, [flight], "the answer draws on the flight");
assert.match(flightAnswer.sentences[0], /^Flight to Lisbon is on Mon, Nov 16 at 8:00\s?AM, at Airport\.$/u, flightAnswer.sentences[0]);
const lunch = await ask("what did Robin say about lunch?");
assert.match(lunch.sentences[0], /^Robin Example wrote “Lunch on Thursday\?” on /u);
assert.deepEqual(lunch.offers.map((o) => o.kind), ["reply"], "a message offers a reply");
const jotted = await ask("Call the dentist Friday at 3");
assert.deepEqual(jotted.offers, [{ kind: "keep" }]);
assert.match(jotted.sentences[0], /^Call the dentist, Fri, Nov 13 at 3:00\s?PM$/u, jotted.sentences[0]);
const pausedAnswer = await ask("When is my flight?", "yes");
assert.deepEqual(pausedAnswer.sentences, [], "paused, nothing is answered");
// The chat box only asks (keep: false), as the page does.
const only = (text) => answer(text, { items: [flight, mail], line: boundaryLine, halted: () => "no", now: WEDNESDAY, keep: false });
const zebra = await ask("When is the zebra?");
assert.equal(zebra.sentences[0], "Nothing you hold mentions “zebra”.", "nothing matches: it says so");
assert.match(zebra.sentences[1], /^Flight to Lisbon is on /u, "then how things stand");
const empty = await answer("What do I have today?", { items: [], line: boundaryLine, halted: () => "no", now: WEDNESDAY, keep: false });
assert.match(empty.sentences[0], /^Nothing has arrived yet/u, "an empty Prism says so");
assert.deepEqual(empty.offers, [{ kind: "connect" }], "and leads to connecting");
const hello = await only("hello");
assert.match(hello.sentences[0], /^Ask about your day/u, "a greeting is answered with what to ask");
assert.equal(hello.sentences.length, 3, "and how things stand");
const mailed = await only("who emailed me?");
assert.match(mailed.sentences[0], /^Robin Example wrote /u, "naming mail answers with the newest messages");
const calendar = await only("what's on my calendar?");
assert.match(calendar.sentences[0], /^Flight to Lisbon is on /u, "naming the calendar answers with what is next");
const notes = await only("what are my notes?");
assert.equal(notes.sentences[0], "Nothing you hold mentions “notes”.", "a kind with nothing held says so");
// A name answers with everything that names them; "say" asks about their mail.
const review = { address: "r", media: "calendar", title: "Grant proposal review", who: "Joël Example, Robin Example", body: "", label: "confidential", at: new Date(2026, 10, 14, 15).getTime(), start: new Date(2026, 10, 14, 15).getTime(), domains: [5] };
const reply = { address: "j", media: "message", title: "Re: Proposal draft for the grant", who: "Joël Example", body: "I read the draft. Can we move the review to 4?", label: "confidential", at: new Date(2026, 10, 12, 2).getTime(), domains: [4] };
const named = (text) => answer(text, { items: [review, reply, flight], line: boundaryLine, halted: () => "no", now: WEDNESDAY, keep: false });
const joel = await named("Joel");
assert.deepEqual(new Set(joel.sources.slice(0, 2)), new Set([review, reply]), "a name without its accent finds the mail and the meeting");
assert.equal(joel.sentences.length, 2, "and says both: " + joel.sentences.join(" "));
assert.ok(joel.sentences.some((s) => /^Joël Example wrote “Re: Proposal draft for the grant” on /u.test(s)), joel.sentences.join(" "));
assert.ok(joel.sentences.some((s) => /^Grant proposal review is on /u.test(s)), joel.sentences.join(" "));
const said = await named("what did Joel say?");
assert.match(said.sentences[0], /^Joël Example wrote “Re: Proposal draft for the grant” on /u, "what someone said is their mail");
assert.equal(said.sentences.length, 1, said.sentences.join(" "));
// Search: a word lists everything that names it, beyond the few the sentences say.
const many = Array.from({ length: 7 }, (_, i) => ({ address: `g${i}`, media: "message", title: `Garden plan ${i}`, who: "Ana Example", body: "About the garden.", label: "confidential", at: new Date(2026, 10, 1 + i, 9).getTime(), domains: [4] }));
const garden = await answer("GARDEN", { items: [...many, flight, mail], line: boundaryLine, halted: () => "no", now: WEDNESDAY, keep: false });
// QR-04 "find-missing": items that name the word and are missing from the list.
const findMissing = many.filter((item) => !garden.sources.includes(item)).length;
assert.ok(findMissing <= 0, `find-missing: ${findMissing} items that name "garden" are missing from the list`);
assert.ok(garden.sentences.length <= 3, "while the sentences say only a few");
assert.ok(garden.cited.every((item) => garden.sources.includes(item)), "and what they say is in the list");
assert.deepEqual(garden.sources.slice(garden.cited.length).map((i) => i.at), garden.sources.slice(garden.cited.length).map((i) => i.at).sort((a, b) => b - a), "the rest newest first");
const pausedEmpty = await answer("hello", { items: [], line: boundaryLine, halted: () => "yes", now: WEDNESDAY, keep: false });
assert.deepEqual(pausedEmpty.sentences, [], "paused, even an empty Prism answers nothing");
console.log("answer: questions answered in sentences, jots offered to keep");
