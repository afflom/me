// What one kept item says, for its row in a place: a title, who it is from
// or with, and when. It reads the bytes the vault restored; it decides
// nothing, and an item the vault keeps only as a hash says only that.
//
//   readItem({address, outcome, bytes, meta, at}) -> {address, domain, at, title, who, text, sealed}

const decoder = new TextDecoder("utf-8", { fatal: false });

// RFC 5322 and RFC 5545 fold long lines; unfold before reading a field.
const unfold = (text) => text.replace(/\r?\n[ \t]/g, " ");

function headers(text) {
  const head = unfold(text.split(/\r?\n\r?\n/, 1)[0]);
  const out = {};
  for (const line of head.split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at > 0) out[line.slice(0, at).trim().toLowerCase()] ??= line.slice(at + 1).trim();
  }
  return out;
}

// RFC 2047 encoded words, the common case of a subject or a sender's name.
function words(value = "") {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_, charset, kind, data) => {
    try {
      const bytes = kind.toUpperCase() === "B"
        ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
        : Uint8Array.from(data.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))), (c) => c.charCodeAt(0));
      return new TextDecoder(charset, { fatal: false }).decode(bytes);
    } catch {
      return data;
    }
  });
}

const person = (from = "") => {
  const named = /^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/.exec(from);
  return words(named ? named[1] : from.replace(/[<>]/g, ""));
};

function calendarField(text, name) {
  const match = new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "mi").exec(unfold(text));
  return match ? match[1].trim().replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, " ") : "";
}

function icsTime(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
  if (!m) return NaN;
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  return z ? Date.UTC(+y, mo - 1, +d, +h, +mi, +s) : new Date(+y, mo - 1, +d, +h, +mi, +s).getTime();
}

export function readItem({ address, outcome, bytes, meta = {}, at = 0 }) {
  const about = meta.about ?? {};
  const base = { address, domain: about.domain ?? 11, media: about.media ?? "plainText", label: meta.label, at: about.at ?? at };
  if (outcome !== "restore") return { ...base, sealed: true, title: "", who: "", text: "" };
  const text = decoder.decode(bytes);
  if (base.media === "message") {
    const h = headers(text);
    const when = Date.parse(h.date ?? "");
    return { ...base, at: Number.isNaN(when) ? base.at : when, title: words(h.subject ?? ""), who: person(h.from), text };
  }
  if (base.media === "calendar") {
    const start = icsTime(calendarField(text, "DTSTART"));
    return { ...base, at: Number.isNaN(start) ? base.at : start, title: calendarField(text, "SUMMARY"), who: calendarField(text, "LOCATION"), text };
  }
  const first = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  return { ...base, title: first.trim(), who: "", text };
}
