// Reading the person's own content as a person reads it. A message as it
// arrives (RFC 5322 with MIME parts, transfer encodings and charsets) becomes
// its readable words: the plain part, else the HTML part's text, without the
// quoted history below it. An event's notes lose their markup and their
// conferencing boilerplate, and a repeating event is shown at its next time.
// Loaded only once something is kept, so a first visit carries none of it.
import { nextInstance } from "../time/recur.mjs";

const unfold = (text) => text.replace(/\r?\n[ \t]/g, " ");

// RFC 5322 section 2.1: the header is the field lines (a name, a colon) and
// their folded continuations; it ends at the first empty line, which is
// dropped, or at the first line that is neither, which begins the body. A
// part that opens with an empty line has no header (RFC 2046 section 5.1.1).
function split(text) {
  const lines = text.split(/(?<=\n)/);
  let at = 0;
  let i = 0;
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\r?\n$/.test(line)) { at += line.length; i += 1; break; }
    if (!(/^[!-9;-~]+:/.test(line) || (i > 0 && /^[ \t]/.test(line)))) break;
    at += line.length;
  }
  const end = i > 0 && /^\r?\n$/.test(lines[i - 1]) ? at - lines[i - 1].length : at;
  return { head: text.slice(0, end), body: text.slice(at) };
}

function fields(head) {
  const out = {};
  for (const line of unfold(head).split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at > 0) out[line.slice(0, at).trim().toLowerCase()] ??= line.slice(at + 1).trim();
  }
  return out;
}

const param = (value = "", name) => new RegExp(`${name}\\s*=\\s*"?([^";]+)"?`, "i").exec(value)?.[1] ?? "";

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

// The leaf parts of a message, each with its type and decoded text.
function parts(text, depth = 0, attached = false) {
  const { head, body } = split(text);
  const h = fields(head);
  const type = (h["content-type"] ?? "text/plain").split(";")[0].trim().toLowerCase();
  const boundary = param(h["content-type"], "boundary");
  if (type.startsWith("multipart/") && boundary && depth < 8) {
    // RFC 2046 section 5.1.1: each part lies between delimiter lines; the
    // preamble before the first and the epilogue after the close are not parts.
    const esc = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pieces = `\r\n${body}`.split(new RegExp(`\\r?\\n--${esc}(--)?[ \\t]*(?:\\r?\\n|$)`));
    const out = [];
    // split with one capture: [preamble, close?, part, close?, part, ...]
    for (let k = 2; k < pieces.length; k += 2) {
      if (pieces[k - 1] === "--") break;
      out.push(...parts(pieces[k], depth + 1, attached));
    }
    return out;
  }
  if (!attached && (h["content-disposition"] ?? "").toLowerCase().startsWith("attachment")) return [];
  return [{ type, text: decode(body, h["content-transfer-encoding"], param(h["content-type"], "charset")) }];
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
