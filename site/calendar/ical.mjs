// iCalendar (RFC 5545) read as the standard defines it, element by element
// from its registry (site/calendar/registry.mjs, generated from the IANA
// iCalendar registries and the RFC's section 3), never from a list kept here.
//
//   const object = tree(text);        // { name, props: [{ name, params, value }], children }
//   spanOf(text)                      // { start, end } of its first event, to-do or journal entry
//   instantOf(value, zones)           // a DATE-TIME's UTC moment, by the object's own VTIMEZONE first
//
// - 3.1 content lines: unfolded; a parameter value may be quoted and a
//   parameter may hold several values.
// - Each property's value by its type: its VALUE parameter's, else the
//   registry's default from its section; several values where its grammar
//   allows (","), parts where its grammar joins them (";"). A name the
//   registry does not hold is read as TEXT (3.8.8).
// - 3.3 value types, each to one canonical form; a value its grammar does not
//   allow reads as { invalid }, so nothing malformed passes as read.
// - 3.6.5 time zones: a TZID is resolved by the object's own VTIMEZONE, its
//   STANDARD and DAYLIGHT observances expanded by their own rules
//   (site/time/recur.mjs), else by the browser's IANA time zone data.
// The reference reading these are held to is tools/oracle/ical.py.
import { REGISTRY } from "./registry.mjs";
import { instances, utcOf } from "../time/recur.mjs";

// Every value type the standard registers has its reading here, or the module refuses to load.
const DECODE = {
  BINARY: (v) => (/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v) ? { base64: v } : null),
  BOOLEAN: (v) => ({ TRUE: true, FALSE: false })[v.toUpperCase()] ?? null,
  "CAL-ADDRESS": (v) => (/^[A-Za-z][A-Za-z0-9+.-]*:\S*$/.test(v) ? v : null),
  DATE: (v) => (dateOf(v) ? { date: dateOf(v) } : null),
  "DATE-TIME": (v, zone, zones) => dateTimeOf(v, zone, zones),
  DURATION: (v) => durationOf(v),
  FLOAT: (v) => (/^[+-]?\d+(?:\.\d+)?$/.test(v) ? Number(v) : null),
  INTEGER: (v) => (/^[+-]?\d+$/.test(v) ? Number(v) : null),
  PERIOD: (v, zone, zones) => {
    const [start, end = ""] = [v.slice(0, v.indexOf("/") < 0 ? v.length : v.indexOf("/")), v.indexOf("/") < 0 ? "" : v.slice(v.indexOf("/") + 1)];
    const a = dateTimeOf(start, zone, zones);
    const lasting = /^[+-]?P/.test(end);
    const b = lasting ? durationOf(end) : dateTimeOf(end, zone, zones);
    return a && b ? { start: a, [lasting ? "duration" : "end"]: b } : null;
  },
  RECUR: (v) => {
    const parts = v.split(";").filter(Boolean).map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]);
    if (!parts.length || parts.some(([k], i) => !v.split(";").filter(Boolean)[i].includes("=") || !k) || !parts.some(([k]) => k.toUpperCase() === "FREQ")) return null;
    return Object.fromEntries(parts.map(([k, x]) => [k.toUpperCase(), x]));
  },
  TEXT: (v) => textOf(v),
  TIME: (v) => { const m = /^(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v); return m ? { time: `${m[1]}:${m[2]}:${m[3]}`, utc: !!m[4] } : null; },
  URI: (v) => (/^[A-Za-z][A-Za-z0-9+.-]*:\S*$/.test(v) ? v : null),
  "UTC-OFFSET": (v) => offsetOf(v),
};
const unread = Object.keys(REGISTRY.values).filter((type) => !DECODE[type]);
if (unread.length) throw new Error(`RFC 5545 value types with no reading: ${unread.join(", ")}`);

const pad = (n, w = 2) => String(n).padStart(w, "0");
function dateOf(v) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function dateTimeOf(v, zone, zones) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!dateOf(`${y}${mo}${d}`) || +h > 23 || +mi > 59 || +s > 60) return null;
  const wall = Date.UTC(+y, mo - 1, +d, +h, +mi, Math.min(+s, 59));
  if (z) return { utc: wall };
  const out = { local: `${y}-${mo}-${d}T${h}:${mi}:${s}` };
  if (zone) {
    out.zone = zone;
    const at = zoneAt(wall, zone, zones);
    if (Number.isFinite(at)) out.at = at;
  }
  return out;
}
function durationOf(v) {
  const m = /^([+-]?)P(?:(\d+)W|(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?)$/.exec(v);
  if (!m || /^[+-]?PT?$/.test(v) || v.endsWith("T")) return null;
  const [, sign, w, d, h, mi, s] = m;
  return { sign: sign === "-" ? -1 : 1, weeks: +(w ?? 0), days: +(d ?? 0), seconds: +(h ?? 0) * 3600 + +(mi ?? 0) * 60 + +(s ?? 0) };
}
function offsetOf(v) {
  const m = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(v);
  if (!m || (m[1] === "-" && !+m[2] && !+m[3] && !+(m[4] ?? 0))) return null;
  return (m[1] === "-" ? -1 : 1) * (+m[2] * 3600 + +m[3] * 60 + +(m[4] ?? 0));
}
// 3.3.11: \\ \; \, and \n (or \N) are the only escapes.
const textOf = (v) => v.replace(/\\([\\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));

// A value cut at each unescaped separator.
function cut(value, sep) {
  const out = [];
  let cur = "";
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i];
    if (c === "\\" && i + 1 < value.length) { cur += value.slice(i, i + 2); i += 1; continue; }
    if (c === sep) { out.push(cur); cur = ""; } else cur += c;
  }
  return [...out, cur];
}
// A parameter's values, cut at each "," outside a quoted string.
function quoted(values) {
  const out = [];
  let cur = "";
  let inside = false;
  for (const c of values) {
    if (c === '"') inside = !inside;
    if (c === "," && !inside) { out.push(cur); cur = ""; } else cur += c;
  }
  return [...out, cur].map((v) => (v.startsWith('"') && v.endsWith('"') && v.length > 1 ? v.slice(1, -1) : v));
}

// 3.1: name *(";" param) ":" value, a parameter value quoted when it holds ";", ":" or ",".
const PARAM = '[A-Za-z0-9-]+=(?:"[^"]*"|[^";:,]*)(?:,(?:"[^"]*"|[^";:,]*))*';
const LINE = new RegExp(`^([A-Za-z0-9-]+)((?:;${PARAM})*):(.*)$`);
export function* contentLines(text) {
  for (const line of text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = LINE.exec(line);
    if (!m) { yield { invalid: line }; continue; }
    const params = {};
    for (const [, name, values] of m[2].matchAll(new RegExp(`;([A-Za-z0-9-]+)=((?:"[^"]*"|[^";:,]*)(?:,(?:"[^"]*"|[^";:,]*))*)`, "g"))) params[name.toUpperCase()] = quoted(values);
    yield { name: m[1].toUpperCase(), params, value: m[3], raw: line };
  }
}

// A property's value, by its type, its several values and its parts, as its section says.
export function valueOf(line, zones = new Map()) {
  const known = REGISTRY.properties[line.name] ?? {};
  const type = ((line.params.VALUE ?? [])[0] ?? (known.types ?? ["TEXT"])[0]).toUpperCase();
  const zone = (line.params.TZID ?? [])[0];
  const read = DECODE[type] ?? DECODE.TEXT;
  const one = (v) => { const got = read(v, zone, zones); return got === null || got === undefined ? { invalid: v } : got; };
  if (known.parts) return cut(line.value, ";").map(one);
  if (known.many) return cut(line.value, ",").map(one);
  return one(line.value);
}

// The object's own time zones (3.6.5): each TZID's observances, each onset in UTC with the offset it brings.
export function zonesOf(text) {
  const zones = new Map();
  const outside = text.replace(/BEGIN:VTIMEZONE\r?\n[\s\S]*?END:VTIMEZONE/g, "");
  const horizon = Math.max(Date.UTC(1971, 0, 1), ...[...outside.matchAll(/\b(\d{4})(\d{2})(\d{2})(?:T|\b)/g)].map(([, y, m, d]) => Date.UTC(+y, m - 1, +d))) + 366 * 86_400_000;
  for (const [block] of text.matchAll(/BEGIN:VTIMEZONE\r?\n[\s\S]*?END:VTIMEZONE/g)) {
    const id = /^TZID[^:\r\n]*:(.*)$/m.exec(block.replace(/\r?\n[ \t]/g, ""))?.[1]?.trim();
    if (!id) continue;
    // A calendar sends the same zone with each of its objects: its onsets are worked out once.
    const seen = expanded.get(block);
    if (seen && seen.horizon >= horizon) { zones.set(id, seen.onsets); continue; }
    const onsets = [];
    for (const [obs] of block.matchAll(/BEGIN:(?:STANDARD|DAYLIGHT)\r?\n[\s\S]*?END:(?:STANDARD|DAYLIGHT)/g)) {
      const props = [...contentLines(obs)].filter((l) => l.name);
      const get = (name) => props.find((l) => l.name === name);
      const from = offsetOf(get("TZOFFSETFROM")?.value ?? "");
      const to = offsetOf(get("TZOFFSETTO")?.value ?? "");
      const start = get("DTSTART")?.value ?? "";
      if (from === null || to === null || !/^\d{8}T\d{6}$/.test(start)) continue;
      // Each onset is a local time in the offset it ends (TZOFFSETFROM); its rule's UNTIL is in UTC (3.8.5.3).
      const wallOf = (v) => (v.endsWith("Z") ? dateTimeOf(v).utc + from * 1000 : dateTimeOf(v)?.utc ?? dateTimeOf(`${v}Z`)?.utc);
      const rules = props.filter((l) => l.name === "RRULE").map((l) => l.value.replace(/UNTIL=(\d{8}T\d{6}Z?)/, (_, u) => { const w = new Date(wallOf(u)); return `UNTIL=${w.getUTCFullYear()}${pad(w.getUTCMonth() + 1)}${pad(w.getUTCDate())}T${pad(w.getUTCHours())}${pad(w.getUTCMinutes())}${pad(w.getUTCSeconds())}Z`; }));
      const rdates = props.filter((l) => l.name === "RDATE").flatMap((l) => l.value.split(",")).map((v) => v.replace(/Z$/, "")).filter((v) => /^\d{8}T\d{6}$/.test(v));
      const ical = [`DTSTART:${start}Z`, ...rules.map((r) => `RRULE:${r}`), ...(rdates.length ? [`RDATE:${rdates.map((v) => `${v}Z`).join(",")}`] : [])].join("\r\n");
      // Onsets through the latest time the object names, and a year more: those are the ones its times fall in.
      let walls = [];
      for (let limit = 16; ; limit *= 2) { walls = instances(ical, { limit }); if (walls.length < limit || walls[walls.length - 1] > horizon) break; }
      for (const wall of walls) onsets.push({ at: wall - from * 1000, offset: to });
    }
    zones.set(id, onsets.sort((a, b) => a.at - b.at));
    if (expanded.size >= 64) expanded.delete(expanded.keys().next().value);
    expanded.set(block, { horizon, onsets: zones.get(id) });
  }
  return zones;
}
const expanded = new Map();

// A local time in a zone, as UTC: by the object's own observances where it has them, else the browser's tz data.
function zoneAt(wall, zone, zones) {
  const onsets = zones.get(zone);
  if (onsets?.length) {
    const offsetAt = (at) => { let o = null; for (const s of onsets) { if (s.at <= at) o = s.offset; else break; } return o ?? onsets[0].offset; };
    for (const offset of [...new Set(onsets.map((s) => s.offset))]) if (offsetAt(wall - offset * 1000) === offset) return wall - offset * 1000;
    return wall - offsetAt(wall) * 1000;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    return NaN;
  }
  return utcOf(wall, zone);
}
export const instantOf = (value, zones = new Map()) => (value?.utc ?? value?.at ?? NaN);

// Each component also keeps its own unfolded content lines, BEGIN to END, as `text`, and each property its
// unparsed value as `raw`; neither is enumerable, so the reading itself is only names, parameters and values.
const hidden = (object, name, value) => Object.defineProperty(object, name, { value, enumerable: false });
export function tree(text) {
  const zones = zonesOf(text);
  const root = { name: null, props: [], children: [] };
  const stack = [root];
  const lines = new Map([[root, []]]);
  for (const line of contentLines(text)) {
    for (const open of stack) lines.get(open).push(line.raw ?? line.invalid);
    if (line.invalid !== undefined) { stack.at(-1).props.push(line); continue; }
    if (line.name === "BEGIN") { const child = { name: line.value.toUpperCase(), props: [], children: [] }; stack.at(-1).children.push(child); stack.push(child); lines.set(child, [line.raw]); continue; }
    if (line.name === "END") { if (stack.length > 1) { const done = stack.pop(); hidden(done, "text", lines.get(done).join("\r\n")); } continue; }
    stack.at(-1).props.push(hidden({ name: line.name, params: line.params, value: valueOf(line, zones) }, "raw", line.value));
  }
  for (const open of stack) if (open.text === undefined) hidden(open, "text", lines.get(open).join("\r\n"));
  return root;
}

// The object's events, to-dos and journal entries (3.6.1, 3.6.2, 3.6.3), in their order, wherever they are nested.
export function componentsOf(node) {
  return node.children.flatMap((c) => (["VEVENT", "VTODO", "VJOURNAL"].includes(c.name) ? [c] : componentsOf(c)));
}

// A DATE or DATE-TIME as a span gives it: an instant where it has one, else its date, else its floating local time.
const momentOf = (v) => (v?.utc !== undefined ? { at: v.utc } : v?.at !== undefined ? { at: v.at } : v?.date ? { date: v.date } : v?.local ? { local: v.local } : null);
const isoLocal = (ms) => { const d = new Date(ms); return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; };
const wallOfLocal = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), +iso.slice(11, 13), +iso.slice(14, 16), +iso.slice(17, 19));

// A start moved on by a DURATION (3.3.6): weeks and days by the calendar in its own zone, the rest exactly.
function later(start, by, zones) {
  const days = (by.weeks * 7 + by.days) * by.sign;
  const seconds = by.seconds * by.sign;
  if (start.date) { if (seconds) return null; const d = new Date(`${start.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return { date: d.toISOString().slice(0, 10) }; }
  if (start.utc !== undefined) return { at: start.utc + days * 86_400_000 + seconds * 1000 };
  const wall = wallOfLocal(start.local) + days * 86_400_000;
  if (start.zone && start.at !== undefined) return { at: zoneAt(wall, start.zone, zones) + seconds * 1000 };
  return { local: isoLocal(wall + seconds * 1000) };
}

// When a component starts and ends (3.6.1, 3.6.2, 3.8.2.2, 3.8.2.3, 3.8.2.5), its zones being the object's.
export function spanIn(c, zones = new Map()) {
  const prop = (name) => c.props.find((p) => p.name === name)?.value;
  const start = prop("DTSTART");
  if (!start || typeof start !== "object" || start.invalid !== undefined) return null;
  const end = prop("DTEND") ?? prop("DUE");
  if (end && typeof end === "object" && end.invalid === undefined) return { start: momentOf(start), end: momentOf(end) };
  const by = prop("DURATION");
  if (by && typeof by === "object" && by.invalid === undefined) { const moved = later(start, by, zones); return moved ? { start: momentOf(start), end: moved } : null; }
  // Neither: a DATE start lasts its day; a DATE-TIME start is an instant (3.6.1).
  if (start.date && c.name === "VEVENT") { const d = new Date(`${start.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return { start: momentOf(start), end: { date: d.toISOString().slice(0, 10) } }; }
  return { start: momentOf(start), end: momentOf(start) };
}

// When the first event, to-do or journal entry starts and ends.
export function spanOf(text) {
  const [c] = componentsOf(tree(text));
  return c ? spanIn(c, zonesOf(text)) : null;
}

// Whether a value is one the standard registers for a parameter or property (its IANA value registry).
export const registered = (field, value) => (REGISTRY.parameters[field] ?? REGISTRY.properties[field])?.registered?.includes(String(value).toUpperCase()) ?? false;
