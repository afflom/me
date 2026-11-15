// A message's header fields, each read by the rule its own specification
// gives it (RFC 5322 section 3.6 and its obsolete forms in section 4.5, with
// RFC 6532's UTF-8), from the grammar tools/standards/grammar.py takes from
// the pinned RFCs (site/read/grammar/mail.mjs). A field whose name no rule
// gives, or whose value its rule does not match, is read as the
// specification's optional field (3.6.8): its name and unstructured words.
// What a field means is then taken by the grammar's own rule names: its
// mailboxes, its date-time, its message identifiers, its words.
import { abnf, all, first } from "./abnf.mjs";
import mail from "./grammar/mail.mjs";

const grammar = abnf(mail);
const LAYOUT = new Set(["cfws", "fws", "comment", "obs-fws", "crlf"]);

// The header section's fields (RFC 5322 2.2: a name, a colon and a body that
// runs on over lines that begin with white space), up to the empty line.
export function headerLines(raw) {
  const text = String(raw).replace(/\r?\n/g, "\r\n");
  const end = text.search(/\r\n\r\n|^\r\n/);
  const head = end < 0 ? text : text.slice(0, end + 2);
  const out = [];
  for (const line of head.split(/(?<=\r\n)/)) {
    if (/^[ \t]/.test(line) && out.length) out[out.length - 1] += line;
    else if (line.trim()) out.push(line.endsWith("\r\n") ? line : `${line}\r\n`);
  }
  return out;
}

// One field, read by its rules in turn, else as an optional field; null if it
// is not a field at all. A field read once is not read again: a message's
// header is read for its words, its parts and what it carries.
const known = new Map();
export function readField(line) {
  if (known.has(line)) return known.get(line);
  const field = readOnce(line);
  if (known.size >= 4096) known.delete(known.keys().next().value);
  known.set(line, field);
  return field;
}
function readOnce(line) {
  const name = /^([!-9;-~]+)[ \t]*:/.exec(line)?.[1];
  if (!name) return null;
  // RFC 5322's rules end with the field's CRLF; RFC 2045's leave it to the header they stand in.
  const bare = line.replace(/\r\n$/, "");
  for (const rule of [...(mail.fields[name.toLowerCase()] ?? []), "optional-field", "obs-optional"]) {
    const tree = grammar.match(rule, line) ?? grammar.match(rule, bare);
    if (tree) return { name: name.toLowerCase(), rule, tree };
  }
  return { name: name.toLowerCase(), rule: null, tree: null, raw: line };
}

export const fieldsOf = (raw) => headerLines(raw).map(readField).filter(Boolean);

// The rules a message's fields went through, by name, for a suite to say what it exercised.
export const rulesOf = (fields) => fields.reduce((set, f) => grammar.rulesOf(f.tree, set), new Set());

// A tree's text without its comments and folding white space (RFC 5322 3.2.2: they are not part of what it says).
export function bare(tree) {
  if (!tree) return "";
  let out = "";
  let at = tree.start;
  const chars = Array.from(tree.text);
  for (const kid of tree.kids) {
    out += chars.slice(at - tree.start, kid.start - tree.start).join("");
    if (!LAYOUT.has(kid.rule)) out += bare(kid);
    at = kid.end;
  }
  return out + chars.slice(at - tree.start).join("");
}

// A phrase's words as written (3.2.5): atoms and quoted strings (their quoted
// pairs undone, 3.2.4), comments dropped, one space where white space or a
// comment stood between them; obs-phrase's "." (4.1) is written where it stands.
export function words(tree) {
  if (!tree) return "";
  let out = "";
  let gap = false;
  const put = (text) => { if (text === "") return; out += (out && gap ? " " : "") + text; gap = false; };
  const visit = (node) => {
    const chars = Array.from(node.text);
    let at = node.start;
    const between = (from, to) => { const g = chars.slice(from - node.start, to - node.start).join(""); if (/\s/.test(g)) gap = true; if (g.includes(".")) put("."); };
    for (const kid of node.kids) {
      between(at, kid.start);
      if (kid.rule === "quoted-string") { if (first(kid, "cfws") && first(kid, "cfws").start === kid.start) gap = true; put(quotedText(kid)); if (/\s$/.test(kid.text) || all(kid, "cfws").some((c) => c.end === kid.end)) gap = true; }
      else if (kid.rule === "atom") { if (/^\s|^\(/.test(kid.text)) gap = true; put(bare(kid).trim()); if (/[\s)]$/.test(kid.text)) gap = true; }
      else if (LAYOUT.has(kid.rule)) gap = true;
      else visit(kid);
      at = kid.end;
    }
    between(at, node.end);
  };
  visit(tree);
  return out;
}

function quotedText(tree) {
  let text = "";
  const visit = (node) => {
    for (const kid of node.kids) {
      if (kid.rule === "quoted-pair") text += Array.from(kid.text).slice(1).join("");
      else if (kid.rule === "qtext" || kid.rule === "obs-qtext") text += kid.text;
      else if (kid.rule === "fws" || kid.rule === "obs-fws") text += kid.text.replace(/\r\n/g, "");
      else if (kid.rule !== "cfws" && kid.rule !== "comment") visit(kid);
    }
  };
  visit(tree);
  return text;
}

// A field's mailboxes (3.4), each its display name and its address, groups' members included.
export function mailboxes(field) {
  if (!field?.tree) return [];
  return all(field.tree, "mailbox").map((box) => {
    const spec = first(box, "addr-spec");
    const display = first(box, "display-name");
    return { name: display ? words(display) : "", address: bare(spec).replace(/\s+/g, "") };
  });
}

// A field's message identifiers (3.6.4), each as "<left@right>".
export const messageIds = (field) => (field?.tree ? all(field.tree, "msg-id").map((id) => `<${bare(first(id, "id-left"))}@${bare(first(id, "id-right"))}>`) : []);

// A field's date-time (3.3) as milliseconds since the epoch: its zone by its
// offset, or by section 4.3's names; a two or three digit year as 4.3 reads it.
export function dateOf(field) {
  const dt = field?.tree ? first(field.tree, "date-time") : null;
  if (!dt) return NaN;
  const num = (rule) => { const t = first(dt, rule); return t ? Number(bare(t).trim()) : NaN; };
  let year = num("year");
  const written = bare(first(dt, "year")).trim();
  if (written.length === 2) year += year < 50 ? 2000 : 1900;
  else if (written.length === 3) year += 1900;
  const monthName = bare(first(dt, "month")).trim().toLowerCase();
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(monthName);
  const zoneTree = first(dt, "zone");
  const zone = bare(zoneTree).trim();
  let offset = 0;
  const numeric = /^([+-])(\d\d)(\d\d)$/.exec(zone);
  if (numeric) offset = (numeric[1] === "-" ? -1 : 1) * (Number(numeric[2]) * 60 + Number(numeric[3]));
  else offset = mail.zones[zone.toUpperCase()] ?? 0; // any other zone is -0000 (4.3): its offset is not known.
  const second = Number.isNaN(num("second")) ? 0 : num("second");
  const at = Date.UTC(year, month, num("day"), num("hour"), num("minute"), second) - offset * 60000;
  return Number.isFinite(at) && month >= 0 ? at : NaN;
}

// An unstructured field's words (3.2.5), its folding undone (2.2.3).
export function unstructured(field) {
  if (!field) return "";
  const line = field.tree ? field.tree.text : field.raw;
  return line.slice(line.indexOf(":") + 1).replace(/\r\n(?=[ \t])/g, "").replace(/\r\n$/, "").trim();
}

// What a message's header says (RFC 5322 3.6): who it is from and to, when
// it was written, its subject, its place in its conversation (3.6.4) and the
// list it came through (RFC 2919), each by its field's own grammar.
export function messageHeader(raw) {
  const fields = fieldsOf(raw);
  const one = (name) => fields.find((f) => f.name === name);
  const boxes = (name) => mailboxes(one(name));
  const list = one("list-id")?.tree ? first(one("list-id").tree, "list-id") : null;
  return {
    fields,
    from: boxes("from"), to: boxes("to"), cc: boxes("cc"), sender: boxes("sender"), replyTo: boxes("reply-to"),
    at: dateOf(one("date")),
    subject: unstructured(one("subject")),
    // A field that is not a mailbox by its grammar reads as its words (3.6.8).
    fromWords: unstructured(one("from") ?? one("to")),
    id: messageIds(one("message-id"))[0],
    inReplyTo: messageIds(one("in-reply-to")),
    references: messageIds(one("references")),
    ...(list ? { list: bare(list).toLowerCase() } : {}),
  };
}

// A MIME entity (RFC 2045 3, RFC 2046 5.1.1): its header fields, read by
// their grammar, and its body. The header ends at its empty line, or at the
// first line that is neither a field nor a field's continuation, which begins
// the body; a part that opens with an empty line has no header.
export function entity(raw) {
  const lines = String(raw).split(/(?<=\n)/);
  let at = 0;
  let i = 0;
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\r?\n$/.test(line)) { at += line.length; i += 1; break; }
    if (!(/^[!-9;-~]+[ \t]*:/.test(line) || (i > 0 && /^[ \t]/.test(line)))) break;
    at += line.length;
  }
  const head = lines.slice(0, i).join("");
  return { fields: fieldsOf(head), body: String(raw).slice(at) };
}

// A parameter's value as written: a token, or a quoted string's content.
const valueOf = (node) => { const q = node && first(node, "quoted-string"); return q ? quotedText(q) : bare(node).trim(); };

// RFC 2231 3 and 4: a value given in sections ("title*0", "title*1") is
// joined in their order, and a section marked "*" is percent-encoded in the
// charset its first section names.
function joinSections(pieces, charsetOf) {
  pieces.sort((a, b) => a.section - b.section);
  const charset = pieces.find((p) => p.encoded && p.section === 0)?.charset || pieces[0].charset || "us-ascii";
  let out = "";
  for (const p of pieces) {
    if (!p.encoded) { out += p.text; continue; }
    const bytes = [];
    for (let k = 0; k < p.text.length; k += 1) {
      if (p.text[k] === "%" && /^[0-9A-Fa-f]{2}$/.test(p.text.slice(k + 1, k + 3))) { bytes.push(parseInt(p.text.slice(k + 1, k + 3), 16)); k += 2; }
      else bytes.push(p.text.charCodeAt(k) & 0xff);
    }
    out += charsetOf(charset, Uint8Array.from(bytes));
  }
  return out;
}

const textIn = (charset, bytes) => { try { return new TextDecoder(charset, { fatal: false }).decode(bytes); } catch { return new TextDecoder("utf-8", { fatal: false }).decode(bytes); } };

// A field's parameters (RFC 2045 5.1 parameter, RFC 2183 2's disposition
// parameters, RFC 2231 7's sections and charsets), by lower-cased name.
export function parameters(field) {
  if (!field?.tree) return {};
  const nodes = ["parameter", "filename-parm", "creation-date-parm", "modification-date-parm", "read-date-parm", "size-parm"].flatMap((rule) => all(field.tree, rule));
  const byName = new Map();
  for (const node of nodes) {
    const extended = first(node, "extended-parameter");
    let piece;
    if (extended) {
      const name = first(extended, "extended-initial-name") ?? first(extended, "extended-other-names");
      const other = first(name, "other-sections");
      const initial = first(extended, "extended-initial-value");
      piece = {
        name: bare(first(name, "attribute")).toLowerCase(),
        section: other ? Number(bare(other).slice(1)) : 0,
        encoded: true,
        charset: initial ? bare(first(initial, "charset")) : "",
        text: bare(first(extended, "extended-other-values")),
      };
    } else {
      const regular = first(node, "regular-parameter-name");
      const section = regular ? first(regular, "section") : null;
      const value = first(node, "value") ?? first(node, "quoted-date-time") ?? node;
      piece = {
        name: (regular ? bare(first(regular, "attribute")) : bare(node).split("=")[0]).trim().toLowerCase(),
        section: section ? Number(bare(section).slice(1)) : 0,
        encoded: false,
        text: value === node ? bare(node).split("=").slice(1).join("=").trim() : valueOf(value),
      };
    }
    if (!byName.has(piece.name)) byName.set(piece.name, []);
    byName.get(piece.name).push(piece);
  }
  return Object.fromEntries([...byName].map(([name, pieces]) => [name, joinSections(pieces, textIn)]));
}

// A Content-Type (RFC 2045 5.1): its type and subtype, lower-cased, and its
// parameters; without one, text/plain in US-ASCII (5.2).
export function contentType(fields) {
  const field = fields.find((f) => f.name === "content-type" && f.rule === "content");
  if (!field) return { type: "text/plain", params: { charset: "us-ascii" }, given: false };
  return { type: `${bare(first(field.tree, "type")).trim()}/${bare(first(field.tree, "subtype")).trim()}`.toLowerCase(), params: parameters(field), given: true };
}

// A Content-Transfer-Encoding (RFC 2045 6.1): its mechanism, lower-cased; 7bit when none is given.
export function transferEncoding(fields) {
  const field = fields.find((f) => f.name === "content-transfer-encoding" && f.rule === "encoding");
  return field ? bare(first(field.tree, "mechanism")).trim().toLowerCase() : "7bit";
}

// A Content-Disposition (RFC 2183 2): inline or attachment (or an extension), and its parameters.
export function disposition(fields) {
  const field = fields.find((f) => f.name === "content-disposition" && f.rule === "disposition");
  return field ? { type: bare(first(field.tree, "disposition-type")).trim().toLowerCase(), params: parameters(field) } : { type: "", params: {} };
}

// The mailboxes a header names in the given fields, in order; a field no
// rule of the grammar gives (Delivered-To, RFC 9228) is read as the addr-spec
// its value is.
export function mailboxesIn(raw, names) {
  const fields = fieldsOf(raw);
  const out = [];
  for (const name of names) {
    for (const field of fields.filter((f) => f.name === name)) {
      const boxes = mailboxes(field);
      if (boxes.length) out.push(...boxes);
      else {
        const spec = grammar.match("addr-spec", unstructured(field));
        if (spec) out.push({ name: "", address: bare(spec).replace(/\s+/g, "") });
      }
    }
  }
  return out;
}
