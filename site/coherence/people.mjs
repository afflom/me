// The people in what is kept: who wrote, who is invited, whose card is
// kept, each once (by address, else by name), with everything that is
// between the person and them. Read from the items' own words only.
import { PEOPLE } from "./coherence.mjs";
export const peoplePlace = PEOPLE.place;

const unfold = (text) => (text ?? "").replace(/\r?\n[ \t]/g, "");
// RFC 2047 encoded words, so a sender's name reads as written.
const words = (value = "") => value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_, charset, kind, data) => {
  try {
    const bytes = kind.toUpperCase() === "B"
      ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      : Uint8Array.from(data.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))), (c) => c.charCodeAt(0));
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch { return data; }
});
const clean = (name) => words(name).replace(/^"|"$/g, "").replace(/\\([,;])/g, "$1").trim();

function mailbox(value = "") {
  const named = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  if (named) return { name: clean(named[1]) || named[2], address: named[2].toLowerCase() };
  const bare = value.trim().replace(/[<>]/g, "");
  return /@/.test(bare) ? { name: bare, address: bare.toLowerCase() } : bare ? { name: bare, address: "" } : null;
}

// Who an item is with, as [{name, address}].
export function partiesOf(item) {
  if (item.sealed) return [];
  const text = unfold(item.text);
  if (item.media === "message") {
    const head = text.split(/\r?\n\r?\n/, 1)[0];
    const from = /^From:\s*(.*)$/mi.exec(head)?.[1];
    const one = mailbox(from ?? /^To:\s*(.*)$/mi.exec(head)?.[1] ?? "");
    return one ? [one] : [];
  }
  if (item.media === "calendar") {
    const out = [];
    for (const match of text.matchAll(/^(?:ATTENDEE|ORGANIZER)((?:;[^:\r\n]*)?):(.*)$/gmi)) {
      const name = /;CN=("[^"]*"|[^;:]*)/i.exec(match[1])?.[1];
      const address = /^mailto:(.*)$/i.exec(match[2].trim())?.[1]?.toLowerCase() ?? "";
      if (name || address) out.push({ name: clean(name ?? address), address });
    }
    return out;
  }
  if (item.media === "contactCard") {
    const field = (key) => new RegExp(`^${key}(?:;[^:]*)?:(.*)$`, "mi").exec(text)?.[1]?.trim() ?? "";
    const name = clean(field("FN")) || item.title;
    return name ? [{ name, address: field("EMAIL").toLowerCase(), card: true }] : [];
  }
  return [];
}

// Who the person is, read from what arrived when they have not said: the
// address their mail is sent to most, with the name it is sent under.
export function selfOf(items) {
  const counts = new Map();
  for (const item of items) {
    if (item.sealed || item.media !== "message") continue;
    const head = unfold(item.text).split(/\r?\n\r?\n/, 1)[0];
    const seen = new Set();
    for (const field of ["Delivered-To", "To", "Cc"]) {
      const value = new RegExp(`^${field}:\\s*(.*)$`, "mi").exec(head)?.[1] ?? "";
      for (const part of value.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
        const one = mailbox(part);
        if (!one?.address || seen.has(one.address)) continue;
        seen.add(one.address);
        const at = counts.get(one.address) ?? { address: one.address, name: "", count: 0 };
        at.count += 1;
        if (one.name && one.name !== one.address) at.name ||= one.name;
        counts.set(one.address, at);
      }
    }
  }
  const top = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  return top ? { names: top.name ? [top.name] : [], addresses: [top.address] } : { names: [], addresses: [] };
}

// Whether a party is the person themself.
export const isMe = (party, me) => Boolean(me && party && ((party.address && me.addresses?.includes(party.address)) || me.names?.some((n) => n.toLowerCase() === party.name?.toLowerCase())));
// Whether the person sent this item.
export const fromMe = (item, me) => item.media === "message" && partiesOf(item).some((p) => isMe(p, me));

// Everyone else, most recent first: {key, name, items}. A kept card names its person.
export function peopleOf(items, me = null) {
  const byKey = new Map();
  const byName = new Map();
  for (const item of items) {
    for (const party of partiesOf(item)) {
      if (isMe(party, me)) continue;
      const key = party.address || party.name.toLowerCase();
      let one = byKey.get(key) ?? byName.get(party.name.toLowerCase());
      if (!one) {
        one = { key, name: party.name, items: [], latest: 0, card: false };
        byKey.set(key, one);
      }
      byName.set(party.name.toLowerCase(), one);
      if (party.card || (!one.card && one.name.includes("@") && !party.name.includes("@"))) one.name = party.name;
      one.card ||= Boolean(party.card);
      if (!one.items.includes(item)) one.items.push(item);
      if (item.media !== "contactCard") one.latest = Math.max(one.latest, item.at);
    }
  }
  return [...new Set(byKey.values())].sort((a, b) => b.latest - a.latest || a.name.localeCompare(b.name));
}

// What is open between the person and one of their people: the meetings
// ahead, soonest first, then everything else, newest first.
export function between(one, now = Date.now()) {
  const ahead = one.items.filter((item) => item.media === "calendar" && item.at + 3_600_000 > now).sort((a, b) => a.at - b.at);
  const rest = one.items.filter((item) => !ahead.includes(item) && item.media !== "contactCard").sort((a, b) => b.at - a.at);
  return [...ahead, ...rest];
}
