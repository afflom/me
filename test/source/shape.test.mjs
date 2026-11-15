// The shape of what arrived carries no value of any item (SH-01 in DV-05).
// Its content is the oracle corpus (test/oracle/corpus.json): the published
// specifications' own example messages, events and cards, each read by the
// Prism as the person sees it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, looksEncoded, seenGaps } from '../../site/source/shape.mjs';
import { seenMessage } from '../../site/source/exports.mjs';
import { readItem, useReader } from '../../site/card.mjs';
import * as reader from '../../site/read/read.mjs';

useReader(reader);
const { corpus } = JSON.parse(readFileSync('test/oracle/corpus.json', 'utf8'));
const encoder = new TextEncoder();
const MEDIA = { message: 'message', calendar: 'calendar', contact: 'contactCard' };
const kept = corpus.filter((c) => ['message', 'calendar', 'contact'].includes(c.kind));
const items = kept.map((c) => {
  const read = readItem({ address: c.id, outcome: 'restore', bytes: encoder.encode(c.raw), meta: { about: { media: MEDIA[c.kind], domain: 4, at: 0 } } });
  return { media: MEDIA[c.kind], text: c.raw, title: read.title, who: read.who, body: read.body };
});

// Every value of the person's content in an example: who wrote, to whom,
// about what, when, where and the words, at a length anyone would notice.
const CONTENT = /^(from|to|cc|bcc|reply-to|sender|subject|date|message-id|in-reply-to|references|summary|location|description|comment|organizer|attendee|uid|fn|n|email|org|title|note|adr|url|dtstart|dtend)$/i;
function values(raw) {
  const out = new Set();
  const { head, body } = (() => { const at = raw.search(/\r?\n\r?\n/); return at < 0 ? { head: raw, body: '' } : { head: raw.slice(0, at), body: raw.slice(at) }; })();
  const words = (text) => { for (const word of text.split(/[\s;,<>"()=:@/[\]]+/)) if (word.length >= 5 && !/^[\d.+-]+$/.test(word)) out.add(word.toLowerCase()); };
  for (const line of `${head}\n${body}`.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = /^([A-Za-z][A-Za-z0-9-]*)(?:;[^:]*)?:(.*)$/.exec(line);
    if (m && CONTENT.test(m[1])) words(m[2]);
    else if (!m) words(line);
  }
  return out;
}

test('the shape names fields, MIME shapes and sizes, and no value of any example', () => {
  const shape = describe([...items, { sealed: true }]);
  // Each example alone: what its shape took from it, split into parts (header
  // and property names, MIME types, encodings, charsets, FREQ values), holds
  // none of its values. A word that is also one of its field or property
  // names, or a word of its structure (VERSION or "alternative" in a
  // description), is that structure in the shape, not the word.
  kept.forEach((c, i) => {
    const one = describe([items[i]]);
    const taken = [one.message.fields, one.message.shapes, one.calendar.properties, one.calendar.repeat, one.contactCard.properties].flatMap(Object.keys);
    const names = new Set(taken.flatMap((s) => s.toLowerCase().split(/[^a-z0-9-]+/)));
    const own = new Set([...c.raw.replace(/\r?\n[ \t]+/g, ' ').matchAll(/^([A-Za-z][A-Za-z0-9-]*)((?:;[^:\r\n]*)?:.*)$/gm)].flatMap((m) => [m[1].toLowerCase(), ...(CONTENT.test(m[1]) ? [] : m[2].toLowerCase().split(/[^a-z0-9-]+/))]));
    for (const value of values(c.raw)) if (!own.has(value)) assert.ok(!names.has(value), `${c.id}: the value ${value} is in the shape`);
  });
  assert.ok(kept.reduce((n, c) => n + values(c.raw).size, 0) > 500, 'the examples carry values to look for');
  assert.equal(shape.items, items.length + 1);
  assert.equal(shape.sealed, 1);
  for (const kind of ['message', 'calendar', 'contact']) assert.equal(shape.media[MEDIA[kind]], kept.filter((c) => c.kind === kind).length, kind);
});

test('the shape reads MIME trees as the specifications build them', () => {
  const one = (id) => describe([items[kept.findIndex((c) => c.id === id)]]);
  // RFC 6047's examples: a meeting request, quoted-printable; then text and calendar, alternative.
  assert.deepEqual(Object.keys(one('rfc6047-1').message.shapes), ['text/calendar(quoted-printable,utf-8)']);
  assert.match(Object.keys(one('rfc6047-3').message.shapes)[0], /^multipart\/alternative\[text\/plain\(7bit,us-ascii\), text\/calendar\(/);
  // RFC 5322 Appendix A.1.1: no MIME header at all reads as plain text.
  assert.deepEqual(Object.keys(one('rfc5322-1').message.shapes), ['text/plain(7bit)']);
  assert.ok(one('rfc5322-1').message.fields['message-id'] === 1 && one('rfc5322-1').message.fields.subject === 1);
});

test('what the Prism reads of every example no longer looks encoded', () => {
  for (const item of items) {
    const found = Object.entries(looksEncoded(`${item.title}\n${item.who}\n${item.body}`)).filter(([, v]) => v).map(([k]) => k);
    assert.deepEqual(found, [], `${kept[items.indexOf(item)].id} still reads encoded`);
  }
  // And it knows the encoded forms the specifications show.
  for (const c of corpus.filter((x) => x.kind === 'headerText')) assert.ok(looksEncoded(JSON.parse(c.raw).encoded).encodedWord, c.id);
  assert.ok(looksEncoded(corpus.find((c) => c.id === 'rfc6047-1').raw).quotedPrintable === /=\r?\n/.test(corpus.find((c) => c.id === 'rfc6047-1').raw));
});

test('a tab read by its rules says which items lacked who or when, and the shape carries the rules, not the words', async () => {
  // RFC 5322's own example messages, as a service's tab would show them; one shown without who, one without when.
  const shown = items.filter((i) => i.media === 'message' && i.who && i.body).slice(0, 3).map((i, n) => ({ at: n === 2 ? null : '2026-11-14T10:00:00Z', who: n === 1 ? '' : i.who, where: i.title, words: i.body.trim() }));
  assert.equal(shown.length, 3);
  const held = await Promise.all(shown.map((s) => seenMessage('discord', JSON.stringify(s), Date.UTC(2026, 10, 14))));
  const mail = held.map((text) => ({ media: 'message', text }));
  assert.deepEqual(seenGaps(mail), { discord: { items: 3, noWho: 1, noAt: 1 } });
  // Mail that did not come from a tab has no gaps to count.
  assert.deepEqual(seenGaps(items), {});
  const rules = { items: { select: '[role="article"]', words: '[id^="message-content-"]' } };
  const shape = describe(mail, { discord: { seen: rules, open: true, read: 3 }, gmail: { open: true } });
  assert.deepEqual(shape.tabs, { discord: { rules, open: true, read: 3, items: 3, noWho: 1, noAt: 1 } });
  assert.equal(shape.message.fields['x-prism-seen'], 3);
  // A word of the shape's own structure (its keys, the rules) is that structure, not the content.
  const structure = new Set(JSON.stringify([describe([], { discord: { seen: rules } }), shape.message.fields, shape.message.shapes]).split(/\W+/));
  const text = JSON.stringify(shape);
  for (const s of shown) for (const word of `${s.who} ${s.where} ${s.words}`.split(/\W+/)) if (word.length >= 5 && !structure.has(word)) assert.ok(!text.includes(word), `the word ${word} is in the shape`);
});
