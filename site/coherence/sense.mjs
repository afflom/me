// What a kept item is about and what an Ask is after, from the coherence
// registry only: an item's domains are its media's domain and every domain
// whose vocabulary it uses; an Ask's window is its intent words; its answer is
// the kept items that meet it. Nothing here decides whether anything is shown:
// the Boundary does, on the page.
import { VOCABULARY, INTENTS, MEDIA } from "./coherence.mjs";

const DAY = 86_400_000;
const lower = (text = "") => text.toLowerCase();
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATTERNS = VOCABULARY.map((terms) => terms.map((term) => (/^[\p{L}\p{N} :]+$/u.test(term) ? new RegExp(`(?<![\\p{L}\\p{N}])${escape(term)}(?![\\p{L}\\p{N}])`, "u") : { test: (text) => text.includes(term) })));

// How many of a domain's terms a text uses.
const uses = (domain, text) => PATTERNS[domain].reduce((n, pattern) => n + (pattern.test(text) ? 1 : 0), 0);

// The domains an item belongs to: its own, then each domain its title names,
// or its body names twice.
export function domainsOf(item) {
  const own = item.domain ?? MEDIA[item.media] ?? VOCABULARY.length - 1;
  const out = new Set([own]);
  if (item.sealed) return [...out];
  const title = lower(`${item.title ?? ""} ${item.who ?? ""}`);
  const body = lower((item.body ?? item.text ?? "").slice(0, 4000));
  for (let d = 0; d < VOCABULARY.length; d += 1) {
    if (d === own) continue;
    if (uses(d, title) >= 1 || uses(d, body) >= 2) out.add(d);
  }
  return [...out];
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

const QUIET = new Set("the and for are but not you your yours with what whats when where which who whom why how does did have has had was were will would can could should may might this that these those there their them they from into onto about over under just than then also any all some its i'm i've me my mine our ours out off get got need needs want wants anything something tell show find list".split(" "));
export const termsOf = (text) => lower(text).match(/[\p{L}\p{N}]+/gu)?.filter((w) => w.length > 2 && !QUIET.has(w) && !INTENTS[w] && !WEEKDAYS.includes(w)) ?? [];
const meets = (have, term) => have.some((w) => w === term || (term.length > 3 && w.length > 3 && (w.startsWith(term) || term.startsWith(w))));

// The kept items an Ask is after, best first: those in its window, those it
// shares words with, and those in the domains its words name.
export function drawOn(items, prompt, { now = Date.now(), most = 5 } = {}) {
  const asked = [...new Set(termsOf(prompt))];
  const span = windowOf(prompt, now);
  const named = new Set();
  const text = lower(prompt);
  for (let d = 0; d < VOCABULARY.length; d += 1) if (uses(d, text)) named.add(d);
  if (!asked.length && !span && !named.size) return [];
  const scored = [];
  for (const item of items) {
    if (item.sealed) continue;
    const have = termsOf(`${item.title} ${item.who} ${(item.body ?? item.text ?? "").slice(0, 4000)}`);
    let score = 0;
    for (const term of asked) if (meets(have, term)) score += 2;
    const inSpan = span && item.at >= span.from && item.at < span.to;
    if (span && !inSpan && !score) continue;
    if (inSpan) score += 3;
    const domains = item.domains ?? domainsOf(item);
    if (domains.some((d) => named.has(d))) score += 1;
    if (score > (span || asked.length ? 1 : 0)) scored.push({ item, score });
  }
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
