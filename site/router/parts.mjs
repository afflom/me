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

const unfold = (text = "") => text.replace(/\r?\n[ \t]+/g, " ");
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

// The mailboxes of an address header: [{name, address}].
export function mailboxes(value = "") {
  const out = [];
  for (const part of words(value).split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const named = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(part);
    const address = (named ? named[2] : /[^\s<>"]+@[^\s<>"]+/.exec(part)?.[0] ?? "").trim().toLowerCase();
    const name = (named ? named[1] : "").replace(/\\(.)/g, "$1").trim() || address;
    if (address || name) out.push({ name, address });
  }
  return out;
}

const field = (text, name) => new RegExp(`^${name}((?:;[^:\\r\\n]*)?):(.*)$`, "gmi");

// The people an event names: its organizer and attendees.
function peopleOfEvent(text) {
  const out = [];
  for (const [, params, value] of text.matchAll(field(text, "(?:ORGANIZER|ATTENDEE)"))) {
    const name = /;CN=("[^"]*"|[^;:]*)/i.exec(params)?.[1]?.replace(/^"|"$/g, "") ?? "";
    const address = /^mailto:(.*)$/i.exec(value.trim())?.[1]?.toLowerCase() ?? "";
    if ((name || address) && !out.some((p) => p.address === address && address)) out.push({ name: name || address, address, role: "with", robot: isRobot({ name, address }) });
  }
  return out;
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
// the sentence provider's "lead" characters. It is what a message asks or tells.
const QUOTED = [/^On .+wrote:\s*$/, /^-{2,} ?Original Message ?-{2,}/i, /^-- ?$/, /^_{5,}\s*$/];
const GREETING = /^(hi|hello|hey|dear|good (morning|afternoon|evening))\b[^.!?\n]{0,40}[,!.:]?$/i;
const SIGNOFF = /^(thanks|thank you|best|cheers|regards|kind regards|best regards|sincerely|sent from my)\b/i;
export function leadOf(text = "", most = PROVIDERS.sentence.lead) {
  const own = [];
  for (const line of text.split(/\r?\n/)) {
    if (QUOTED.some((r) => r.test(line)) || (/^From: .+/.test(line) && own.length)) break;
    if (!/^\s*>/.test(line)) own.push(line);
  }
  for (const block of own) {
    const line = block.replace(/\s+/g, " ").trim();
    if (line.length < 3 || GREETING.test(line) || SIGNOFF.test(line) || /^https?:\/\/\S+$/.test(line)) continue;
    const sentence = /^(.{12,}?[.!?])(\s|$)/.exec(line)?.[1] ?? line;
    return sentence.length > most ? `${sentence.slice(0, most - 1).replace(/\s+\S*$/, "")}…` : sentence;
  }
  return "";
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
    const invited = shape.includes("attachment-calendar") ? peopleOfEvent(unfold(raw)) : [];
    const party = invited.length ? invited : [...from, ...to].map((p) => ({ ...p, robot: automated || isRobot(p) }));
    return { source, values: { subject: item.title ?? "", text: item.body ?? "", lead: leadOf(item.body ?? ""), party, shape } };
  }
  if (source === "calendar") {
    const text = unfold(raw);
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
