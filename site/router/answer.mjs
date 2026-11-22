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
import * as turns from "../turn/guest.mjs";
import * as senses from "../senses/guest.mjs";
import * as reads from "../read/guest.mjs";

const S = PROVIDERS.sentence, RANK = ["public", "internal", "confidential", "restricted"];
const higher = (a, b) => (RANK.indexOf(b) > RANK.indexOf(a) ? b : a);
// Every sentence is a Unicode MessageFormat 2 message of the sentence provider
// (app/specs/router/spec.json), formatted by the message guest (app/src/PrismMessage.lex.tex),
// dates and times too: a part named `at` is an instant, said in the wall time this browser keeps then.
const format = await pin.opened(pin.GUESTS.message);
// A turn is kept as its record (app/src/PrismTurn.lex.tex): what was said as W3C EMMA, and the
// turn as W3C PROV with what the reply drew on and the turn before, and a W3C Web Annotation for each
// thing whose title the reply quotes, placed where it is quoted (in code points), and on the prompt the dimension
// the router read it in as a dialogue act (ISO 24617-2), when it read one; null when a checker refuses it.
const record = await turns.opened(turns.GUEST);
export const recordOf = (prompt, said, now, after = null) => record(["record", `base ${new URL("../", import.meta.url)}`, `now ${now} ${new Date(now).toISOString()}`, ...(after ? [`after ${after}`] : []), `prompt ${JSON.stringify(prompt)}`, `reply ${JSON.stringify(said.sentences.join("\n"))}`, ...(said.mapped?.act ? [`act ${said.mapped.act}`] : []), ...(said.mapped?.identity ? [`identity ${said.mapped.identity}`] : []), ...(said.cited ?? []).map((item, i, all) => ((n, size) => ((at) => `cited ${item.address}${at < 0 ? "" : ` ${size(said.sentences.slice(0, n).map((line) => `${line}\n`).join("") + said.sentences[n].slice(0, at))} ${size(said.sentences.slice(0, n).map((line) => `${line}\n`).join("") + said.sentences[n].slice(0, at) + item.title)}`}`)(item.title ? said.sentences[n]?.indexOf(item.title) ?? -1 : -1))(said.sentences.length - all.length - (said.cut ? 1 : 0) + i, (text) => [...text].length))].join("\n")).replace(/^(refused|invalid)[^]*$/u, "") || null;
// What is under way and what comes next is the senses guest's observation (app/src/PrismSenses.lex.tex,
// SOSA) of the calendar items held that have not ended: the page hands it their times and says what it names.
const sense = await senses.opened(senses.GUEST), second = (at) => `${new Date(at).toISOString().slice(0, 19)}Z`;
async function schedule(items, now) {
  const open = items.filter((item) => item.media === "calendar" && item.end > now).sort((x, y) => x.at - y.at).slice(0, S.held), seen = await sense(["flat", `base ${new URL("../", import.meta.url)}`, `now ${second(now)}`, ...open.map((item) => `held ${second(item.at)} ${second(item.end)} ${item.address}`), ""].join("\n"));
  return [["under", "scheduleNow", "end"], ["next", "scheduleNext", "at"]].map(([frame, name, edge]) => [frame, open.find((item) => item.address === seen.match(new RegExp(`^${name} \\S+ (.+)$`, "m"))?.[1]), edge]).filter(([, item]) => item);
}
// Who is speaking is the senses' observation too: the person as they declared themselves, written as a vCard
// (RFC 6350) by the vcard guest, is observed as that card's address, which the turn's record keeps.
const written = await reads.opened(reads.GUESTS.vcard), whoIs = async (me, now, card = me?.names?.length || me?.addresses?.length ? written(["write", me.names[0] ?? "", ...me.addresses.map((address) => `email ${address}`)].join("\n")) : "") => (card.startsWith("BEGIN") ? (await sense(`flat\nbase ${new URL("../", import.meta.url)}\nnow ${second(now)}\ncard ${new TextEncoder().encode(card).length}\n${card}`)).match(/^identity (sha256:[0-9a-f]{64})$/m)?.[1] ?? null : null);
// A value longer than a sentence can carry is cut; the item it cites holds the rest.
const zone = (at) => { const m = -new Date(at).getTimezoneOffset(), a = Math.abs(m); return `${m < 0 ? "-" : "+"}${String(Math.trunc(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`; }, cut = (value) => { const text = String(value ?? ""); return text.length > S.lead * 2 ? `${text.slice(0, S.lead * 2)}…` : text; };
function fill(key, parts = {}) {
  const [errors, ...text] = format(`format\n${JSON.stringify({ src: S.frames[key], bidiIsolation: "none", params: Object.entries(parts).map(([name, value]) => ({ name, value: cut(value) })), ...(parts.at ? { timeZone: zone(parts.at) } : {}) })}`).split("\n");
  if (errors) throw Object.assign(new Error(`the ${key} sentence does not format: ${errors}`), { code: "message.format" });
  return text.join("\n");
}

// "Mon, Nov 16 at 8:00 AM", or the day alone for an all-day item; told from
// a "now", also how far that is from it, in wall-time's own periods: "(in 2 days)".
export function whenOf(at, allDay = false, now = null) {
  if (!at) return "";
  const ago = Number.isFinite(now) ? relativeOf(allDay ? new Date(at).setHours(12) : at, allDay ? new Date(now).setHours(12) : now) : "";
  return fill("when", { at: new Date(at).toISOString(), allDay: allDay ? "yes" : "", ago });
}

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
  const what = whatOf(item), place = order?.get(item.address), lead = item.labels?.lead ?? "", kind = item.media === "message" || item.media === "contactCard" ? item.media : item.media === "calendar" || item.start != null ? "calendar" : "note", mine = me?.addresses?.some((a) => (item.who ?? "").toLowerCase().includes(a.toLowerCase())), often = kind !== "message" || mine ? null : rhythm?.get(sourceOf(item));
  const said = kind !== "message" ? {} : { turn: place?.of > 1 ? fill("turn", place) : "", after: Number.isFinite(place?.after) ? fill("after", { after: spanOf(place.after) }) : "", lead: lead && lead.toLowerCase() !== what.toLowerCase() ? fill("lead", { lead }) : "", rhythm: often ? fill("rhythm", { every: everyOf(often), per: often.per }) : "" };
  return fill("item", { kind, what, who: (kind === "message" && mine ? me.name : null) ?? item.who, when: whenOf(item.at, item.allDay, now), where: item.where, earlier: place && !place.current ? "yes" : "", ...said });
}

// The confirmation of something kept: where it landed in time.
export function keptSentence(text, mapped) {
  const first = text.trim().split("\n")[0], what = mapped.start != null ? withoutTime(first, mapped.spans) || first : first;
  return fill("kept", { what, when: mapped.start != null ? whenOf(mapped.start, mapped.allDay) : "" });
}

// keep: false treats every prompt as a question (a box that only asks).
// meaning: the router's meaning reader (site/router/meaning.mjs), when it has opened.
// after: when the turn before this one was, if there was one: only then can the words be feedback on it.
export async function answer(prompt, options) {
  const { items = [], me = null, line, halted, now = Date.now(), keep = true, meaning = null, after = null } = options;
  const text = (prompt ?? "").trim(), none = { sentences: [], sources: [], offers: [], mapped: null };
  if (!text) return none;
  const mapped = await route({ source: "note", values: { text }, line, halted, now, learned: meaning ? { meaning } : {} });
  if (mapped.refused) return { ...none, mapped };
  mapped.identity = await whoIs(me, now);
  const held = items.filter((item) => !item.sealed);
  // What to do with the words is the Prism Ask decision's (app/specs/ask/spec.json,
  // PrismAsk in LexLean), asked of the root guest: the page only carries it out.
  const request = [halted(), asksNow(text, termsOf(text)) ? "asked" : "not", keep ? "keeps" : "asks", mapped.intent ?? "fact", mapped.start != null ? "yes" : "no", held.length ? "some" : "none", mapped.act === "socialObligationsManagement" ? "social" : after && mapped.act === "autoFeedback" ? "autofeedback" : "task"], decided = (await line(`ask ${request.join(" ")}`)).trim();
  const stands = (going) => going.map(([frame, item, edge]) => fill(frame, { what: item.title, when: whenOf(item[edge], item.allDay, now) })), going = decided === "clock" ? await schedule(held, now) : [], cited = going.map(([, item]) => item);
  if (decided === "clock") return { sentences: [fill("now", { at: new Date(now).toISOString() }), ...stands(going)].map(end), sources: cited, cited, offers: [], mapped };
  if (decided === "greet" && !held.length) return { sentences: [end(fill("help"))], sources: [], offers: [{ kind: S.offers.empty }], mapped };
  if (decided === "heard") return { sentences: [end(fill("heard"))], sources: [], offers: [], mapped };
  if (decided === "keep") return { sentences: [keptSentence(text, mapped)], sources: [], offers: [{ kind: "keep" }], mapped };
  if (decided === "look") {
    const asked = await answer(prompt, { ...options, keep: false });
    return { ...asked, offers: [...asked.offers, { kind: "keep" }] };
  }
  if (decided === "empty") return { sentences: [`${fill("empty")}.`], sources: [], offers: [{ kind: S.offers.empty }], mapped };
  if (decided !== "answer" && decided !== "greet") return { ...none, mapped };
  // The kind of thing it names (mail, calendar, notes), the words it is after,
  // and whether it only greets or asks how things stand.
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [], kind = Object.keys(S.kinds).find((k) => words.some((w) => S.kinds[k].includes(w))) ?? null, ofKind = (item) => (kind === "calendar" ? item.media === "calendar" || item.start != null : item.media === kind && item.start == null);
  const terms = termsOf(text).filter((t) => !Object.values(S.kinds).flat().includes(t)), greets = decided === "greet" || terms.every((t) => S.greet.includes(t) || S.overview.includes(t));
  // The words that name what is asked about, without the ones that only ask how things stand.
  const named = terms.filter((t) => !S.overview.includes(t) && !S.greet.includes(t)), span = windowOf(text, now);
  // What the ask means, near what each item means (PROVIDERS.meaning), as well as the words they share.
  const near = PROVIDERS.meaning?.near ?? 1, close = (item) => (mapped.meaning && item.meaning ? nearness(mapped.meaning, item.meaning) : 0);
  let used = decided === "greet" ? [] : drawOn(items, text, { now, vector: mapped.meaning, near, facetsOf: meaning?.facets ?? null });
  let lead = [], many = Boolean(span), seen = [];
  if (kind && !span) {
    // Mail and notes newest first; the calendar from what is next.
    const matched = used.filter(ofKind), latest = held.filter(ofKind).sort((a, b) => (kind === "calendar" ? upcoming(a, b, now) : b.at - a.at));
    used = matched.length && terms.length ? matched : latest;
    many = true;
    if (!used.length) lead = [fill("unmatched", { what: words.find((w) => S.kinds[kind].includes(w)) })];
  }
  if (!used.length) {
    if (!lead.length) lead = greets ? (decided === "greet" || terms.some((t) => S.greet.includes(t)) || !terms.length ? [fill("help")] : []) : [fill("unmatched", { what: terms.join(" ") || text })];
    // How things stand opens with the senses' observation: what is under way and what comes next.
    const under = await schedule(held, now);
    lead.push(...stands(under));
    seen = under.map(([, item]) => item);
    used = overview(held, now, seen.length > 0);
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
  const naming = many ? [] : used.filter((item) => mentions(item, named)), told = many ? used.slice(0, S.most) : naming.length > 1 ? naming.slice(0, S.most) : used.slice(0, 1), order = sequence(held), rhythm = rhythms(held);
  const sentences = [...lead.map((s) => `${s}.`), ...told.map((item) => end(sentenceOf(item, me, { now, order, rhythm })))];
  // Everything held that names the asked words is found: the sentences say
  // the few, and the list beneath holds those first, then the rest, newest first.
  // Asked only words the readers pass over (a kind, a weekday, "should"), those words are what is sought.
  const bare = wordsOf(text), sought = named.length ? named : bare.length && bare.every((w) => !S.greet.includes(w) && !S.overview.includes(w)) ? bare : [];
  // What names the asked words comes before what is only near in meaning, then newest first, then by address: an order that does not depend on how the items came in.
  const says = (item) => Number(sought.length > 0 && mentions(item, sought)), found = sought.length || mapped.meaning ? held.filter((item) => (!kind || !named.length || ofKind(item)) && ((sought.length && mentions(item, sought)) || close(item) >= near)).sort((a, b) => says(b) - says(a) || (b.at ?? 0) - (a.at ?? 0) || (a.address < b.address ? -1 : 1)) : [];
  const offers = told.flatMap((item) => {
    const k = S.offers[item.media === "message" ? "message" : item.media === "plainText" ? "note" : ""];
    return k ? [{ kind: k, item }] : [];
  });
  const rest = found.filter((item) => !told.includes(item));
  // More found than a list holds: the list is cut after the best, and the reply says how many it left out.
  const cut = Math.max(0, told.length + rest.length - S.find);
  return { sentences: cut ? [...sentences, end(fill("more", { count: cut }))] : sentences, sources: [...seen, ...(rest.length ? [...told, ...rest].slice(0, S.find) : used.slice(0, S.most))], cited: [...seen, ...told], cut, offers, mapped };
}

// Events still ahead come first, soonest first; past ones after, latest first.
function upcoming(a, b, now) {
  const at = (item) => item.start ?? item.at ?? 0, ahead = (item) => !item.undated && !item.cancelled && at(item) >= now - 3_600_000;
  if (ahead(a) !== ahead(b)) return ahead(a) ? -1 : 1;
  return ahead(a) ? at(a) - at(b) : at(b) - at(a);
}

// How things stand: the next event, unless the senses observed the schedule, the newest message and the newest note.
export function overview(held, now = Date.now(), observed = false) {
  const events = held.filter((i) => i.media === "calendar" || i.start != null).sort((a, b) => upcoming(a, b, now)), newest = (media) => held.filter((i) => i.media === media && i.start == null).sort((a, b) => b.at - a.at)[0];
  return [observed ? null : events[0], newest("message"), newest("plainText")].filter(Boolean);
}

// A turn as the chat shows it: what was asked and what was said, one sentence per item on its own line, the
// items the sentences say as links that open their rows, and the offers. The card hands in what it draws with.
export function shown(prompt, said, { element, rowOf, words, offer, say }) {
  const node = element("div", { className: "pr-turn" }, element("p", { className: "pr-you", textContent: prompt }), element("p", { className: "pr-said", textContent: said.sentences.join("\n") })), rows = said.sources.map(rowOf);
  // The sentences link to the items they say; the list beneath holds all that was found.
  const links = (said.cited ?? said.sources).filter((item) => said.sources.includes(item)).map((item) => {
    const link = element("a", { href: "#", className: "pr-source", textContent: item.title || item.who || "—" });
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const row = rows[said.sources.indexOf(item)];
      if (row.querySelector(".pr-open")?.getAttribute("aria-expanded") === "false") row.querySelector(".pr-open").click();
      row.scrollIntoView({ block: "nearest" });
    });
    return link;
  });
  // One offer per person: a reply to someone who wrote twice is one reply, and it names them.
  const offered = new Set(), offers = (said.offers ?? []).map(({ kind, item }) => {
    const label = { reply: words.reply, done: words.done, keep: words.keep, connect: words.connect }[kind], whom = item?.who || item?.from || "";
    if (!label || offered.has(`${kind}|${whom}`)) return null;
    offered.add(`${kind}|${whom}`);
    const button = element("button", { type: "button", className: "pr-offer", textContent: kind === "reply" && item?.who ? `${label} · ${item.who}` : label });
    button.addEventListener("click", () => { button.disabled = true; offer(kind, item, prompt).catch((error) => say(error?.message ?? String(error), "bad")); });
    return button;
  }).filter(Boolean);
  node.append(...(links.length ? [element("p", { className: "pr-sources" }, ...links)] : []), ...(offers.length ? [element("div", { className: "pr-offers" }, ...offers)] : []));
  return { node, rows };
}
