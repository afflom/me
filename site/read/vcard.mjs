// A vCard read as RFC 6350 defines it. Its lines (3.2 folding, 3.3 content
// lines: group, name, parameters, value) and escapes (3.4) are the RFC's
// grammar; what each property holds comes from site/read/vcard.table.mjs,
// generated from the RFC's own ABNF and IANA's vCard Elements registry: a
// structured value splits at ";", a list (or a list component) at ",", and
// the value is text unless VALUE= or the property's default says otherwise.
// Only text is unescaped; a URI or any other value type is kept as written.
// test/oracle/vcard.test.mjs holds it to every example the RFC gives.
import { PROPERTIES } from "./vcard.table.mjs";

const LINE = /^(?:([A-Za-z0-9-]+)\.)?([A-Za-z0-9-]+)((?:;[A-Za-z0-9-]+=(?:"[^"]*"|[^";:]*)(?:,(?:"[^"]*"|[^";:,]*))*)*):([\s\S]*)$/;
const PARAM = /;([A-Za-z0-9-]+)=((?:"[^"]*"|[^";:]*)(?:,(?:"[^"]*"|[^";:,]*))*)/g;

// At each separator a backslash does not escape (3.4).
function split(value, sep) {
  const out = [];
  let cur = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\" && i + 1 < value.length) { cur += value.slice(i, i + 2); i++; continue; }
    if (value[i] === sep) { out.push(cur); cur = ""; } else cur += value[i];
  }
  return [...out, cur];
}

const unescape = (value) => value.replace(/\\([\\,;nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));

// One parameter's values: "," separates them, a quoted value is one (3.3 param-value).
function paramValues(text) {
  const out = [];
  let cur = "", quoted = false, any = false;
  for (const ch of text) {
    if (ch === '"') { quoted = !quoted; any = true; continue; }
    if (ch === "," && !quoted) { out.push(cur); cur = ""; any = false; continue; }
    cur += ch; any = true;
  }
  if (any || cur || out.length) out.push(cur);
  return out;
}

// One content line, unfolded: {group?, name, params, type, value}, or null when it is not one.
export function readLine(line) {
  const m = LINE.exec(line);
  if (!m) return null;
  const [, group, rawName, paramText, value] = m;
  const name = rawName.toUpperCase();
  const params = {};
  for (const p of paramText.matchAll(PARAM)) (params[p[1].toUpperCase()] ??= []).push(...paramValues(p[2]));
  // TYPE is a list of type-values (5.6), quoted or not.
  if (params.TYPE) params.TYPE = params.TYPE.flatMap((t) => t.split(","));
  const entry = PROPERTIES[name] ?? {};
  const type = (params.VALUE?.[0] ?? entry.default ?? "text").toLowerCase();
  let read;
  if (entry.shape === "structured") read = split(value, ";").map((c) => (entry.components === "list" ? split(c, ",").map(unescape) : unescape(c)));
  else if (type === "text" && entry.shape === "list") read = split(value, ",").map(unescape);
  else if (type === "text") read = unescape(value);
  else read = value;
  return { ...(group ? { group } : {}), name, params, type, value: read };
}

// A vCard's lines (3.2: a line break followed by one space or tab continues the line).
export function cardLines(text) {
  return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/).filter((l) => l.trim()).map(readLine).filter(Boolean);
}

// The vCard as its properties: name -> every instance, in order, BEGIN, END and VERSION aside.
export function readCard(text) {
  const card = {};
  for (const line of cardLines(text)) if (!["BEGIN", "END", "VERSION"].includes(line.name)) (card[line.name] ??= []).push(line);
  return card;
}
