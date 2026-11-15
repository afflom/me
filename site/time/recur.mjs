// A repeating thing keeps its own time: the rhythm its recurrence rule states
// (RFC 5545 3.3.10 RECUR, 3.8.5.3 RRULE, 3.8.5.1 EXDATE, 3.8.5.2 RDATE). Its
// instances are made in its own zone's wall-time (DTSTART;TZID), so a 9:00 AM
// meeting stays at 9:00 AM across a daylight-saving change, and only then
// projected onto the browser's clock.
//
//   instances(ical, { from, limit })   // UTC ms, ascending, of the instances at or after `from`
//   nextInstance(ical, now)           // the first at or after now, else the last there was
//
// Expansion follows the RFC's own order: each period of FREQ x INTERVAL from
// DTSTART, its BYxxx parts expanding or limiting as section 3.3.10's table
// says, then BYSETPOS, then COUNT and UNTIL; DTSTART is always the first
// instance, and EXDATE removes what it names.

const DAY = 86_400_000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const FREQS = ["SECONDLY", "MINUTELY", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"];

const unfold = (text) => text.replace(/\r?\n[ \t]/g, "");
const lines = (text, name) => [...unfold(text).matchAll(new RegExp(`^${name}((?:;[^:\\r\\n]*)?):([^\\r\\n]*)$`, "gim"))].map(([, params, value]) => [params, value.trim()]);

// One formatter per zone: making one is the slow part of reading a zone's wall-time.
const clocks = new Map();
const zoneClock = (zone) => {
  if (!clocks.has(zone)) clocks.set(zone, new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  return clocks.get(zone);
};

// Wall-time in a named zone, as UTC, through the browser's own zone data.
export function utcOf(wall, zone) {
  if (zone === "UTC") return wall;
  if (!zone) { const d = new Date(wall); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime(); }
  try {
    const parts = zoneClock(zone);
    const offset = (at) => { const p = Object.fromEntries(parts.formatToParts(at).map(({ type, value }) => [type, +value])); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at; };
    const first = wall - offset(wall);
    return wall - offset(first);
  } catch {
    return utcOf(wall, "");
  }
}

// A DATE or DATE-TIME as wall-time (ms, read as if UTC) and the zone it is in.
function timeOf(params, value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  const zone = z ? "UTC" : /;TZID=("?)([^";:]+)\1/i.exec(params)?.[2]?.replace(/^\//, "") ?? "";
  return { wall: Date.UTC(+y, mo - 1, +d, +h, +mi, +s), zone, date: !m[4] };
}

function ruleOf(text) {
  const parts = Object.fromEntries(text.split(";").map((p) => p.split("=")).filter(([k, v]) => k && v !== undefined).map(([k, v]) => [k.toUpperCase(), v]));
  // Day, week and month numbers count from 1 (or back from -1); hours, minutes and seconds from 0.
  const list = (k) => (parts[k] ? parts[k].split(",").map(Number).filter((n) => Number.isInteger(n) && (n !== 0 || ["BYSECOND", "BYMINUTE", "BYHOUR"].includes(k))) : null);
  return {
    freq: FREQS.indexOf((parts.FREQ ?? "").toUpperCase()),
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    count: parts.COUNT ? Number(parts.COUNT) : Infinity,
    until: parts.UNTIL ? timeOf("", parts.UNTIL) : null,
    wkst: Math.max(0, WEEKDAYS.indexOf((parts.WKST ?? "MO").toUpperCase())),
    byday: parts.BYDAY ? parts.BYDAY.split(",").map((d) => /^([+-]?\d{1,2})?([A-Z]{2})$/i.exec(d.trim())).filter(Boolean).map(([, n, w]) => ({ n: n ? Number(n) : 0, w: WEEKDAYS.indexOf(w.toUpperCase()) })) : null,
    bymonth: list("BYMONTH"), bymonthday: list("BYMONTHDAY"), byyearday: list("BYYEARDAY"), byweekno: list("BYWEEKNO"),
    byhour: list("BYHOUR"), byminute: list("BYMINUTE"), bysecond: list("BYSECOND"), bysetpos: list("BYSETPOS"),
  };
}

const ymd = (wall) => { const d = new Date(wall); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const daysInYear = (y) => (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / DAY;
const weekday = (day) => new Date(day).getUTCDay();
// Week 1 of a year is the first week, starting on WKST, with at least four of its days (3.3.10 BYWEEKNO).
function weekOne(y, wkst) {
  const jan1 = Date.UTC(y, 0, 1);
  const back = (weekday(jan1) - wkst + 7) % 7;
  return jan1 - back * DAY + (back > 3 ? 7 * DAY : 0);
}
// The nth (from the end when negative) of the days in `days` that fall on weekday w.
const nth = (days, w, n) => { const on = days.filter((d) => weekday(d) === w); return n > 0 ? on[n - 1] : on[on.length + n]; };
const inList = (list, value, size) => list.some((n) => (n > 0 ? n : size + n + 1) === value);

// The days of one period, as the BYxxx day parts expand and limit them.
function daysOf(rule, start, period) {
  const [sy, sm, sd] = ymd(start);
  const { freq, bymonth, byweekno, byyearday, bymonthday, byday } = rule;
  const range = (a, b) => { const out = []; for (let d = a; d < b; d += DAY) out.push(d); return out; };
  let days;
  let scope = null; // the span BYDAY ordinals count within
  if (freq === 6) {
    const y = period;
    if (byweekno) {
      const one = weekOne(y, rule.wkst);
      const weeks = (weekOne(y + 1, rule.wkst) - one) / (7 * DAY);
      days = [...new Set(byweekno.map((n) => (n > 0 ? n : weeks + n + 1)).filter((n) => n >= 1 && n <= weeks).flatMap((n) => range(one + (n - 1) * 7 * DAY, one + n * 7 * DAY)))].sort((a, b) => a - b);
    } else days = range(Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1));
    if (bymonth) days = days.filter((d) => bymonth.includes(ymd(d)[1]));
    if (byyearday) days = days.filter((d) => { const [dy] = ymd(d); return dy === y && inList(byyearday, (d - Date.UTC(y, 0, 1)) / DAY + 1, daysInYear(y)); });
    if (bymonthday) days = days.filter((d) => { const [dy, dm, dd] = ymd(d); return inList(bymonthday, dd, daysIn(dy, dm)); });
    if (byday) {
      if (byyearday || bymonthday || byweekno) days = days.filter((d) => byday.some(({ w }) => w === weekday(d)));
      else if (bymonth) scope = "month";
      else scope = "year";
    }
    if (!byweekno && !byyearday && !bymonthday && !byday) days = days.filter((d) => { const [, dm, dd] = ymd(d); return dd === sd && (bymonth ? true : dm === sm); });
    if (byweekno && !byday && !byyearday && !bymonthday) days = days.filter((d) => weekday(d) === weekday(start));
  } else if (freq === 5) {
    const [y, m] = [Math.floor(period / 12), (period % 12) + 1];
    days = bymonth && !bymonth.includes(m) ? [] : range(Date.UTC(y, m - 1, 1), Date.UTC(y, m, 1));
    if (bymonthday) days = days.filter((d) => inList(bymonthday, ymd(d)[2], daysIn(y, m)));
    if (byday) {
      if (bymonthday) days = days.filter((d) => byday.some(({ w }) => w === weekday(d)));
      else scope = "month";
    }
    if (!bymonthday && !byday) days = days.filter((d) => ymd(d)[2] === sd);
  } else if (freq === 4) {
    days = range(period, period + 7 * DAY);
    if (bymonth) days = days.filter((d) => bymonth.includes(ymd(d)[1]));
    days = days.filter((d) => (byday ? byday.some(({ w }) => w === weekday(d)) : weekday(d) === weekday(start)));
  } else {
    // DAILY and finer: the one day the period is on, kept if every day part allows it.
    const day = Math.floor(period / DAY) * DAY;
    const [y, m, dd] = ymd(day);
    const ok = (!bymonth || bymonth.includes(m)) && (!bymonthday || inList(bymonthday, dd, daysIn(y, m))) &&
      (!byyearday || inList(byyearday, (day - Date.UTC(y, 0, 1)) / DAY + 1, daysInYear(y))) && (!byday || byday.some(({ w }) => w === weekday(day)));
    days = ok ? [day] : [];
  }
  if (scope) {
    // BYDAY with ordinals counts within the month or the year (3.3.10): every Monday, or the 20th, or the last.
    const groups = scope === "year" ? [days] : Object.values(Object.groupBy ? Object.groupBy(days, (d) => ymd(d)[1]) : days.reduce((g, d) => ((g[ymd(d)[1]] ??= []).push(d), g), {}));
    days = groups.flatMap((group) => byday.flatMap(({ n, w }) => (n ? [nth(group, w, n)] : group.filter((d) => weekday(d) === w)))).filter((d) => d !== undefined);
    days = [...new Set(days)].sort((a, b) => a - b);
  }
  return days;
}

// The instants of one period: its days, at the times the time parts expand or limit to.
function periodOf(rule, start, period) {
  const s = new Date(start);
  const [h0, m0, s0] = [s.getUTCHours(), s.getUTCMinutes(), s.getUTCSeconds()];
  const { freq } = rule;
  const unit = (list, fixed, own) => (list ? list : [own]).filter((v) => fixed === undefined || v === fixed);
  let out = [];
  if (freq >= 3) {
    for (const day of daysOf(rule, start, period)) for (const h of unit(rule.byhour, undefined, h0)) for (const mi of unit(rule.byminute, undefined, m0)) for (const se of unit(rule.bysecond, undefined, s0)) out.push(day + ((h * 60 + mi) * 60 + se) * 1000);
  } else {
    const at = new Date(period);
    const [h, mi, se] = [at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds()];
    if (!daysOf(rule, start, period).length) return [];
    if (rule.byhour && !rule.byhour.includes(h)) return [];
    if (freq <= 1 && rule.byminute && !rule.byminute.includes(mi)) return [];
    if (freq === 0 && rule.bysecond && !rule.bysecond.includes(se)) return [];
    // The period's own hour or minute, then the finer parts it expands to.
    const base = period - (freq === 2 ? (mi * 60 + se) * 1000 : freq === 1 ? se * 1000 : 0);
    const minutes = freq === 2 ? unit(rule.byminute, undefined, m0) : [0];
    const seconds = freq >= 1 ? unit(rule.bysecond, undefined, s0) : [0];
    for (const m of minutes) for (const sec of seconds) out.push(base + (m * 60 + sec) * 1000);
  }
  out = [...new Set(out)].sort((a, b) => a - b);
  if (rule.bysetpos) out = [...new Set(rule.bysetpos.map((n) => (n > 0 ? out[n - 1] : out[out.length + n])).filter((v) => v !== undefined))].sort((a, b) => a - b);
  return out;
}

// The first period (as its own number) and how to step to the next.
function periods(rule, start) {
  const [y, m] = ymd(start);
  const step = rule.interval;
  if (rule.freq === 6) return { first: y, next: (p) => p + step };
  if (rule.freq === 5) return { first: y * 12 + (m - 1), next: (p) => p + step };
  if (rule.freq === 4) { const day = Math.floor(start / DAY) * DAY; return { first: day - ((weekday(day) - rule.wkst + 7) % 7) * DAY, next: (p) => p + 7 * step * DAY, size: 7 * DAY }; }
  const size = [1000, 60_000, 3_600_000, DAY][rule.freq];
  return { first: Math.floor(start / size) * size, next: (p) => p + step * size, size };
}

// Every instance at or after `from` (UTC ms), up to `limit` of them.
export function instances(ical, { from = -Infinity, limit = 1000 } = {}) {
  const [dtstart] = lines(ical, "DTSTART");
  const begin = dtstart && timeOf(...dtstart);
  if (!begin) return [];
  const toUtc = (wall) => utcOf(wall, begin.zone);
  const walls = (name) => lines(ical, name).flatMap(([params, value]) => value.split(",").map((v) => timeOf(params, v.trim())).filter(Boolean).map((t) => utcOf(t.wall, t.zone)));
  const excluded = new Set(walls("EXDATE"));
  const out = new Set([toUtc(begin.wall), ...walls("RDATE")]);
  for (const [, text] of lines(ical, "RRULE")) {
    const rule = ruleOf(text);
    if (rule.freq < 0) continue;
    const until = rule.until ? (rule.until.zone === "UTC" ? rule.until.wall : toUtc(rule.until.wall)) : Infinity;
    const { first, next, size } = periods(rule, begin.wall);
    // Without a COUNT to keep, periods long before `from` need not be made (a day's margin covers any zone).
    const span = size * rule.interval;
    const skip = size && rule.count === Infinity && Number.isFinite(from) ? Math.max(0, Math.floor((from - 2 * DAY - first) / span)) : 0;
    // DTSTART counts as the first instance (3.8.5.3).
    let count = 1;
    let empty = 0;
    for (let p = skip ? first + skip * span : first, made = 0; count < rule.count && empty < 4000; p = next(p)) {
      const these = periodOf(rule, begin.wall, p).filter((w) => w > begin.wall);
      empty = these.length ? 0 : empty + 1;
      let past = false;
      for (const wall of these) {
        const at = toUtc(wall);
        if (at > until) { past = true; break; }
        out.add(at);
        count += 1;
        if (at >= from) made += 1;
        if (count >= rule.count) break;
      }
      if (past || made >= limit) break;
    }
  }
  return [...out].filter((at) => !excluded.has(at) && at >= from).sort((a, b) => a - b).slice(0, limit);
}

// When a repeating thing is next: its first instance at or after now, else the last it had.
export function nextInstance(ical, now = Date.now()) {
  const [next] = instances(ical, { from: now, limit: 1 });
  if (next !== undefined) return next;
  const all = instances(ical, { limit: 100_000 });
  return all.length ? all.at(-1) : NaN;
}
