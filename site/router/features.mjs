// The features compiled into the Prism that the R4 router maps values onto.
// Each reader is drawn only from its provider record in
// app/specs/router/spec.json (PROVIDERS): its words, days and clock rules.
// A reader returns the Prism feature's value, or null when the text carries none.
import { PROVIDERS } from "./table.mjs";

const DAY = 86_400_000;
const lower = (text = "") => text.toLowerCase();
const wordsOf = (text) => lower(text).match(/[\p{L}\p{N}']+/gu) ?? [];
const patterns = new Map();
const has = (text, phrase) => {
  let pattern = patterns.get(phrase);
  if (!pattern) patterns.set(phrase, (pattern = new RegExp(`(?<![\\p{L}\\p{N}])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u")));
  return pattern.test(text);
};
const startOfDay = (at) => { const d = new Date(at); d.setHours(0, 0, 0, 0); return d.getTime(); };

// When: the day the words name (a relative day or a weekday), and the clock
// they name ("at 3", "3pm", "3:30 pm", "15:00", "noon"). A bare hour below the
// spec's afternoon bound is in the afternoon. A day with no clock is all day; a
// clock with no day is its next occurrence.
function readTime(text, now) {
  const p = PROVIDERS.time;
  const t = lower(text);
  const base = startOfDay(now);
  let day = null;
  const spans = []; // where in the words the time was said, so a sentence can leave it out
  for (const match of t.matchAll(/[\p{L}\p{N}']+/gu)) {
    const word = match[0];
    const weekday = p.weekdays.indexOf(word);
    const short = p.short[word.replace(/\.$/, "")];
    const index = weekday >= 0 ? weekday : short ?? -1;
    if (word in p.days) day = p.days[word];
    else if (index >= 0) day = (index - new Date(base).getDay() + 7) % 7;
    else continue;
    spans.push([match.index, match.index + word.length]);
    break;
  }
  let minutes = null;
  const clock = /(?<![\p{L}\p{N}:])(?:(at|by|@)\s*)?(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?(?![\p{L}\p{N}:])/giu;
  for (const match of t.matchAll(clock)) {
    const [, at, h, m, half] = match;
    if (!at && !m && !half) continue; // a bare number is not a time
    let hour = Number(h);
    if (hour > 23) continue;
    if (half) hour = (hour % 12) + (half.startsWith("p") ? 12 : 0);
    else if (!m && hour >= 1 && hour < p.bareHourAfternoonBelow) hour += 12;
    minutes = hour * 60 + Number(m ?? 0);
    spans.push([match.index, match.index + match[0].length]);
    break;
  }
  if (minutes === null) {
    for (const [name, at] of Object.entries(p.named)) {
      const found = new RegExp(`(?<![\\p{L}\\p{N}])${name}(?![\\p{L}\\p{N}])`, "u").exec(t);
      if (found) { minutes = at; spans.push([found.index, found.index + name.length]); break; }
    }
  }
  if (day === null && minutes === null) return null;
  if (day === null) day = base + minutes * 60_000 > now ? 0 : 1;
  // A weekday named on that same day means today while its clock is ahead, else next week.
  if (day === 0 && minutes !== null && base + minutes * 60_000 <= now && !wordsOf(t).some((w) => w in p.days)) day = 7;
  const date = new Date(base + day * DAY + 12 * 3_600_000); // noon of that day, across a clock change
  date.setHours(0, 0, 0, 0);
  if (minutes === null) return { start: date.getTime(), allDay: Boolean(p.allDayWithoutClock), spans };
  date.setMinutes(minutes);
  return { start: date.getTime(), allDay: false, spans };
}

// What it asks of the owner: a question, a task, an event, or a fact.
function readIntent(text, { timed = false } = {}) {
  const p = PROVIDERS.intent;
  const t = lower(text).trim();
  const words = wordsOf(t);
  if (!words.length) return null;
  const wh = p.question.slice(0, 7);
  if (t.endsWith("?") || wh.includes(words[0])) return "question";
  if (p.task.some((cue) => t.startsWith(`${cue} `) || t === cue)) return "task";
  if (p.event.some((cue) => has(t, cue))) return "event";
  if (p.task.some((cue) => has(t, cue))) return "task";
  return timed ? "event" : "fact";
}


// The places an item lands in: its intent's domains, and time's when it has a start.
export function domainsFor(intent, start) {
  const p = PROVIDERS.intent;
  const out = [...(p.domains[intent] ?? p.domains.fact)];
  if (start != null && !out.includes(p.timed)) out.push(p.timed);
  return out;
}

// The words without where they said the time: "Call the dentist Friday at 3" -> "Call the dentist".
export function withoutTime(text, spans = []) {
  let out = text;
  for (const [a, b] of [...spans].sort((x, y) => y[0] - x[0])) out = `${out.slice(0, a)} ${out.slice(b)}`;
  return out.replace(/\s+(on|at|by|for)\s*$/i, "").replace(/\s{2,}/g, " ").trim().replace(/[,;]\s*$/, "");
}

// Who it is with. A party value the schema names arrives as [{name, address}]
// and is marked robot when its address or name is an automated sender's. In
// free text, the reader finds the people the owner's content already knows
// (ctx.people, learned from every item's own parties), so a name that has
// written before is recognized where it is mentioned.
const P_PARTY = () => PROVIDERS.party;
export function isRobot({ name = "", address = "" } = {}) {
  const local = address.split("@")[0] ?? "";
  const tokens = new Set([local, ...local.split(/[._+-]+/), ...lower(name).split(/[^\p{L}\p{N}-]+/u)]);
  return P_PARTY().robots.some((word) => tokens.has(word));
}
function readParty(text, { people = [] } = {}) {
  const t = lower(text);
  const out = [];
  // A person is found by their whole name, or by their first name when no one
  // else the content knows shares it.
  const first = (one) => lower(one.name).split(/\s+/)[0];
  const shared = new Map();
  for (const one of people) shared.set(first(one), (shared.get(first(one)) ?? 0) + 1);
  for (const one of people) {
    if (!one.name || one.name.length < 3 || one.name.includes("@")) continue;
    const name = first(one);
    if (has(t, lower(one.name)) || (name.length > 2 && shared.get(name) === 1 && has(t, name))) out.push({ ...one, mentioned: true });
    if (out.length >= 5) break;
  }
  return out.length ? out : null;
}

// What kind of thing it is, by the kind provider: the sender its shape says,
// then the first kind for that sender whose shape it has or whose words its
// subject uses, then (an automated sender only) whose words open its body.
export function senderOf({ shapes = [], from = [] }) {
  const k = PROVIDERS.kind;
  if (shapes.includes("note")) return "note";
  if (shapes.includes("card")) return "card";
  if (shapes.includes("vevent")) return "calendar";
  if (k.automated.some((x) => shapes.includes(x)) || (from.length && from.every(isRobot))) return "automated";
  return "person";
}
export function kindOf({ shapes = [], subject = "", text = "", from = [] }) {
  const k = PROVIDERS.kind;
  const sender = senderOf({ shapes, from });
  const kinds = k.order.map((key) => k.kinds.find((x) => x.key === key)).filter((x) => x.senders.includes(sender));
  const s = lower(subject);
  for (const x of kinds) if (x.shapes.some((y) => shapes.includes(y)) || x.words.some((w) => has(s, w))) return x.key;
  if (sender === "automated") {
    const b = lower(text.slice(0, 600));
    for (const x of kinds) if (x.words.some((w) => has(b, w))) return x.key;
  }
  return k.fallback[sender];
}

// What it is about: the words of the owner's lexicon (ctx.topics, learned
// from their own content) that this value uses, subject words first.
const termsIn = (text) => [...new Set(lower(text).normalize("NFD").replace(/\p{M}+/gu, "").match(/(?<![\p{L}'])\p{L}[\p{L}-]*\p{L}(?![\p{L}'])/gu) ?? [])];
export function topicTerms(text) {
  const p = PROVIDERS.topic;
  const quiet = new Set([...p.quiet, ...PROVIDERS.party.robots]);
  return termsIn(text).filter((w) => w.length >= p.shortest && !quiet.has(w));
}
function readTopic(text, { topics = null } = {}) {
  if (!topics) return null;
  const got = topicTerms(text).filter((w) => topics.has(w));
  return got.length ? got : null;
}

// Each compiled feature's reader. The kind reader passes the cues it is given
// on: the router gathers them from every value and kindOf decides once.
export const READERS = {
  time: (value, { now }) => readTime(value, now),
  intent: (value, { start }) => readIntent(value, { timed: start != null }),
  party: (value, ctx) => readParty(value, ctx),
  kind: (value) => value,
  topic: (value, ctx) => readTopic(value, ctx),
};
