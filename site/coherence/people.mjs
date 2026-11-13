// The people in what is kept: who wrote, who is invited, whose card is
// kept, each once (by address, else by name), with everything that is
// between the person and them. Read from the items' own words only.
import { PEOPLE } from "./coherence.mjs";
export const peoplePlace = PEOPLE.place;

const unfold = (text) => (text ?? "").replace(/\r?\n[ \t]/g, "");
const clean = (name) => name.replace(/^"|"$/g, "").replace(/\\([,;])/g, "$1").trim();

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

// Everyone, most recent first: {key, name, items}. A kept card names its person.
export function peopleOf(items) {
  const byKey = new Map();
  const byName = new Map();
  for (const item of items) {
    for (const party of partiesOf(item)) {
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
