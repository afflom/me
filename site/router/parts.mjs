// Every item taken apart into the values of its own schema, so the router can
// map each onto the Prism's features: its subject, its words, its typed start,
// the people its schema names, and its shape (the parts it is built of, never
// what they say). The words are the ones the person reads (site/read/read.mjs
// has already decoded them into item.body); the headers and the event's
// fields are read from the bytes as they arrived.
import { isRobot } from "./features.mjs";
import { PROVIDERS } from "./table.mjs";

// The router's source for each medium the vault keeps.
export const SOURCE = { message: "message", calendar: "calendar", contactCard: "contact", plainText: "note" };

// Unfolding: a mail header keeps the white space after the line break (RFC
// 5322 2.2.3); an iCalendar content line loses it with the break (RFC 5545 3.1).
const unfold = (text = "") => text.replace(/\r?\n(?=[ \t])/g, "");
const unfoldCalendar = (text = "") => text.replace(/\r?\n[ \t]/g, "");
const headOf = (text) => unfold(text.split(/\r?\n\r?\n/, 1)[0]);
const header = (head, name) => new RegExp(`^${name}:[ \\t]*(.*)$`, "mi").exec(head)?.[1]?.trim() ?? "";

// RFC 2047 encoded words in a header, decoded.
function words(value = "") {
  return value.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=\s*/gi, (_, charset, how, data) => {
    try {
      const bytes = how.toLowerCase() === "b"
        ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
        : Uint8Array.from(data.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))), (c) => c.charCodeAt(0));
      return new TextDecoder(charset, { fatal: false }).decode(bytes);
    } catch { return data; }
  });
}

// The mailboxes of an address header, by RFC 5322 section 3.4: [{name, address}].
// Quoted strings, comments (nested, with quoted pairs), angle addresses with
// an obsolete route, groups ("A Group: a, b;") and folding white space inside
// an address are read as the grammar says; an empty list member is skipped.
export function mailboxes(value = "") {
  const text = words(value);
  const tokens = [];
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === "\\" ) { tokens.push({ t: "atom", v: text[i + 1] ?? "" }); i += 2; continue; }
    if (c === '"') {
      let v = ""; i += 1;
      while (i < text.length && text[i] !== '"') { if (text[i] === "\\") i += 1; v += text[i] ?? ""; i += 1; }
      tokens.push({ t: "quoted", v }); i += 1; continue;
    }
    if (c === "(") {
      let depth = 1; i += 1;
      while (i < text.length && depth) { if (text[i] === "\\") i += 1; else if (text[i] === "(") depth += 1; else if (text[i] === ")") depth -= 1; i += 1; }
      tokens.push({ t: "space" }); continue;
    }
    if (/\s/.test(c)) { while (i < text.length && /\s/.test(text[i])) i += 1; tokens.push({ t: "space" }); continue; }
    if ("<>,:;@.".includes(c)) { tokens.push({ t: c }); i += 1; continue; }
    let v = "";
    while (i < text.length && !/[\s"(<>,:;@.\\]/.test(text[i])) { v += text[i]; i += 1; }
    tokens.push({ t: "atom", v });
  }
  const out = [];
  // One mailbox from its tokens: a display name and an angle address, or a bare address.
  const one = (list) => {
    const angle = list.findIndex((x) => x.t === "<");
    const spec = (xs) => xs.filter((x) => x.t !== "space").map((x) => (x.t === "atom" || x.t === "quoted" ? x.v : x.t)).join("");
    if (angle >= 0) {
      const close = list.findIndex((x, k) => k > angle && x.t === ">");
      let addr = spec(list.slice(angle + 1, close < 0 ? undefined : close));
      addr = addr.includes(":") ? addr.slice(addr.lastIndexOf(":") + 1) : addr; // the obsolete route
      const name = list.slice(0, angle).map((x) => (x.t === "space" ? " " : x.t === "atom" || x.t === "quoted" ? x.v : x.t)).join("").replace(/\s+/g, " ").trim();
      if (addr || name) out.push({ name: name || addr, address: addr.toLowerCase(), shown: addr });
    } else {
      const addr = spec(list);
      if (addr) out.push({ name: addr, address: addr.includes("@") ? addr.toLowerCase() : "", shown: addr });
    }
  };
  let member = [];
  let inAngle = false;
  for (const x of tokens) {
    if (x.t === "<") inAngle = true;
    if (x.t === ">") inAngle = false;
    if (!inAngle && x.t === ":") { member = []; continue; } // a group's name
    if (!inAngle && (x.t === "," || x.t === ";")) { if (member.some((y) => y.t !== "space")) one(member); member = []; continue; }
    member.push(x);
  }
  if (member.some((y) => y.t !== "space")) one(member);
  return out.map(({ name, address }) => ({ name, address }));
}

const field = (text, name) => new RegExp(`^${name}((?:;[^:\\r\\n]*)?):(.*)$`, "gmi");

// The people an event names: its organizer and attendees, one per address,
// by their common name when one is given (RFC 5545 3.8.4.1, 3.8.4.3). A room
// or a resource (CUTYPE, 3.2.3) is not someone the event is with.
function peopleOfEvent(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(ORGANIZER|ATTENDEE)((?:;(?:[^:";]|"[^"]*")*)*):(.*)$/i.exec(line);
    if (!m) continue;
    const params = m[2];
    if (/;CUTYPE=(ROOM|RESOURCE)/i.test(params)) continue;
    const name = /;CN=("[^"]*"|[^;:]*)/i.exec(params)?.[1]?.replace(/^"|"$/g, "") ?? "";
    const shown = m[3].trim().replace(/^mailto:/i, "");
    const address = shown.includes("@") ? shown.toLowerCase() : "";
    const seen = out.find((p) => address && p.address === address);
    if (seen) { if (name && seen.name === seen.shown) seen.name = name; continue; }
    if (name || address) out.push({ name: name || shown, address, shown, role: "with", robot: isRobot({ name, address }) });
  }
  return out.map(({ shown, ...p }) => p);
}

// A message's shape: which structures it carries.
function messageShape(raw, head, from) {
  const shapes = [];
  if (header(head, "List-Id") || header(head, "List-Unsubscribe")) shapes.push("list");
  if (/^(bulk|list|junk)$/i.test(header(head, "Precedence")) || /^auto-/i.test(header(head, "Auto-Submitted"))) shapes.push("bulk");
  if (from.length && from.every(isRobot)) shapes.push("robot");
  if (header(head, "In-Reply-To") || header(head, "References")) shapes.push("reply");
  if (/content-type:\s*text\/calendar/i.test(raw)) shapes.push("attachment-calendar");
  if (/^METHOD:REQUEST\s*$/mi.test(raw)) shapes.push("method-request");
  if (/content-disposition:\s*attachment/i.test(raw)) shapes.push("attachment");
  return shapes;
}

// What the sender says first in their own words: not a greeting, a quote of
// earlier mail, a signature or a bare link, but their first sentence, at most
// the sentence provider's "lead" characters. It is what a message asks or tells;
// a message that is only a greeting says its greeting.
const QUOTED = [/^On .+wrote:\s*$/, /^-{2,} ?Original Message ?-{2,}/i, /^-- ?$/, /^_{5,}\s*$/];
const GREETING = /^(hi|hello|hey|dear|good (morning|afternoon|evening))\b[^.!?\n]{0,40}[,!.:]?$/i;
const SIGNOFF = /^(thanks|thank you|best|cheers|regards|kind regards|best regards|sincerely|sent from my)\b/i;
const clip = (sentence, most) => (sentence.length > most ? `${sentence.slice(0, most - 1).replace(/\s+\S*$/, "")}…` : sentence);
export function leadOf(text = "", most = PROVIDERS.sentence.lead) {
  const own = [];
  for (const line of text.split(/\r?\n/)) {
    if (QUOTED.some((r) => r.test(line)) || (/^From: .+/.test(line) && own.length)) break;
    if (!/^\s*>/.test(line)) own.push(line);
  }
  let greeting = "";
  for (const block of own) {
    const line = block.replace(/\s+/g, " ").trim();
    if (GREETING.test(line)) greeting ||= line;
    if (line.length < 3 || GREETING.test(line) || SIGNOFF.test(line) || /^https?:\/\/\S+$/.test(line)) continue;
    return clip(/^(.{12,}?[.!?])(\s|$)/.exec(line)?.[1] ?? line, most);
  }
  return clip(greeting, most);
}

// The values of one item, by its source's schema.
export function partsOf(item) {
  const source = SOURCE[item.media] ?? "note";
  const raw = item.text ?? "";
  if (source === "message") {
    const head = headOf(raw);
    const from = mailboxes(header(head, "From") || header(head, "Sender")).map((p) => ({ ...p, role: "from" }));
    const to = ["To", "Cc"].flatMap((name) => mailboxes(header(head, name)).map((p) => ({ ...p, role: "to" })));
    const shape = messageShape(raw, head, from);
    // An automated message's sender is a mailer, not someone the person is
    // with; an invitation it carries names who the event is with.
    const automated = PROVIDERS.kind.automated.some((x) => shape.includes(x));
    const invited = shape.includes("attachment-calendar") ? peopleOfEvent(unfoldCalendar(raw)) : [];
    const party = invited.length ? invited : [...from, ...to].map((p) => ({ ...p, robot: automated || isRobot(p) }));
    return { source, values: { subject: item.title ?? "", text: item.body ?? "", lead: leadOf(item.body ?? ""), party, shape } };
  }
  if (source === "calendar") {
    const text = unfoldCalendar(raw);
    const party = peopleOfEvent(text);
    const shape = ["vevent"];
    if (party.length > 1) shape.push("attendees");
    if (/^RRULE[:;]/mi.test(text)) shape.push("recurring");
    if (/^LOCATION[:;]/mi.test(text)) shape.push("location");
    return { source, values: { subject: item.title ?? "", text: item.body ?? "", start: Number.isFinite(item.start) ? item.start : Number.isFinite(item.at) ? item.at : null, party, shape } };
  }
  if (source === "contact") {
    return { source, values: { party: item.title ? [{ name: item.title, address: (item.who ?? "").includes("@") ? item.who.toLowerCase() : "", role: "with", robot: false }] : [], shape: ["card"] } };
  }
  return { source, values: { text: item.body ?? item.text ?? "", shape: ["note"] } };
}
