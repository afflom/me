// Reading the person's own content as a person reads it. A message as it
// arrives (RFC 5322 with MIME parts, transfer encodings and charsets) becomes
// its readable words: the plain part, else the HTML part's text, without the
// quoted history below it. An event's notes lose their markup and their
// conferencing boilerplate, and a repeating event is shown at its next time.
// Loaded only once something is kept, so a first visit carries none of it.

const unfold = (text) => text.replace(/\r?\n[ \t]/g, " ");

function split(text) {
  const at = text.search(/\r?\n\r?\n/);
  if (at < 0) return { head: text, body: "" };
  return { head: text.slice(0, at), body: text.slice(at).replace(/^\r?\n\r?\n/, "") };
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

function decode(body, encoding, charset) {
  const bytes = bytesOf(body, encoding);
  try { return new TextDecoder(charset || "utf-8", { fatal: false }).decode(bytes); } catch { return new TextDecoder("utf-8", { fatal: false }).decode(bytes); }
}

// The leaf parts of a message, each with its type and decoded text.
function parts(text, depth = 0) {
  const { head, body } = split(text);
  const h = fields(head);
  const type = (h["content-type"] ?? "text/plain").split(";")[0].trim().toLowerCase();
  const boundary = param(h["content-type"], "boundary");
  if (type.startsWith("multipart/") && boundary && depth < 8) {
    const out = [];
    for (const chunk of body.split(new RegExp(`\\r?\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?\\r?\\n?`))) {
      if (chunk.trim()) out.push(...parts(chunk, depth + 1));
    }
    return out;
  }
  if ((h["content-disposition"] ?? "").toLowerCase().startsWith("attachment")) return [];
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

// RFC 5545 text: escapes undone, markup and conferencing boilerplate dropped.
export function eventText(value = "") {
  const text = value.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
  const plain = /<[a-z][^>]*>/i.test(text) ? textOfHtml(text) : text;
  const cut = plain.search(/-::~:~::~:|Join (with )?Google Meet|Join Zoom Meeting|Microsoft Teams meeting|Join on your computer/i);
  return tidy(cut >= 0 ? plain.slice(0, cut) : plain);
}

// A repeating event's next time at or after now (daily, weekly, monthly, yearly; INTERVAL, COUNT, UNTIL).
export function nextTime(rule, start, now = Date.now()) {
  if (!rule || !Number.isFinite(start) || start >= now) return start;
  const get = (name) => new RegExp(`(?:^|;)${name}=([^;]+)`, "i").exec(rule)?.[1];
  const freq = (get("FREQ") ?? "").toUpperCase();
  const every = Math.max(1, Number(get("INTERVAL") ?? 1));
  const count = get("COUNT") ? Number(get("COUNT")) : Infinity;
  const untilRaw = get("UNTIL");
  const until = untilRaw ? Date.UTC(+untilRaw.slice(0, 4), +untilRaw.slice(4, 6) - 1, +untilRaw.slice(6, 8), 23, 59, 59) : Infinity;
  const step = (d, n) => {
    const x = new Date(d);
    if (freq === "DAILY") x.setDate(x.getDate() + n * every);
    else if (freq === "WEEKLY") x.setDate(x.getDate() + 7 * n * every);
    else if (freq === "MONTHLY") x.setMonth(x.getMonth() + n * every);
    else if (freq === "YEARLY") x.setFullYear(x.getFullYear() + n * every);
    else return NaN;
    return x.getTime();
  };
  const span = { DAILY: 864e5, WEEKLY: 6048e5, MONTHLY: 2592e6, YEARLY: 31536e6 }[freq];
  if (!span) return start;
  let n = Math.max(0, Math.floor((now - start) / (span * every)) - 1);
  for (let guard = 0; guard < 64 && n < count; guard += 1, n += 1) {
    const t = step(start, n);
    if (Number.isNaN(t) || t > until) return start;
    if (t >= now) return t;
  }
  return start;
}
