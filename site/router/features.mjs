// The features compiled into the Prism that the R4 router maps values onto.
// Each reader is drawn only from its provider record in
// app/specs/router/spec.json (PROVIDERS): its words, days and clock rules.
// A reader returns the Prism feature's value, or null when the text carries none.
import { PROVIDERS } from "./table.mjs";

const DAY = 86_400_000;
const lower = (text = "") => text.toLowerCase();
const wordsOf = (text) => lower(text).match(/[\p{L}\p{N}']+/gu) ?? [];
const has = (text, phrase) => new RegExp(`(?<![\\p{L}\\p{N}])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u").test(text);
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

export const READERS = {
  time: (value, { now }) => readTime(value, now),
  intent: (value, { start }) => readIntent(value, { timed: start != null }),
};

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
