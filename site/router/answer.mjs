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
import { drawOn, windowOf, termsOf, mentions } from "../coherence/sense.mjs";

const S = PROVIDERS.sentence;
const RANK = ["public", "internal", "confidential", "restricted"];
const higher = (a, b) => (RANK.indexOf(b) > RANK.indexOf(a) ? b : a);
const day = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

// "Mon, Nov 16 at 8:00 AM", or the day alone for an all-day item.
export function whenOf(at, allDay = false) {
  if (!at) return "";
  const date = new Date(at);
  return allDay ? day.format(date) : `${day.format(date)}${S.clock}${clock.format(date)}`;
}

const fill = (frame, parts) => frame.replace(/\{(\w+)\}/g, (_, key) => parts[key] ?? "");
const whatOf = (item) => item.title || (item.body ?? "").split("\n")[0] || "";

// One sentence about one item, by what kind of thing it is.
export function sentenceOf(item, me = null) {
  const parts = { what: whatOf(item), who: item.who ?? "", when: whenOf(item.at, item.allDay) };
  if (item.media === "message") {
    const mine = me?.addresses?.some((a) => (item.who ?? "").toLowerCase().includes(a.toLowerCase()));
    return fill(S.frames.message, { ...parts, who: mine ? (me.name ?? parts.who) : parts.who });
  }
  if (item.media === "contactCard") return fill(S.frames.contact, parts);
  if (item.media === "calendar" || item.start != null) return fill(S.frames.event, parts) + (parts.who && item.media === "calendar" ? fill(S.frames.place, parts) : "");
  return fill(S.frames.note, parts);
}

// The confirmation of something kept: where it landed in time.
export function keptSentence(text, mapped) {
  const first = text.trim().split("\n")[0];
  const what = mapped.start != null ? withoutTime(first, mapped.spans) || first : first;
  return mapped.start != null ? fill(S.frames.kept, { what, when: whenOf(mapped.start, mapped.allDay) }) : fill(S.frames.keptUntimed, { what });
}

// keep: false treats every prompt as a question (a box that only asks).
export async function answer(prompt, { items = [], me = null, line, halted, now = Date.now(), keep = true }) {
  const text = (prompt ?? "").trim();
  const none = { sentences: [], sources: [], offers: [], mapped: null };
  if (!text) return none;
  const mapped = await route({ source: "note", values: { text }, line, halted, now });
  if (mapped.refused) return { ...none, mapped };
  if (keep && mapped.intent !== "question") {
    return { sentences: [keptSentence(text, mapped)], sources: [], offers: [{ kind: "keep" }], mapped };
  }
  // A question over an empty Prism says so and leads to connecting.
  const held = items.filter((item) => !item.sealed);
  if (!held.length) return { sentences: [`${S.frames.empty}.`], sources: [], offers: [{ kind: S.offers.empty }], mapped };
  // The kind of thing it names (mail, calendar, notes), the words it is after,
  // and whether it only greets or asks how things stand.
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const kind = Object.keys(S.kinds).find((k) => words.some((w) => S.kinds[k].includes(w))) ?? null;
  const ofKind = (item) => (kind === "calendar" ? item.media === "calendar" || item.start != null : item.media === kind && item.start == null);
  const terms = termsOf(text).filter((t) => !Object.values(S.kinds).flat().includes(t));
  const greets = terms.every((t) => S.greet.includes(t) || S.overview.includes(t));
  const span = windowOf(text, now);
  let used = drawOn(items, text, { now });
  let lead = [];
  let many = Boolean(span);
  if (kind && !span) {
    // Mail and notes newest first; the calendar from what is next.
    const matched = used.filter(ofKind);
    const latest = held.filter(ofKind).sort((a, b) => (kind === "calendar" ? upcoming(a, b, now) : b.at - a.at));
    used = matched.length && terms.length ? matched : latest;
    many = true;
    if (!used.length) lead = [fill(S.frames.unmatched, { what: words.find((w) => S.kinds[kind].includes(w)) })];
  }
  if (!used.length) {
    if (!lead.length) lead = greets ? (terms.some((t) => S.greet.includes(t)) || !terms.length ? [S.frames.help] : []) : [fill(S.frames.unmatched, { what: terms.join(" ") || text })];
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
  const naming = many ? [] : used.filter((item) => mentions(item, terms));
  const told = many ? used.slice(0, S.most) : naming.length > 1 ? naming.slice(0, S.most) : used.slice(0, 1);
  const sentences = [...lead.map((s) => `${s}.`), ...told.map((item) => `${sentenceOf(item, me)}.`)];
  // Everything held that names the asked words is found: the sentences say
  // the few, and the list beneath holds those first, then the rest, newest first.
  const found = terms.length ? held.filter((item) => (!kind || ofKind(item)) && mentions(item, terms)).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)) : [];
  const offers = told.flatMap((item) => {
    const k = S.offers[item.media === "message" ? "message" : item.media === "plainText" ? "note" : ""];
    return k ? [{ kind: k, item }] : [];
  });
  const rest = found.filter((item) => !told.includes(item));
  return { sentences, sources: rest.length ? [...told, ...rest].slice(0, S.find) : used.slice(0, S.most), cited: told, offers, mapped };
}

// Events still ahead come first, soonest first; past ones after, latest first.
function upcoming(a, b, now) {
  const at = (item) => item.start ?? item.at ?? 0;
  const ahead = (item) => at(item) >= now - 3_600_000;
  if (ahead(a) !== ahead(b)) return ahead(a) ? -1 : 1;
  return ahead(a) ? at(a) - at(b) : at(b) - at(a);
}

// How things stand: the next event, the newest message and the newest note.
export function overview(held, now = Date.now()) {
  const events = held.filter((i) => i.media === "calendar" || i.start != null).sort((a, b) => upcoming(a, b, now));
  const newest = (media) => held.filter((i) => i.media === media && i.start == null).sort((a, b) => b.at - a.at)[0];
  return [events[0], newest("message"), newest("plainText")].filter(Boolean);
}
