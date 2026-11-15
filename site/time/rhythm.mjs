// How often a source's content arrives is measured, not declared: from the
// times its things came, the shortest cycle they keep, in the largest of
// wall-time's periods it fills. A cycle may hold more than one arrival (a
// Tuesday and a Thursday each week is two every week), and its arrivals keep
// their own zone's wall-time, so "every day at 9" stays at 9 across a
// daylight-saving change.
//
//   rhythmOf(times, { zone })  // { unit, k, per, keep, period, next } | null
//   sourceOf(item)             // who or what a thing comes from: a List-Id, else its sender
//   rhythms(items, { zone })   // Map source -> rhythm, over what each source sent
//
// A rhythm is claimed only when at least three of every four cycles held are
// within a tenth of it; otherwise there is none, which is not a guess.
import { utcOf } from "./recur.mjs";

const UNITS = [["year", 31_556_952_000], ["month", 2_629_746_000], ["week", 604_800_000], ["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000], ["second", 1000]];
const SLACK = 0.1;
const KEEP = 0.75;

// One formatter per zone: making one is the slow part of reading a zone's wall-time.
const clocks = new Map();
const zoneClock = (zone) => {
  if (!clocks.has(zone)) clocks.set(zone, new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  return clocks.get(zone);
};

// Wall-time (read as UTC) of a moment in a zone: "" is the browser's own, "UTC" is UTC.
function wallOf(at, zone = "") {
  if (zone === "UTC") return at;
  const d = new Date(at);
  if (!zone) return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  try {
    const p = Object.fromEntries(zoneClock(zone).formatToParts(d).map(({ type, value }) => [type, +value]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, d.getUTCMilliseconds());
  } catch {
    return wallOf(at, "");
  }
}

// k of a period after a moment: calendar periods by its zone's wall-time, the others by the clock.
// A month keeps its day of the month ("date"), or its weekday's place in it: the nth ("nth") or
// the nth from the end ("last"), as a first Friday or a last Monday does.
export function add(at, k, unit, zone = "", keep = "date") {
  if (unit === "hour" || unit === "minute" || unit === "second") return at + k * UNITS.find(([u]) => u === unit)[1];
  const w = new Date(wallOf(at, zone));
  if (unit === "year") w.setUTCFullYear(w.getUTCFullYear() + k);
  else if (unit === "month" && keep !== "date") {
    const [day, weekday] = [w.getUTCDate(), w.getUTCDay()];
    const length = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const from = length(w.getUTCFullYear(), w.getUTCMonth());
    w.setUTCDate(1);
    w.setUTCMonth(w.getUTCMonth() + k);
    const [y, m] = [w.getUTCFullYear(), w.getUTCMonth()];
    const first = (weekday - new Date(Date.UTC(y, m, 1)).getUTCDay() + 7) % 7 + 1;
    if (keep === "nth") w.setUTCDate(first + 7 * Math.floor((day - 1) / 7));
    else { const lastOne = first + 7 * Math.floor((length(y, m) - first) / 7); w.setUTCDate(lastOne - 7 * Math.floor((from - day) / 7)); }
    if (w.getUTCMonth() !== m) return NaN;
  } else if (unit === "month") w.setUTCMonth(w.getUTCMonth() + k);
  else w.setUTCDate(w.getUTCDate() + k * (unit === "week" ? 7 : 1));
  return utcOf(w.getTime(), zone);
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

export function rhythmOf(times, { zone = "" } = {}) {
  const t = [...new Set(times.filter(Number.isFinite))].sort((a, b) => a - b);
  let best = null;
  // A cycle of `per` arrivals, from one a cycle apart to the next; at least three cycles to measure.
  // Of the cycles that fit, the one the most arrivals keep; of those, the shortest.
  for (let per = 1; per <= 7 && t.length - per >= 3; per += 1) {
    const pairs = t.slice(per).map((at, i) => [t[i], at]);
    const typical = median(pairs.map(([a, b]) => b - a));
    for (const [unit, size] of UNITS) {
      const k = Math.round(typical / size);
      if (k < 1) continue;
      const period = k * size;
      // The way of keeping the period that the most cycles kept.
      const ways = unit === "month" ? ["date", "nth", "last"] : ["date"];
      const [keep, kept] = ways.map((way) => [way, pairs.filter(([a, b]) => Math.abs(b - add(a, k, unit, zone, way)) <= SLACK * period).length]).sort((x, y) => y[1] - x[1])[0];
      const share = kept / pairs.length;
      if (share >= KEEP) {
        if (!best || share > best.share) best = { share, rhythm: { unit, k, per, keep, period, next: add(t[t.length - per], k, unit, zone, keep) } };
        break;
      }
    }
  }
  return best?.rhythm ?? null;
}

// Who or what a thing comes from: a mailing list by its List-Id (RFC 2919), else its sender's address (RFC 5322 From).
export const sourceOf = (item) => item.list ?? item.from ?? "";

export function rhythms(items, { zone = "" } = {}) {
  const times = new Map();
  for (const item of items) {
    if (item.media !== "message" || item.sealed) continue;
    const source = sourceOf(item);
    if (!source) continue;
    if (!times.has(source)) times.set(source, []);
    times.get(source).push(item.at);
  }
  const out = new Map();
  for (const [source, ts] of times) { const r = rhythmOf(ts, { zone }); if (r) out.set(source, r); }
  return out;
}

// A rhythm's period in the person's words: "week", "2 weeks", "90 minutes".
export function everyOf(rhythm, locale = undefined) {
  if (!rhythm) return "";
  const format = new Intl.NumberFormat(locale, { style: "unit", unit: rhythm.unit, unitDisplay: "long" });
  return rhythm.k === 1 ? format.formatToParts(1).filter((p) => p.type === "unit").map((p) => p.value).join("") : format.format(rhythm.k);
}
