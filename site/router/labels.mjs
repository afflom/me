// The person's content labeled by the readers compiled into the Prism. Every
// item is taken apart into its parts (parts.mjs), and the R4 router maps each
// part onto the Prism's features (router.mjs): who it is with, what kind of
// thing it is, what it is about, when, and what it asks of the person.
//
// The readers learn from the content itself before they read it: the people
// it is with become the party reader's own (a name that has written is known
// where it is mentioned), and the words it keeps using become the topic
// reader's lexicon. What is learned stays in this browser, in memory.
//
//   const learned = learn(items);
//   await labelAll(items, { line, halted, learned });  // item.labels = {kind, parties, topics, lead?} | null
import { PROVIDERS } from "./table.mjs";
import { route } from "./router.mjs";
import { partsOf } from "./parts.mjs";
import { topicTerms } from "./features.mjs";

// What the owner's content teaches the readers: its people and its topics.
export function learn(items) {
  const parts = new Map();
  const people = new Map();
  const seen = new Map();
  let n = 0;
  for (const item of items) {
    if (item.sealed) continue;
    const got = partsOf(item);
    parts.set(item, got);
    n += 1;
    for (const p of got.values.party ?? []) {
      if (p.robot || !p.name || p.name.includes("@")) continue;
      const key = p.address || p.name.toLowerCase();
      if (!people.has(key)) people.set(key, { name: p.name, address: p.address });
    }
    // Its title: a subject, an event's summary, or a note's own words.
    for (const w of new Set(topicTerms(got.values.subject || (got.source === "note" ? got.values.text ?? "" : "")))) seen.set(w, (seen.get(w) ?? 0) + 1);
  }
  const t = PROVIDERS.topic;
  const most = Math.max(t.least, Math.floor((n * t.share) / 100));
  // A name is a person, not a topic.
  const names = new Set([...people.values()].flatMap((p) => topicTerms(p.name)));
  // A word the kind reader reads is already said by the item's kind.
  for (const k of PROVIDERS.kind.kinds) for (const w of k.words) for (const x of topicTerms(w)) names.add(x);
  const topics = new Set([...seen].filter(([w, c]) => c >= t.least && c <= most && !names.has(w)).map(([w]) => w));
  return { parts, people: [...people.values()], topics, rarity: seen };
}

// Each item's labels; the router's decisions are pure, so each is asked once.
export async function labelAll(items, { line, halted, now = Date.now(), learned = learn(items), me = null }) {
  const mine = (p) => Boolean(me && ((p.address && me.addresses?.includes(p.address)) || me.names?.some((n) => n.toLowerCase() === p.name?.toLowerCase())));
  const asked = new Map();
  const once = (text) => {
    if (!asked.has(text)) asked.set(text, line(text));
    return asked.get(text);
  };
  const most = PROVIDERS.topic.most;
  for (const item of items) {
    if (item.sealed) { item.labels = null; continue; }
    const { source, values } = learned.parts.get(item) ?? partsOf(item);
    const r = await route({ source, values, line: once, halted, now, learned });
    if (r.refused) { item.labels = null; continue; }
    // The topics it names, its subject's first, then the rarest in what is kept.
    const subject = new Set(topicTerms(values.subject ?? ""));
    const topics = r.topics
      .sort((a, b) => (subject.has(b) - subject.has(a)) || ((learned.rarity.get(a) ?? 0) - (learned.rarity.get(b) ?? 0)))
      .slice(0, most);
    item.labels = { kind: r.kind ?? PROVIDERS.kind.fallback.person, parties: r.parties.filter((p) => !p.robot && !mine(p)).map(({ name, address }) => ({ name, address })), topics, ...(values.lead ? { lead: values.lead } : {}) };
  }
  return items;
}

// A kind's name for the person, from the kind provider.
export const kindName = (key) => PROVIDERS.kind.kinds.find((k) => k.key === key)?.name ?? "";
