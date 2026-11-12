// GG-01..GG-03: the Google connection, run in Node against the real guests.
// Google itself is a test double: no network, and every value is synthetic.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { connectGoogle, parseGrant, serviceOf, toICalendar, fromBase64Url, API, SCOPES } from './google.mjs';
import { GUESTS, openGuest } from './guest.mjs';
import { ingestInto, detect } from './ingest.mjs';
import { seal, open, tagOf } from './seal.mjs';

const here = new URL('./', import.meta.url);
const bytesOf = async (path) => new Uint8Array(await readFile(new URL(path, here)));
const call = await openGuest(await bytesOf(GUESTS.call.path), GUESTS.call.sha256);
const link = await openGuest(await bytesOf(GUESTS.link.path), GUESTS.link.sha256);
let checks = 0;
const ok = (cond, message) => { assert.ok(cond, message); checks += 1; };

// A guest whose bytes are not the pinned fingerprint is refused before it compiles.
const tampered = await bytesOf(GUESTS.call.path);
tampered[tampered.length - 1] ^= 1;
await assert.rejects(openGuest(tampered, GUESTS.call.sha256), /guest refused/);
checks += 1;

// GG-01: PrismGoogle, every request, against its seven guarantees.
const product = (...lists) => lists.reduce((acc, list) => acc.flatMap((a) => list.map((b) => [...a, b])), [[]]);
for (const [service, method, scope, token, act, halted] of product(['gmail', 'calendar', 'other'], ['read', 'write'], ['none', 'readonly', 'write'], ['none', 'fresh', 'expired'], ['none', 'owner'], ['no', 'yes'])) {
  const answer = await call(`${service} ${method} ${scope} ${token} ${act} ${halted}`);
  const why = `${service} ${method} ${scope} ${token} ${act} ${halted} -> ${answer}`;
  ok(['fetch', 'consent', 'ask', 'refuse'].includes(answer), why);
  if (halted === 'yes') ok(answer === 'refuse', `INV-001 ${why}`);
  if (service === 'other') ok(answer === 'refuse', `INV-002 ${why}`);
  if (method === 'write' && act === 'none') ok(answer !== 'fetch', `INV-003 ${why}`);
  if (token !== 'fresh') ok(answer !== 'fetch', `INV-004/005 ${why}`);
  if (scope === 'none') ok(answer !== 'fetch', `INV-006 ${why}`);
  if (method === 'write' && scope === 'readonly') ok(answer !== 'fetch', `INV-007 ${why}`);
}
ok((await call('gmail read readonly fresh none no')) === 'fetch', 'a granted read is fetched');
ok((await call('gmail read readonly fresh none')) === 'invalid', 'a short request is invalid');

// GG-02: PrismGoogleLink, every request, against its eight guarantees.
for (const [stage, event, actor, origin, halted] of product(['unprovisioned', 'registered', 'granted', 'syncing', 'revoked'], ['provision', 'consent', 'renew', 'sync', 'forget', 'halt'], ['prism', 'operator', 'owner', 'other'], ['matches', 'differs'], ['no', 'yes'])) {
  const next = await link(`${stage} ${event} ${actor} ${origin} ${halted}`);
  const why = `${stage} ${event} ${actor} ${origin} ${halted} -> ${next}`;
  ok(['unprovisioned', 'registered', 'granted', 'syncing', 'revoked', 'refuse'].includes(next), why);
  if (halted === 'yes') ok(next === 'revoked', `INV-001 ${why}`);
  if (actor !== 'owner' && (stage === 'registered' || stage === 'revoked')) ok(next !== 'granted', `INV-002/003 ${why}`);
  if (actor === 'operator' || actor === 'other') ok(next !== 'syncing', `INV-004/005 ${why}`);
  if (stage === 'unprovisioned') ok(next !== 'granted', `INV-006 ${why}`);
  if (stage === 'revoked' && actor === 'prism') ok(next !== 'syncing', `INV-007 ${why}`);
  if (origin === 'differs') ok(next !== 'syncing' && next !== 'granted', `INV-008/009 ${why}`);
}

// GG-03: the page reads only through both guests, only the two API hosts, only GET.
const ORIGIN = 'https://prism.example';
const platform = { clientId: 'client.example', origins: [ORIGIN] };
// A Luhn-valid number with a card issuer's prefix, made here so no card number is written down.
function syntheticCard() {
  const body = '4' + '0'.repeat(14);
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    let d = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return body + String((10 - (sum % 10)) % 10);
}
const raw = (text) => Buffer.from(text).toString('base64url');
const MESSAGES = {
  m1: 'From: a@example.com\r\nTo: b@example.org\r\nSubject: lunch\r\n\r\nNoon at the usual place.\r\n',
  m2: 'From: c@example.net\r\nSubject: code\r\n\r\nYour verification code is 123456.\r\n',
  m3: `From: d@example.com\r\nSubject: card\r\n\r\nCard ${syntheticCard()} on file.\r\n`,
};
const EVENTS = [{ id: 'e1', iCalUID: 'e1@example.com', summary: 'Standup, daily', start: { dateTime: '2026-11-13T16:00:00Z' }, end: { dateTime: '2026-11-13T16:15:00Z' }, updated: '2026-11-10T00:00:00Z', organizer: { email: 'a@example.com' }, attendees: [{ email: 'b@example.org', responseStatus: 'accepted' }] }];

function fakeGoogle({ unauthorized = false } = {}) {
  const requests = [];
  const respond = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
  const fetch = async (url, init) => {
    requests.push({ url, init });
    if (unauthorized) return respond({}, 401);
    const u = new URL(url);
    if (u.pathname.endsWith('/users/me/messages')) return respond({ messages: Object.keys(MESSAGES).map((id) => ({ id })) });
    const m = u.pathname.match(/\/users\/me\/messages\/(\w+)$/);
    if (m) return respond({ id: m[1], raw: raw(MESSAGES[m[1]]), internalDate: '1762905600000' });
    if (u.pathname.endsWith('/calendars/primary/events')) return respond({ items: EVENTS });
    return respond({}, 404);
  };
  return { fetch, requests };
}
const consents = [];
const authorize = async (scopes, { state }) => {
  consents.push(scopes);
  return `access_token=tok-example&expires_in=3600&token_type=Bearer&scope=${encodeURIComponent(scopes.join(' '))}&state=${state}`;
};
const kept = [];
const vault = { put: async (bytes, meta) => { kept.push({ bytes, meta }); return { outcome: meta.detector === 'none' ? 'store' : 'storehash' }; } };
const setup = (over = {}) => {
  const google = fakeGoogle(over);
  const g = connectGoogle({ decide: call, link, platform, origin: ORIGIN, authorize, ingest: ingestInto({ vault }), fetch: google.fetch, ...over });
  return { g, google };
};

{
  const { g, google } = setup();
  ok((await g.ready).gmail.stage === 'registered', 'the platform client provisions every service');
  await assert.rejects(g.call(new URL('users/me/messages', API.gmail)), (e) => e.code === 'google.consent');
  ok(google.requests.length === 0, 'nothing is fetched before the owner turns a service on');
  await g.grant(['gmail']);
  ok(consents.at(-1).length === 1 && consents.at(-1)[0] === SCOPES.gmail, 'turning on Gmail asks only for read-only Gmail');
  ok(g.status().gmail.stage === 'granted' && g.status().calendar.stage === 'registered', 'only the service turned on is granted');
  await assert.rejects(g.syncCalendar(), (e) => e.code === 'google.link');
  const mail = await g.syncMail({ days: 30, max: 10 });
  ok(mail.store === 1 && mail.storehash === 2, `mail goes through the detectors and the vault: ${JSON.stringify(mail)}`);
  ok(kept.every((k) => k.meta.label === 'confidential' && k.meta.identifier === 'yes'), 'mail is kept confidential, as identifiers that never leave');
  ok(kept.map((k) => k.meta.detector).sort().join() === 'credential,none,pci', 'a code and a card are detected');
  await g.grant(['calendar']);
  const cal = await g.syncCalendar();
  ok(cal.store === 1, 'calendar events are kept');
  const ics = new TextDecoder().decode(kept.at(-1).bytes);
  ok(ics.includes('SUMMARY:Standup\\, daily') && ics.includes('DTSTART:20261113T160000Z') && ics.includes('ATTENDEE;PARTSTAT=ACCEPTED:mailto:b@example.org'), 'an event is kept as iCalendar');
  ok(google.requests.every(({ url, init }) => serviceOf(url) !== 'other' && init.method === 'GET' && init.headers.Authorization === 'Bearer tok-example' && init.credentials === 'omit' && init.cache === 'no-store'), 'only GET to the two API hosts, the token only in the Authorization header');
  ok(google.requests.every(({ url }) => !String(url).includes('tok-example')), 'the token never appears in a URL');
  await assert.rejects(g.call('https://evil.example/collect'), (e) => e.code === 'google.refuse');
  const before = google.requests.length;
  await g.forget();
  ok(g.status().gmail.stage === 'revoked' && g.status().gmail.token === 'none', 'forget revokes and drops the token');
  await assert.rejects(g.syncMail(), (e) => e.code === 'google.link');
  ok(google.requests.length === before, 'nothing is fetched after forget');
  await g.grant(['gmail']);
  ok(g.status().gmail.stage === 'granted', 'only the owner restores a forgotten grant');
}
{
  let stop = 'no';
  const { g, google } = setup({ halted: () => stop });
  await g.grant();
  stop = 'yes';
  await assert.rejects(g.syncMail(), (e) => e.code === 'google.link');
  await assert.rejects(g.call(new URL('users/me/messages', API.gmail)), (e) => e.code === 'google.refuse');
  ok(google.requests.length === 0, 'nothing is fetched while halted');
  await assert.rejects(g.grant(), (e) => e.code === 'google.link');
  ok(g.status().gmail.stage === 'revoked', 'the kill switch revokes');
}
{
  const { g } = setup({ origin: 'https://other.example' });
  await g.ready;
  await assert.rejects(g.grant(), (e) => e.code === 'google.link');
  ok(g.status().gmail.stage === 'unprovisioned', 'a client for another origin is never used');
}
{
  const { g } = setup({ platform: { clientId: '', origins: [ORIGIN] } });
  ok((await g.ready).gmail.stage === 'unprovisioned', 'no platform client, nothing provisioned');
  await assert.rejects(g.grant(), (e) => e.code === 'google.link');
}
{
  const { g } = setup({ unauthorized: true });
  await g.grant(['gmail']);
  await assert.rejects(g.syncMail(), (e) => e.code === 'google.consent');
  ok(g.status().gmail.stage === 'revoked', 'a token Google rejects is forgotten');
}

// The consent answer: parsed, sealed for the page that chose the state, and opened only by it.
const fragment = 'access_token=t&expires_in=10&scope=a%20b&state=s1';
ok(JSON.stringify(parseGrant(fragment)) === JSON.stringify({ state: 's1', token: 't', seconds: 10, scopes: ['a', 'b'] }), 'a grant parses');
ok(parseGrant('error=access_denied&state=s1').error === 'access_denied', 'a refusal parses');
const sealed = await seal('s1', fragment);
ok(sealed.tag === (await tagOf('s1')) && !JSON.stringify([...sealed.sealed]).includes('access_token'), 'the sealed answer carries no token in the clear');
ok((await open('s1', sealed)) === fragment, 'the page that chose the state opens it');
await assert.rejects(open('s2', sealed));
checks += 1;
ok(new TextDecoder().decode(fromBase64Url(raw('héllo'))) === 'héllo', 'base64url decodes');
ok(detect(new TextEncoder().encode('ref 4111111111111112')) === 'none', 'a number that fails Luhn is not a card');
ok(toICalendar({ id: 'x', summary: 'y'.repeat(200), start: { date: '2026-11-13' } }).split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'iCalendar lines fold at 75 octets');

console.log(`google: ${checks} checks passed`);
