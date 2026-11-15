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

// One field, read by its rules in turn, else as an optional field; null if it is not a field at all.
export function readField(line) {
  const name = /^([!-9;-~]+)[ \t]*:/.exec(line)?.[1];
  if (!name) return null;
  for (const rule of [...(mail.fields[name.toLowerCase()] ?? []), "optional-field", "obs-optional"]) {
    const tree = grammar.match(rule, line);
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
