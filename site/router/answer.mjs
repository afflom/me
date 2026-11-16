// What answers the person in the chat. Their words go through the R4 router
// first: a question is answered in sentences from what the Prism holds, under
// the Boundary, with the items it drew on; anything else is offered to keep,
// with the sentence that confirms where it landed. The frames of every
// sentence are the sentence provider's in app/specs/router/spec.json.
//
//   const { sentences, sources, offers, mapped } = await answer(prompt, { items, line, halted });
import { PROVIDERS } from "./table.mjs";
import { route } from "./router.mjs";
import { withoutTime } from "./features.mjs";
import { drawOn, windowOf, termsOf, wordsOf, mentions } from "../coherence/sense.mjs";
import { relativeOf, sequence, spanOf } from "../time/time.mjs";
import { everyOf, rhythms, sourceOf } from "../time/rhythm.mjs";
import { nearness } from "./meaning.mjs";
import * as pin from "../message/guest.mjs";

const S = PROVIDERS.sentence;
const RANK = ["public", "internal", "confidential", "restricted"];
const higher = (a, b) => (RANK.indexOf(b) > RANK.indexOf(a) ? b : a);
const day = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
// Every sentence is a Unicode MessageFormat 2 message of the sentence provider
// (app/specs/router/spec.json), formatted by the message guest (app/src/PrismMessage.lex.tex).
const guest = new URL(pin.GUESTS.message.path, new URL("../message/guest.mjs", import.meta.url));
const format = await pin.openGuestSync(guest.protocol === "file:" ? await (await import("node:fs/promises")).readFile(guest) : new Uint8Array(await (await fetch(guest)).arrayBuffer()), pin.GUESTS.message.sha256);
// A value longer than a sentence can carry is cut; the item it cites holds the rest.
const cut = (value) => { const text = String(value ?? ""); return text.length > S.lead * 2 ? `${text.slice(0, S.lead * 2)}…` : text; };
function fill(key, parts = {}) {
  const [errors, ...text] = format(`format\n${JSON.stringify({ src: S.frames[key], bidiIsolation: "none", params: Object.entries(parts).map(([name, value]) => ({ name, value: cut(value) })) })}`).split("\n");
  if (errors) throw Object.assign(new Error(`the ${key} sentence does not format: ${errors}`), { code: "message.format" });
  return text.join("\n");
}

// "Mon, Nov 16 at 8:00 AM", or the day alone for an all-day item; told from
// a "now", also how far that is from it, in wall-time's own periods: "(in 2 days)".
export function whenOf(at, allDay = false, now = null) {
  if (!at) return "";
  const date = new Date(at);
  const ago = Number.isFinite(now) ? relativeOf(allDay ? new Date(date).setHours(12) : at, allDay ? new Date(now).setHours(12) : now) : "";
  return fill("when", { day: day.format(date), time: allDay ? "" : clock.format(date), ago });
}

// What the browser's clock says now, as the person reads a date and a time.
const full = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });
const asksNow = (text, terms) => S.now.phrases.some((p) => text.toLowerCase().includes(p)) || (terms.length > 0 && terms.every((t) => S.now.words.includes(t)));

const whatOf = (item) => item.title || (item.body ?? "").split("\n")[0] || "";
// A sentence ends once: one that already ends in . ? ! or … keeps its own mark.
const end = (text) => (/[.?!…]$/u.test(text) ? text : `${text}.`);

// One sentence about one item, by what kind of thing it is. Told from a "now"
// and the order of what is held, it says how far the item is from now and,
// for a message, its place in its own conversation, what it asks or tells in
// the sender's first words when they say more than its subject, and how often
// its sender writes (site/time/rhythm.mjs); for an event revised since, that
// this is an earlier version of it.
export function sentenceOf(item, me = null, { now = null, order = null, rhythm = null } = {}) {
  const what = whatOf(item), place = order?.get(item.address), lead = item.labels?.lead ?? "";
  const kind = item.media === "message" || item.media === "contactCard" ? item.media : item.media === "calendar" || item.start != null ? "calendar" : "note";
  const mine = me?.addresses?.some((a) => (item.who ?? "").toLowerCase().includes(a.toLowerCase()));
  const often = kind !== "message" || mine ? null : rhythm?.get(sourceOf(item));
  const said = kind !== "message" ? {} : { turn: place?.of > 1 ? fill("turn", place) : "", after: Number.isFinite(place?.after) ? fill("after", { after: spanOf(place.after) }) : "", lead: lead && lead.toLowerCase() !== what.toLowerCase() ? fill("lead", { lead }) : "", rhythm: often ? fill("rhythm", { every: everyOf(often), per: often.per }) : "" };
  return fill("item", { kind, what, who: (kind === "message" && mine ? me.name : null) ?? item.who, when: whenOf(item.at, item.allDay, now), where: item.where, earlier: place && !place.current ? "yes" : "", ...said });
}

// The confirmation of something kept: where it landed in time.
export function keptSentence(text, mapped) {
  const first = text.trim().split("\n")[0];
  const what = mapped.start != null ? withoutTime(first, mapped.spans) || first : first;
  return fill("kept", { what, when: mapped.start != null ? whenOf(mapped.start, mapped.allDay) : "" });
}

// keep: false treats every prompt as a question (a box that only asks).
// meaning: the router's meaning reader (site/router/meaning.mjs), when it has opened.
export async function answer(prompt, options) {
  const { items = [], me = null, line, halted, now = Date.now(), keep = true, meaning = null } = options;
  const text = (prompt ?? "").trim();
  const none = { sentences: [], sources: [], offers: [], mapped: null };
  if (!text) return none;
  const mapped = await route({ source: "note", values: { text }, line, halted, now, learned: meaning ? { meaning } : {} });
  if (mapped.refused) return { ...none, mapped };
  const held = items.filter((item) => !item.sealed);
  // What to do with the words is the Prism Ask decision's (app/specs/ask/spec.json,
  // PrismAsk in LexLean), asked of the root guest: the page only carries it out.
  const request = [halted(), asksNow(text, termsOf(text)) ? "asked" : "not", keep ? "keeps" : "asks", mapped.intent ?? "fact", mapped.start != null ? "yes" : "no", held.length ? "some" : "none"];
  const decided = (await line(`ask ${request.join(" ")}`)).trim();
  if (decided === "clock") return { sentences: [end(fill("now", { when: full.format(new Date(now)) }))], sources: [], offers: [], mapped };
  if (decided === "keep") return { sentences: [keptSentence(text, mapped)], sources: [], offers: [{ kind: "keep" }], mapped };
  if (decided === "look") {
    const asked = await answer(prompt, { ...options, keep: false });
    return { ...asked, offers: [...asked.offers, { kind: "keep" }] };
  }
  if (decided === "empty") return { sentences: [`${fill("empty")}.`], sources: [], offers: [{ kind: S.offers.empty }], mapped };
  if (decided !== "answer") return { ...none, mapped };
  // The kind of thing it names (mail, calendar, notes), the words it is after,
  // and whether it only greets or asks how things stand.
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const kind = Object.keys(S.kinds).find((k) => words.some((w) => S.kinds[k].includes(w))) ?? null;
  const ofKind = (item) => (kind === "calendar" ? item.media === "calendar" || item.start != null : item.media === kind && item.start == null);
  const terms = termsOf(text).filter((t) => !Object.values(S.kinds).flat().includes(t));
  const greets = terms.every((t) => S.greet.includes(t) || S.overview.includes(t));
  // The words that name what is asked about, without the ones that only ask how things stand.
  const named = terms.filter((t) => !S.overview.includes(t) && !S.greet.includes(t));
  const span = windowOf(text, now);
  // What the ask means, near what each item means (PROVIDERS.meaning), as well as the words they share.
  const near = PROVIDERS.meaning?.near ?? 1;
  const close = (item) => (mapped.meaning && item.meaning ? nearness(mapped.meaning, item.meaning) : 0);
  let used = drawOn(items, text, { now, vector: mapped.meaning, near, facetsOf: meaning?.facets ?? null });
  let lead = [];
  let many = Boolean(span);
  if (kind && !span) {
    // Mail and notes newest first; the calendar from what is next.
    const matched = used.filter(ofKind);
    const latest = held.filter(ofKind).sort((a, b) => (kind === "calendar" ? upcoming(a, b, now) : b.at - a.at));
    used = matched.length && terms.length ? matched : latest;
    many = true;
    if (!used.length) lead = [fill("unmatched", { what: words.find((w) => S.kinds[kind].includes(w)) })];
  }
  if (!used.length) {
    if (!lead.length) lead = greets ? (terms.some((t) => S.greet.includes(t)) || !terms.length ? [fill("help")] : []) : [fill("unmatched", { what: terms.join(" ") || text })];
    used = overview(held, now);
    many = true;
  }
  // What is drawn from content is shown only as the Boundary allows.
  if (used.length) {
    const label = used.reduce((at, item) => higher(at, item.label ?? "confidential"), "confidential");
    const word = (await line(`boundary ${label} none browser none yes ${halted()}`)).trim();
    if (word !== "allow") return { ...none, mapped, refused: true };
  }
  // A span, a kind or an overview answers with several; a name or a topic with
  // everything that names it; otherwise the best match.
  const naming = many ? [] : used.filter((item) => mentions(item, named));
  const told = many ? used.slice(0, S.most) : naming.length > 1 ? naming.slice(0, S.most) : used.slice(0, 1);
  const order = sequence(held);
  const rhythm = rhythms(held);
  const sentences = [...lead.map((s) => `${s}.`), ...told.map((item) => end(sentenceOf(item, me, { now, order, rhythm })))];
  // Everything held that names the asked words is found: the sentences say
  // the few, and the list beneath holds those first, then the rest, newest first.
  // Asked only words the readers pass over (a kind, a weekday, "should"), those words are what is sought.
  const bare = wordsOf(text);
  const sought = named.length ? named : bare.length && bare.every((w) => !S.greet.includes(w) && !S.overview.includes(w)) ? bare : [];
  // What names the asked words comes before what is only near in meaning, then newest first, then by address: an order that does not depend on how the items came in.
  const says = (item) => Number(sought.length > 0 && mentions(item, sought));
  const found = sought.length || mapped.meaning ? held.filter((item) => (!kind || !named.length || ofKind(item)) && ((sought.length && mentions(item, sought)) || close(item) >= near)).sort((a, b) => says(b) - says(a) || (b.at ?? 0) - (a.at ?? 0) || (a.address < b.address ? -1 : 1)) : [];
  const offers = told.flatMap((item) => {
    const k = S.offers[item.media === "message" ? "message" : item.media === "plainText" ? "note" : ""];
    return k ? [{ kind: k, item }] : [];
  });
  const rest = found.filter((item) => !told.includes(item));
  // More found than a list holds: the list is cut after the best, and the reply says how many it left out.
  const cut = Math.max(0, told.length + rest.length - S.find);
  return { sentences: cut ? [...sentences, end(fill("more", { count: cut }))] : sentences, sources: rest.length ? [...told, ...rest].slice(0, S.find) : used.slice(0, S.most), cited: told, cut, offers, mapped };
}

// Events still ahead come first, soonest first; past ones after, latest first.
function upcoming(a, b, now) {
  const at = (item) => item.start ?? item.at ?? 0;
  const ahead = (item) => !item.undated && !item.cancelled && at(item) >= now - 3_600_000;
  if (ahead(a) !== ahead(b)) return ahead(a) ? -1 : 1;
  return ahead(a) ? at(a) - at(b) : at(b) - at(a);
}

// How things stand: the next event, the newest message and the newest note.
export function overview(held, now = Date.now()) {
  const events = held.filter((i) => i.media === "calendar" || i.start != null).sort((a, b) => upcoming(a, b, now));
  const newest = (media) => held.filter((i) => i.media === media && i.start == null).sort((a, b) => b.at - a.at)[0];
  return [events[0], newest("message"), newest("plainText")].filter(Boolean);
}
