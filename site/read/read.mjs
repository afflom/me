// Reading the person's own content as a person reads it. A message as it
// arrives (RFC 5322 with MIME parts, transfer encodings and charsets) becomes
// its readable words: the plain part, else the HTML part's text, without the
// quoted history below it. An event's notes lose their markup and their
// conferencing boilerplate, and a repeating event is shown at its next time.
// Loaded only once something is kept, so a first visit carries none of it.
import { nextInstance } from "../time/recur.mjs";
import { contentType, disposition, entity, transferEncoding } from "./mail.mjs";
export { messageHeader } from "./mail.mjs";
import * as pin from "./guest.mjs";

// A vCard is read by the vcard guest (app/src/PrismVcard.lex.tex, pinned in
// ./guest.mjs): checked and compiled once, when this module loads, then asked
// synchronously. Its answers: "line" the JSON of one content line (null when
// it is none), "cards" each card unfolded (RFC 6350 3.2), NUL-separated.
const guest = pin.GUESTS?.vcard ?? pin.GUEST;
const url = new URL(guest.path, new URL("./guest.mjs", import.meta.url));
const bytes = url.protocol === "file:" ? await (await import("node:fs/promises")).readFile(url) : new Uint8Array(await (await fetch(url)).arrayBuffer());
export const vcard = await pin.openGuestSync(bytes, guest.sha256);
// A line beyond the guest's request limit reads as none ("invalid").
export const readLine = (line) => { const a = vcard(`line\n${line}`); return a === "invalid" ? null : JSON.parse(a); };

// The vCard as its properties: name -> every instance, in order, BEGIN, END and VERSION aside.
export function readCard(text) {
  const card = {};
  for (const raw of (vcard(`cards\n${text}`).split("\0")[0] ?? "").split("\r\n")) {
    const line = raw ? readLine(raw) : null;
    if (line && !["BEGIN", "END", "VERSION"].includes(line.name)) (card[line.name] ??= []).push(line);
  }
  return card;
}

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
  const text = value.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
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
