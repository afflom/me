// What a kept item is about and what an Ask is after: an item's domain is its
// media's (the coherence registry), what it is about is its facets of the
// whole person (WHO's ICF, site/person/icf.mjs) by meaning; an Ask's window is
// its intent words; its answer is the kept items that meet it. Nothing here decides whether anything is shown:
// the Boundary does, on the page.
import { INTENTS, MEDIA } from "./coherence.mjs";
import { nearness } from "../router/meaning.mjs";

const DAY = 86_400_000;
// Lower case with accents folded, so "Joel" finds "Joël".
const lower = (text = "") => text.toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");

// The domains an item belongs to: its own, its media's.
export function domainsOf(item) {
  return [item.domain ?? MEDIA[item.media] ?? 0];
}

const startOfDay = (at) => { const d = new Date(at); d.setHours(0, 0, 0, 0); return d.getTime(); };
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// The span an Ask's words name, or null: "today", "tomorrow", "this week", a weekday.
export function windowOf(prompt, now = Date.now()) {
  const words = lower(prompt).match(/[\p{L}]+/gu) ?? [];
  const base = startOfDay(now);
  for (const word of words) {
    const intent = INTENTS[word];
    if (intent) return { from: base + intent.from * DAY, to: base + (intent.from + intent.days) * DAY };
    const weekday = WEEKDAYS.indexOf(word);
    if (weekday >= 0) {
      const ahead = (weekday - new Date(base).getDay() + 7) % 7;
      return { from: base + ahead * DAY, to: base + (ahead + 1) * DAY };
    }
  }
  return null;
}

const QUIET = new Set("the and for are but not you your yours with what whats when where which who whom why how does did have has had was were will would can could should may might this that these those there their them they from into onto about over under just than then also any all some its i'm i've me my mine our ours out off get got need needs want wants anything something tell told show find list say said says from".split(" "));
// Every word of a text, folded, the ones readers pass over included.
export const wordsOf = (text) => lower(text).match(/[\p{L}\p{N}]+/gu)?.filter((w) => w.length > 2) ?? [];
export const termsOf = (text) => lower(text).match(/[\p{L}\p{N}]+/gu)?.filter((w) => w.length > 2 && !QUIET.has(w) && !INTENTS[w] && !WEEKDAYS.includes(w)) ?? [];
const meets = (have, term) => have.some((w) => w === term || (term.length > 3 && w.length > 3 && (w.startsWith(term) || term.startsWith(w))));
// Whether an item names every one of the asked words.
export const mentions = (item, terms) => {
  const have = wordsOf(`${item.title} ${item.who} ${(item.body ?? item.text ?? "").slice(0, 4000)}`);
  return terms.length > 0 && terms.every((term) => meets(have, term));
};

// The kept items an Ask is after, best first: those in its window, those it
// shares words with, and those about the facets of the person it is about.
// With the meaning reader's vectors (the asked words' and each item's, site/router/meaning.mjs),
// an item whose meaning is near the ask's (at least `near`) meets it as a shared word does.
// facetsOf gives the facets (ICF codes) a meaning vector is about.
export function drawOn(items, prompt, { now = Date.now(), most = 5, vector = null, near = 1, facetsOf = null } = {}) {
  const asked = [...new Set(termsOf(prompt))];
  const span = windowOf(prompt, now);
  const named = new Set(vector && facetsOf ? facetsOf(vector) : []);
  if (!asked.length && !span && !named.size && !vector) return [];
  const scored = [];
  for (const item of items) {
    if (item.sealed) continue;
    const have = termsOf(`${item.title} ${item.who} ${(item.body ?? item.text ?? "").slice(0, 4000)}`);
    let score = 0;
    for (const term of asked) if (meets(have, term)) score += 2;
    const close = vector && item.meaning ? nearness(vector, item.meaning) : 0;
    if (close >= near) score += 2 + close;
    const inSpan = span && item.at >= span.from && item.at < span.to;
    if (span && !inSpan && !score) continue;
    // In a span, what happens in it (an event, a timed note) comes before what only arrived in it.
    if (inSpan) score += (item.media === "calendar" && item.component !== "VFREEBUSY") || item.start != null ? 4 : 3;
    if ((item.facets ?? []).some((f) => named.has(f))) score += 1;
    if (score > (span || asked.length ? 1 : 0)) scored.push({ item, score });
  }
  // A span is told in its own order, earliest first.
  const soon = (item) => (span ? Math.abs(item.at - span.from) : -item.at);
  return scored.sort((a, b) => b.score - a.score || soon(a.item) - soon(b.item)).slice(0, most).map((s) => s.item);
}

const dayClock = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const dayOnly = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
export const whenOf = (at, allDay = false) => (at ? (allDay ? dayOnly : dayClock).format(new Date(at)) : "");

// One line per item, in the owner's own words: what, who or where, when.
export function lineOf(item) {
  return [item.title || (item.body ?? "").split("\n")[0], item.who, whenOf(item.at, item.allDay)].filter(Boolean).join(" · ");
}
