// Time in the Prism is not one clock stamped onto content. Each thing keeps
// its own order, and wall-time is one of those orders: the browser's clock,
// the Prism's own "now", onto which the others are projected so a person can
// be told where something stands from where they are.
//
// - A conversation orders itself by dependence (RFC 5322 3.6.4): a message
//   comes after every message it replies to or references. The clock only
//   breaks ties between messages that do not depend on each other.
// - An event orders its own revisions (RFC 5545 UID and SEQUENCE): of one
//   UID, the higher SEQUENCE is the later revision, whatever the clock says.
// - Wall-time's own periods (minute, hour, day, week, month, year) say how far
//   something is from now, in the person's words (ECMA-402 RelativeTimeFormat).
//
//   const order = sequence(items);   // Map address -> { turn, of, root } | { revision, of, latest }
//   relativeOf(at, now)              // "yesterday", "in 3 days", "2 hours ago"

// The conversations among the messages held, each in its own order.
export function sequence(items) {
  const out = new Map();
  const messages = items.filter((item) => item.media === "message" && item.id);
  // One message per identifier: copies of one message are one turn.
  const byId = new Map();
  for (const item of messages) if (!byId.has(item.id) || (item.at ?? 0) < (byId.get(item.id).at ?? 0)) byId.set(item.id, item);
  // Messages that name each other are one conversation (a union of what each depends on).
  const parent = new Map([...byId.keys()].map((id) => [id, id]));
  const find = (id) => { while (parent.get(id) !== id) { parent.set(id, parent.get(parent.get(id))); id = parent.get(id); } return id; };
  const deps = (item) => [...new Set([...(item.refs ?? []), ...(item.replyTo ?? [])])].filter((id) => byId.has(id) && id !== item.id);
  for (const item of byId.values()) for (const id of deps(item)) parent.set(find(item.id), find(id));
  const groups = new Map();
  for (const item of byId.values()) {
    const root = find(item.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  }
  for (const group of groups.values()) {
    // Dependence first: a message waits for everything it builds on; among the ready, the earlier by the clock.
    const left = new Set(group);
    const placed = new Set();
    const ordered = [];
    while (left.size) {
      const ready = [...left].filter((item) => deps(item).every((id) => placed.has(id)));
      // A cycle of references cannot be ordered by dependence: the clock orders what remains.
      const pool = ready.length ? ready : [...left];
      const next = pool.sort((a, b) => (a.at ?? 0) - (b.at ?? 0))[0];
      ordered.push(next);
      placed.add(next.id);
      left.delete(next);
    }
    const root = ordered[0].id;
    // A reply's own time: how long after the message it answers it came (its In-Reply-To, as held).
    const after = (item) => {
      const parent = (item.replyTo ?? []).map((id) => byId.get(id)).filter(Boolean).at(-1);
      return parent && Number.isFinite(item.at) && Number.isFinite(parent.at) && item.at >= parent.at ? item.at - parent.at : undefined;
    };
    ordered.forEach((item, i) => out.set(item.id, { turn: i + 1, of: ordered.length, root, ...(after(item) !== undefined ? { after: after(item) } : {}) }));
  }
  for (const item of messages) out.set(item.address, out.get(item.id));
  for (const id of byId.keys()) out.delete(id);
  // Each event's revisions, by its own SEQUENCE.
  const revisions = new Map();
  for (const item of items) {
    if (item.media !== "calendar" || !item.uid) continue;
    if (!revisions.has(item.uid)) revisions.set(item.uid, []);
    revisions.get(item.uid).push(item);
  }
  for (const group of revisions.values()) {
    const steps = [...new Set(group.map((item) => item.sequence ?? 0))].sort((a, b) => a - b);
    for (const item of group) {
      const revision = steps.indexOf(item.sequence ?? 0) + 1;
      // Current: no later revision of the same instance (RFC 5545 RECURRENCE-ID) is held,
      // so an instance revised on its own is not an earlier version of the series.
      const current = !group.some((other) => (other.recurrence ?? "") === (item.recurrence ?? "") && (other.sequence ?? 0) > (item.sequence ?? 0));
      out.set(item.address, { revision, of: steps.length, latest: revision === steps.length, current });
    }
  }
  return out;
}

// A span of time in the largest of wall-time's periods it fills: "6 minutes", "3 days".
export function spanOf(ms, locale = undefined) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  let [unit, size] = PERIODS[0];
  for (const [u, s] of PERIODS) if (ms >= s) [unit, size] = [u, s];
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(Math.trunc(ms / size));
}

// Wall-time's own periods, shortest first, each with how many of the one before it make it.
const PERIODS = [["second", 1000], ["minute", 60_000], ["hour", 3_600_000], ["day", 86_400_000], ["week", 604_800_000], ["month", 2_629_746_000], ["year", 31_556_952_000]];
const startOfDay = (at) => { const d = new Date(at); d.setHours(0, 0, 0, 0); return d.getTime(); };

// How far `at` is from now, in the largest period it spans. Days count by the
// calendar, not by 24-hour runs: last night at 11 is "yesterday" at 8 this morning.
export function relativeOf(at, now = Date.now(), locale = undefined) {
  if (!Number.isFinite(at)) return "";
  const words = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const days = Math.round((startOfDay(at) - startOfDay(now)) / PERIODS[3][1]);
  const gap = at - now;
  if (days === 0) {
    const size = Math.abs(gap);
    const [unit, span] = size < PERIODS[1][1] ? PERIODS[0] : size < PERIODS[2][1] ? PERIODS[1] : PERIODS[2];
    // Under a minute is "now", in the person's language.
    return unit === "second" ? words.format(0, "second") : words.format(Math.trunc(gap / span), unit);
  }
  if (Math.abs(days) < 7) return words.format(days, "day");
  const size = Math.abs(gap);
  const [unit, span] = size < PERIODS[5][1] ? PERIODS[4] : size < PERIODS[6][1] ? PERIODS[5] : PERIODS[6];
  return words.format(Math.trunc(gap / span), unit);
}

// How long a thing stays before the person, from how resolved it is, not from
// a fixed window (UOR-Framework#2, the thermodynamic lifecycle). Each fiber the
// content itself pins lowers the thing's context temperature
// T = free x ln 2 / n, and its weight decays as w = exp(-sum lambda x T x dt)
// over the spans between pins; lambda is set by the registry's half-life, the
// time in which a thing nothing has pinned halves. The fibers are what the
// content shows, never a guess:
//   - "referenced": a later message replies to it or references it;
//   - "corroborated": another source the person keeps names its sender (a
//     contact card, or an event that invites them).
// What the person answers or clears is done, which is not decay.
//
//   const weight = resolver(items, { halfLife, fibers });   weight(item, now) -> 0..1
const DAY_MS = 86_400_000;
const senderOf = (item) => /^From:[^\r\n]*?<?([^\s<>"]+@[^\s<>"]+?)>?\s*$/im.exec(item.text ?? "")?.[1]?.toLowerCase() ?? "";
const addressesOf = (item) => {
  const text = (item.text ?? "").replace(/\r?\n[ \t]/g, "");
  if (item.media === "contactCard") return [...text.matchAll(/^(?:[\w-]+\.)?EMAIL[^:\r\n]*:(.+)$/gim)].map(([, v]) => v.trim().replace(/^mailto:/i, "").toLowerCase());
  if (item.media === "calendar") return [...text.matchAll(/^(?:ORGANIZER|ATTENDEE)[^:\r\n]*:(.+)$/gim)].map(([, v]) => v.trim().replace(/^mailto:/i, "").toLowerCase());
  return [];
};

export function resolver(items, { halfLife, fibers }) {
  const lambda = 1 / (halfLife * DAY_MS);
  const held = items.filter((item) => !item.sealed);
  // When each fiber was first pinned, for each identifier and each address.
  const referenced = new Map();
  for (const item of held) {
    if (item.media !== "message") continue;
    for (const id of new Set([...(item.refs ?? []), ...(item.replyTo ?? [])])) {
      if (id !== item.id && !(referenced.get(id) <= item.at)) referenced.set(id, item.at);
    }
  }
  const corroborated = new Map();
  for (const item of held) {
    for (const address of addressesOf(item)) {
      const at = item.media === "contactCard" ? -Infinity : item.at;
      if (!(corroborated.get(address) <= at)) corroborated.set(address, at);
    }
  }
  const pinned = {
    referenced: (item) => (item.id ? referenced.get(item.id) : undefined),
    corroborated: (item) => corroborated.get(senderOf(item)),
  };
  const n = fibers.length;
  return (item, now = Date.now()) => {
    const born = item.at ?? now;
    // The moments its temperature steps down, in order, from when it came.
    const steps = fibers.map((f) => pinned[f](item)).filter((at) => at !== undefined).map((at) => Math.max(born, at)).sort((a, b) => a - b);
    let exposure = 0;
    let free = n;
    let from = born;
    for (const at of steps) {
      if (at >= now) break;
      exposure += lambda * ((free * Math.LN2) / n) * (at - from);
      free -= 1;
      from = at;
    }
    exposure += lambda * ((free * Math.LN2) / n) * Math.max(0, now - from);
    return Math.exp(-exposure);
  };
}
