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
import { drawOn, windowOf } from "../coherence/sense.mjs";

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
  // A question: the kept items it is after, shown only as the Boundary allows.
  const used = drawOn(items, text, { now });
  const label = used.reduce((at, item) => higher(at, item.label ?? "confidential"), "confidential");
  const word = (await line(`boundary ${label} none browser none yes ${halted()}`)).trim();
  if (word !== "allow" || !used.length) return { ...none, mapped, refused: word !== "allow" && used.length > 0 };
  // A question about a span answers with what falls in it; otherwise with the best match.
  const told = windowOf(text, now) ? used.slice(0, S.most) : used.slice(0, 1);
  const sentences = told.map((item) => `${sentenceOf(item, me)}.`);
  const offers = told.flatMap((item) => {
    const kind = S.offers[item.media === "message" ? "message" : item.media === "plainText" ? "note" : ""];
    return kind ? [{ kind, item }] : [];
  });
  return { sentences, sources: used.slice(0, S.most), offers, mapped };
}
