// Reading the person's own content as a person reads it. A message as it
// arrives (RFC 5322 with MIME parts, transfer encodings and charsets) becomes
// its readable words: the plain part, else the HTML part's text, without the
// quoted history below it. An event's notes lose their markup and their
// conferencing boilerplate, and a repeating event is shown at its next time.
// Loaded only once something is kept, so a first visit carries none of it.
import { nextInstance } from "../time/recur.mjs";
import { componentsOf, spanIn, spanOf, tree, zonesOf } from "../calendar/ical.mjs";
import { contentType, disposition, entity, transferEncoding } from "./mail.mjs";
export { messageHeader } from "./mail.mjs";
export { readCard } from "./vcard.mjs";

function bytesOf(body, encoding) {
  const kind = (encoding ?? "").toLowerCase();
  if (kind === "base64") {
    try { return Uint8Array.from(atob(body.replace(/[^A-Za-z0-9+/=]/g, "")), (c) => c.charCodeAt(0)); } catch { /* as written */ }
  }
  const text = kind === "quoted-printable"
    ? body.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    : body;
  return Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);
}

// A part's text, its transfer encoding (RFC 2045 section 6) and charset undone.
export function decode(body, encoding, charset) {
  const bytes = bytesOf(body, encoding);
  try { return new TextDecoder(charset || "utf-8", { fatal: false }).decode(bytes); } catch { return new TextDecoder("utf-8", { fatal: false }).decode(bytes); }
}

// The leaf parts of a message, each with its type and decoded text, every
// field read by its grammar (site/read/mail.mjs). In a multipart/digest a
// part without a Content-Type is a message (RFC 2046 5.1.5).
function parts(text, depth = 0, attached = false, digest = false) {
  const { fields, body } = entity(text);
  const content = contentType(fields);
  const type = !content.given && digest ? "message/rfc822" : content.type;
  const boundary = content.params.boundary;
  if (type.startsWith("multipart/") && boundary && depth < 8) {
    // RFC 2046 section 5.1.1: each part lies between delimiter lines (CRLF,
    // "--", the boundary, transport padding); the preamble before the first and
    // the epilogue after the close are not parts.
    const esc = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pieces = `\r\n${body}`.split(new RegExp(`\\r?\\n--${esc}(--)?[ \\t]*(?:\\r?\\n|$)`));
    const out = [];
    // split with one capture: [preamble, close?, part, close?, part, ...]
    for (let k = 2; k < pieces.length; k += 2) {
      if (pieces[k - 1] === "--") break;
      out.push(...parts(pieces[k], depth + 1, attached, type === "multipart/digest"));
    }
    return out;
  }
  if (!attached && disposition(fields).type === "attachment") return [];
  return [{ type, text: decode(body, transferEncoding(fields), content.params.charset) }];
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function textOfHtml(html) {
  return html
    .replace(/<(style|script|head|title)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m));
}

// Long links read as their site; whitespace and blank runs settle.
function tidy(text) {
  return text
    .replace(/ |​|‌|͏/g, " ")
    .replace(/<?(https?:\/\/([^/\s>]+)[^\s>]{40,})>?/g, (_, url, host) => host.replace(/^www\./, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// What the sender wrote now, without the history quoted below it.
function fresh(text) {
  const lines = text.split(/\r?\n/);
  const cut = lines.findIndex((line, i) =>
    /^On .{4,200}wrote:\s*$/.test(line) || (/^On .{4,200}$/.test(line) && /wrote:\s*$/.test(lines[i + 1] ?? "")) ||
    /^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}/i.test(line) || /^_{10,}$/.test(line) ||
    (/^From: /.test(line) && /^(Sent|Date): /.test(lines[i + 1] ?? "")));
  const kept = (cut > 0 ? lines.slice(0, cut) : lines).filter((line) => !/^\s*>/.test(line));
  return kept.join("\n");
}

// A message's readable words.
export function messageBody(raw) {
  const all = parts(raw);
  const plain = all.find((p) => p.type === "text/plain" && p.text.trim());
  const html = all.find((p) => p.type === "text/html" && p.text.trim());
  const text = plain ? plain.text : html ? textOfHtml(html.text) : "";
  return tidy(fresh(text.replace(/\r\n/g, "\n")));
}

// The schema.org objects a message's HTML carries as JSON-LD (JSON-LD 1.1
// section 7, "Embedding JSON-LD in HTML Documents"), as mail that books,
// sells or confirms embeds them: each with its type and the people it names.
const PEOPLE = ["underName", "customer", "attendee", "broker"];
export function messageMarkup(raw) {
  const out = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node["@graph"])) return node["@graph"].forEach(visit);
    const types = [].concat(node["@type"] ?? []).map((t) => String(t).replace(/^(https?:\/\/schema\.org\/|schema:)/, ""));
    if (!types.length) return;
    const people = PEOPLE.flatMap((key) => [].concat(node[key] ?? []))
      .filter((p) => p && typeof p === "object" && [].concat(p["@type"] ?? []).some((t) => /(^|\/)Person$/.test(String(t))) && p.name)
      .map((p) => String(p.name).trim());
    out.push({ types, people });
  };
  for (const part of parts(raw)) {
    if (part.type !== "text/html") continue;
    for (const [, json] of part.text.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
      try { visit(JSON.parse(json)); } catch { /* not JSON: not markup */ }
    }
  }
  return out;
}

// The events a message carries (RFC 6047 iMIP): its text/calendar parts, inline or attached.
export function messageEvent(raw) {
  return parts(raw, 0, true).filter((p) => p.type === "text/calendar" && /^BEGIN:V(EVENT|TODO|JOURNAL)/im.test(p.text)).map((p) => p.text).join("\r\n");
}

// RFC 5545 text: escapes undone, markup and conferencing boilerplate dropped.
export function eventText(value = "") {
  return notesOf(value.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1"));
}
// A TEXT value already read (3.3.11), as notes: markup and conferencing boilerplate dropped.
function notesOf(text = "") {
  const plain = /<[a-z][^>]*>/i.test(text) ? textOfHtml(text) : text;
  const cut = plain.search(/-::~:~::~:|Join (with )?Google Meet|Join Zoom Meeting|Microsoft Teams meeting|Join on your computer/i);
  return tidy(cut >= 0 ? plain.slice(0, cut) : plain);
}

// A repeating event's next time at or after now, by its own rule (site/time/recur.mjs, RFC 5545 3.8.5):
// once its rule has run out, the last time it had.
export function nextTime(component, start, now = Date.now()) {
  if (!/^RRULE[:;]/im.test(component.replace(/\r?\n[ \t]/g, "")) || !Number.isFinite(start) || start >= now) return start;
  const at = nextInstance(component, now);
  return Number.isFinite(at) ? at : start;
}

// When an event or to-do starts and ends, as the standard reads it (site/calendar/ical.mjs, RFC 5545
// 3.6, 3.8.2): its time zones' own observances, an end, a due time or a duration. A date is its
// local midnight; a time with no zone is floating, so it is the person's own wall-time.
const msOf = (m) => (!m ? NaN : m.at !== undefined ? m.at : m.date ? new Date(`${m.date}T00:00:00`).getTime() : m.local ? new Date(m.local).getTime() : NaN);
export function calendarSpan(text) {
  const span = spanOf(text);
  return span ? { start: msOf(span.start), end: msOf(span.end) } : null;
}

// A calendar object as the person holds it, each of its events, to-dos and journal entries read
// by the standard (site/calendar/ical.mjs): its method (RFC 5546), and each component's identity,
// revision and instance, its times, what it says, where it is and who it is with. An object of
// free/busy time only (3.6.4) is that one component.
const msOfValue = (v) => (!v || typeof v !== "object" || v.invalid !== undefined ? NaN : msOf(v.utc !== undefined ? { at: v.utc } : v));
const oneLine = (v) => (typeof v === "string" ? v.replace(/\s*\n\s*/g, " ").trim() : "");
// A line whose parameters 3.1 does not allow still names what it is about: RFC 5546's own
// example writes RECURRENCE-ID;THISANDFUTURE for RANGE=THISANDFUTURE, and the instance it
// revises is still its value, after the line's first ":" outside a quoted parameter.
function unreadValue(c, name) {
  const line = c.props.find((p) => p.invalid !== undefined && new RegExp(`^${name}[;:]`, "i").test(p.invalid))?.invalid;
  return line ? /^[^:"]*(?:"[^"]*"[^:"]*)*:(.*)$/.exec(line)?.[1].trim() ?? "" : "";
}
export function calendarEvents(text) {
  const root = tree(text);
  const zones = zonesOf(text);
  const calendar = root.children.find((c) => c.name === "VCALENDAR") ?? root;
  const method = oneLine(calendar.props.find((p) => p.name === "METHOD")?.value).toUpperCase();
  const busy = calendar.children.find((c) => c.name === "VFREEBUSY");
  const own = componentsOf(root);
  return { method, events: (own.length ? own : [busy ?? calendar]).map((c) => {
    const all = (name) => c.props.filter((p) => p.name === name);
    const one = (name) => all(name)[0]?.value;
    const span = spanIn(c, zones);
    const start = span ? msOf(span.start) : NaN;
    const due = msOfValue(one("DUE"));
    const made = ["DTSTAMP", "CREATED", "LAST-MODIFIED"].map((name) => msOfValue(one(name))).find((t) => !Number.isNaN(t)) ?? NaN;
    const first = Number.isNaN(start) ? due : start;
    const sequence = Number.isInteger(one("SEQUENCE")) ? one("SEQUENCE") : 0;
    return {
      component: c === calendar ? "VEVENT" : c.name,
      text: c.text,
      uid: oneLine(one("UID")),
      sequence,
      recurrence: all("RECURRENCE-ID")[0]?.raw ?? unreadValue(c, "RECURRENCE-ID"),
      start: nextTime(c.text, first),
      first,
      end: span ? msOf(span.end) : NaN,
      allDay: Boolean(one("DTSTART")?.date),
      made,
      title: oneLine(one("SUMMARY")),
      location: oneLine(one("LOCATION")),
      notes: notesOf(typeof one("DESCRIPTION") === "string" ? one("DESCRIPTION") : ""),
      comments: all("COMMENT").map((p) => notesOf(typeof p.value === "string" ? p.value : "")),
      people: c.props.filter((p) => p.name === "ORGANIZER" || p.name === "ATTENDEE").map((p) => p.params.CN?.[0] ?? String(p.value?.invalid ?? p.value ?? "").replace(/^mailto:/i, "")).filter(Boolean),
    };
  }) };
}
