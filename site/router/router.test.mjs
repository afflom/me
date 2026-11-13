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
