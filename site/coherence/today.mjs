// Today, from what is kept: the agenda ahead, what came in lately, and what
// is to do. Whether an event falls today and whether two events clash is
// PrismChronology's answer ("when <astart> <aend> <bstart> <bend>", minutes
// from the start of today, one week wide), never this file's.
import { TODAY } from "./coherence.mjs";

const DAY = 86_400_000;
const WEEK_MINUTES = 10080;
const TOUCHING = new Set(["overlaps", "starts", "during", "finishes", "equals", "overlappedby", "startedby", "contains", "finishedby"]);
const startOfDay = (at) => { const d = new Date(at); d.setHours(0, 0, 0, 0); return d.getTime(); };

// An event's end: its DTEND, else a day for a date, else an hour.
function endOf(item) {
  const match = /^DTEND(?:;[^:]*)?:(\d{8})(?:T(\d{6})(Z)?)?/mi.exec((item.text ?? "").replace(/\r?\n[ \t]/g, ""));
  if (match) {
    const [, d, t = "000000", z] = match;
    const args = [+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6)];
    const at = z ? Date.UTC(...args) : new Date(...args).getTime();
    if (at > item.at) return at;
  }
  return item.at + (item.allDay ? DAY : 3_600_000);
}

// relate(astart, aend, bstart, bend) -> Allen relation, from the root's `when`.
export async function today(items, { now = Date.now(), relate }) {
  const base = startOfDay(now);
  const minutes = (at) => Math.max(0, Math.min(WEEK_MINUTES, Math.round((at - base) / 60_000)));
  const span = (item) => {
    const a = minutes(item.at);
    return [a, Math.max(a + 1, minutes(endOf(item)))];
  };
  const horizon = base + TODAY.ahead * DAY;
  const events = items
    .filter((item) => item.media === "calendar" && !item.sealed && item.at < horizon && endOf(item) > now)
    .sort((a, b) => a.at - b.at);
  const agenda = [];
  for (const item of events) {
    const [s, e] = span(item);
    const day = await relate(s, e, 0, 1440);
    agenda.push({ item, today: TOUCHING.has(day), clash: [] });
  }
  for (let i = 0; i < agenda.length; i += 1) {
    for (let j = i + 1; j < agenda.length; j += 1) {
      const [as, ae] = span(agenda[i].item);
      const [bs, be] = span(agenda[j].item);
      if (bs >= ae) break;
      if (TOUCHING.has(await relate(as, ae, bs, be))) {
        agenda[i].clash.push(agenda[j].item);
        agenda[j].clash.push(agenda[i].item);
      }
    }
  }
  const recent = items.filter((item) => item.media === "message").sort((a, b) => b.at - a.at).slice(0, TODAY.recent);
  const tasks = items.filter((item) => item.media !== "calendar" && item.media !== "message" && (item.domains ?? [item.domain]).includes(9)).sort((a, b) => b.at - a.at).slice(0, TODAY.tasks);
  return { agenda, recent, tasks };
}
