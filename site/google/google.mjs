// Gmail and Google Calendar, read from the owner's own browser.
//
// This file moves bytes and reports facts; it decides nothing. Before every
// call it asks the proved PrismGoogle guest, through `decide`, with the line
//   "<service> <method> <scope> <token> <act> <halted>"
// and makes the call only when the guest answers `fetch`. What comes back is
// handed to `ingest` as an envelope, a CloudEvents frame and the bytes; the
// Boundary, the router and the vault decide what is kept (see ingest.mjs).
//
// The token comes from Google's OAuth 2.0 token flow for browser apps: a
// popup to accounts.google.com that returns to google/callback.html on this
// origin, which hands the token back over a BroadcastChannel. The token is
// held in memory only, sent only in the Authorization header, and only to
// the two API hosts below. No client secret exists; nothing runs on a server.

import { tagOf, open } from './seal.mjs';

export const API = {
  gmail: 'https://gmail.googleapis.com/gmail/v1/',
  calendar: 'https://www.googleapis.com/calendar/v3/',
};

// Read-only today: every write is refused by the guest for want of a write grant.
export const SCOPES = {
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
  calendar: 'https://www.googleapis.com/auth/calendar.readonly',
};
const WRITE_SCOPES = {
  gmail: ['https://mail.google.com/', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.modify'],
  calendar: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'],
};

export const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
export const CHANNEL = 'prism-google';

// Mail the owner does not need modelled: promotions, social, spam, trash.
export const MAIL_QUERY = '-category:promotions -category:social -in:spam -in:trash';

const encoder = new TextEncoder();
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const randomState = () => hex(crypto.getRandomValues(new Uint8Array(16)));
export const sha256 = async (bytes) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));

const fail = (code, message) => Object.assign(new Error(message ?? code), { code });

// Which service a URL belongs to. Anything not under one of the two API roots is `other`.
export function serviceOf(url) {
  const href = String(url);
  for (const [service, root] of Object.entries(API)) if (href.startsWith(root)) return service;
  return 'other';
}

// The fragment Google returns to callback.html: access_token, expires_in, scope, state, or error.
export function parseGrant(fragment) {
  const p = new URLSearchParams(String(fragment).replace(/^#/, ''));
  if (p.get('error')) return { state: p.get('state'), error: p.get('error') };
  const token = p.get('access_token');
  const seconds = Number(p.get('expires_in'));
  if (!token || !Number.isFinite(seconds) || seconds <= 0) return { state: p.get('state'), error: 'malformed' };
  return { state: p.get('state'), token, seconds, scopes: (p.get('scope') ?? '').split(' ').filter(Boolean) };
}

// The consent popup: resolves with the callback's fragment for this state, or rejects.
// The answer arrives sealed (seal.mjs), so another page on this origin cannot read it.
export function popupAuthorize({ clientId, redirectUri, timeoutMs = 300000 }) {
  return (scopes, { state }) => new Promise((resolve, reject) => {
    const url = new URL(AUTHORIZE);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: scopes.join(' '),
      include_granted_scopes: 'true',
      state,
    }).toString();
    const channel = new BroadcastChannel(CHANNEL);
    const done = (settle, value) => { clearTimeout(timer); channel.close(); settle(value); };
    const timer = setTimeout(() => done(reject, fail('google.consent.timeout', 'Google did not answer')), timeoutMs);
    const tag = tagOf(state);
    channel.onmessage = async ({ data }) => {
      if (data?.tag !== (await tag)) return;
      try {
        done(resolve, await open(state, data));
      } catch {
        done(reject, fail('google.consent.seal', 'the consent answer did not open'));
      }
    };
    const popup = window.open(url.href, 'prism-google', 'popup,width=520,height=640');
    if (!popup) done(reject, fail('google.consent.blocked', 'the browser blocked the consent window'));
  });
}

// connectGoogle: everything the page needs to read the owner's Gmail and Calendar.
//   decide(line)  -> 'fetch' | 'consent' | 'ask' | 'refuse'   (PrismGoogle: one call)
//   link(line)    -> the next stage, or 'refuse'               (PrismGoogleLink: the lifecycle)
//   platform      -> { clientId, origins }                     (platform.json: the shared client)
//   origin        -> this page's origin
//   authorize(scopes, {state}) -> fragment                     (popupAuthorize, or a test double)
//   ingest({envelope, frame, bytes}) -> outcome                (ingest.mjs)
//   halted() -> 'no' | 'yes'                                   (the owner's kill switch)
export function connectGoogle({ decide, link, platform = {}, origin = globalThis.location?.origin ?? '', authorize, ingest, halted = () => 'no', fetch: fetchImpl = globalThis.fetch.bind(globalThis), now = () => Date.now() }) {
  if (typeof decide !== 'function') throw fail('google.decide', 'connectGoogle needs decide (the PrismGoogle guest)');
  if (typeof link !== 'function') throw fail('google.link', 'connectGoogle needs link (the PrismGoogleLink guest)');
  if (typeof authorize !== 'function') throw fail('google.authorize', 'connectGoogle needs authorize');
  // service -> { token, expires, scopes }; memory only, gone when the tab closes.
  const grants = new Map();
  const log = [];
  const originState = (platform.origins ?? []).includes(origin) ? 'matches' : 'differs';
  // service -> stage; every move is the PrismGoogleLink guest's answer.
  const stages = new Map(Object.keys(API).map((s) => [s, 'unprovisioned']));
  async function move(service, event, actor) {
    const next = await link(`${stages.get(service)} ${event} ${actor} ${originState} ${halted()}`);
    log.push({ service, event, actor, next });
    if (next === 'refuse' || next === 'invalid') return null;
    stages.set(service, next);
    if (next === 'revoked' || next === 'unprovisioned' || next === 'registered') grants.delete(service);
    return next;
  }
  // The platform's client is the operator's provisioning: declared once, inherited here.
  const provisioned = Promise.all(Object.keys(API).map((s) => (platform.clientId ? move(s, 'provision', 'operator') : null)));

  const tokenState = (service) => {
    const g = grants.get(service);
    if (!g) return 'none';
    return now() < g.expires ? 'fresh' : 'expired';
  };
  const scopeState = (service) => {
    const g = grants.get(service);
    if (!g) return 'none';
    if (g.scopes.some((s) => WRITE_SCOPES[service].includes(s))) return 'write';
    return g.scopes.includes(SCOPES[service]) ? 'readonly' : 'none';
  };

  // Turn services on: ask Google for the owner's consent to read them. Only on the owner's press.
  async function grant(services = Object.keys(API)) {
    await provisioned;
    const allowed = [];
    for (const service of services) {
      // A service already granted renews its token under the same grant; any other asks for consent.
      const before = stages.get(service);
      const [event, actor] = before === 'granted' || before === 'syncing' ? ['renew', 'prism'] : ['consent', 'owner'];
      const next = await link(`${before} ${event} ${actor} ${originState} ${halted()}`);
      log.push({ service, event, actor, next });
      if (next === 'granted' || next === 'syncing') allowed.push([service, next]);
    }
    if (!allowed.length) throw fail('google.link', 'PrismGoogleLink allows no consent now');
    const state = randomState();
    const answer = parseGrant(await authorize(allowed.map(([s]) => SCOPES[s]), { state }));
    if (answer.state !== state) throw fail('google.consent.state', 'the consent answer is not for this request');
    if (answer.error) throw fail(`google.consent.${answer.error}`, `Google answered ${answer.error}`);
    const expires = now() + answer.seconds * 1000 - 60000;
    for (const [service, next] of allowed) {
      if (answer.scopes.includes(SCOPES[service]) || answer.scopes.some((s) => WRITE_SCOPES[service].includes(s))) {
        stages.set(service, next);
        grants.set(service, { token: answer.token, expires, scopes: answer.scopes });
      }
    }
    return status();
  }

  // Forget: the owner's press, or the page when Google stops accepting the token.
  async function forget(services = Object.keys(API), actor = 'owner') {
    for (const service of services) await move(service, 'forget', actor);
  }

  // The kill switch: every service is revoked at once.
  async function halt() {
    for (const service of Object.keys(API)) await move(service, 'halt', 'owner');
  }

  function status() {
    return Object.fromEntries(Object.keys(API).map((s) => [s, { stage: stages.get(s), token: tokenState(s), scope: scopeState(s) }]));
  }

  // One call: the guest decides, then the page fetches. Never anything but GET today.
  async function call(url, { act = 'none' } = {}) {
    const service = serviceOf(url);
    const method = 'read';
    const line = `${service} ${method} ${service === 'other' ? 'none' : scopeState(service)} ${service === 'other' ? 'none' : tokenState(service)} ${act} ${halted()}`;
    const answer = await decide(line);
    log.push({ service, answer });
    if (answer !== 'fetch') throw fail(`google.${answer}`, `PrismGoogle answered ${answer} for ${service}`);
    const response = await fetchImpl(String(url), {
      method: 'GET',
      headers: { Authorization: `Bearer ${grants.get(service).token}` },
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (response.status === 401) {
      await forget([service], 'prism');
      throw fail('google.consent', 'Google no longer accepts the token');
    }
    if (!response.ok) throw fail('google.http', `HTTP ${response.status} from ${service}`);
    return response;
  }

  async function keep(source, media, contentType, bytes, at) {
    const digest = await sha256(bytes);
    const envelope = { source, media, size: bytes.length, digest };
    const frame = {
      specversion: '1.0',
      id: digest,
      source: `/prism/google/${source}`,
      type: 'foundation.me.v1.content.observed',
      time: new Date(at ?? now()).toISOString(),
      datacontenttype: contentType,
      prismlabel: 'confidential',
    };
    return ingest({ envelope, frame, bytes });
  }

  // Mail: the newest messages that match the query, each as its RFC 5322 bytes.
  async function syncMail({ days = 90, max = 200, query = MAIL_QUERY, onProgress = () => {} } = {}) {
    if ((await move('gmail', 'sync', 'prism')) !== 'syncing') throw fail('google.link', 'PrismGoogleLink does not allow reading mail now');
    const ids = [];
    let page = '';
    while (ids.length < max) {
      const url = new URL('users/me/messages', API.gmail);
      url.searchParams.set('q', `newer_than:${days}d ${query}`.trim());
      url.searchParams.set('maxResults', String(Math.min(100, max - ids.length)));
      if (page) url.searchParams.set('pageToken', page);
      const body = await (await call(url)).json();
      for (const m of body.messages ?? []) ids.push(m.id);
      page = body.nextPageToken ?? '';
      if (!page || !(body.messages ?? []).length) break;
    }
    const tally = tallyOf();
    for (const id of ids) {
      const url = new URL(`users/me/messages/${encodeURIComponent(id)}`, API.gmail);
      url.searchParams.set('format', 'raw');
      const message = await (await call(url)).json();
      const bytes = fromBase64Url(message.raw ?? '');
      count(tally, await keep('gmail', 'message', 'message/rfc822', bytes, Number(message.internalDate) || undefined));
      onProgress({ ...tally, total: ids.length });
    }
    return tally;
  }

  // Calendar: the owner's primary calendar from `back` days ago to `ahead` days on, each event as iCalendar.
  async function syncCalendar({ back = 30, ahead = 90, max = 500, onProgress = () => {} } = {}) {
    if ((await move('calendar', 'sync', 'prism')) !== 'syncing') throw fail('google.link', 'PrismGoogleLink does not allow reading the calendar now');
    const events = [];
    let page = '';
    const start = now();
    while (events.length < max) {
      const url = new URL('calendars/primary/events', API.calendar);
      url.searchParams.set('timeMin', new Date(start - back * 86400000).toISOString());
      url.searchParams.set('timeMax', new Date(start + ahead * 86400000).toISOString());
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('maxResults', String(Math.min(250, max - events.length)));
      if (page) url.searchParams.set('pageToken', page);
      const body = await (await call(url)).json();
      events.push(...(body.items ?? []));
      page = body.nextPageToken ?? '';
      if (!page || !(body.items ?? []).length) break;
    }
    const tally = tallyOf();
    for (const event of events) {
      const bytes = encoder.encode(toICalendar(event));
      count(tally, await keep('calendar', 'calendar', 'text/calendar', bytes, Date.parse(event.updated) || undefined));
      onProgress({ ...tally, total: events.length });
    }
    return tally;
  }

  return { ready: provisioned.then(status), grant, forget, halt, status, call, syncMail, syncCalendar, log };
}

const tallyOf = () => ({ store: 0, storehash: 0, ask: 0, refuse: 0, other: 0 });
function count(tally, outcome) {
  const key = typeof outcome === 'string' ? outcome : outcome?.outcome;
  if (key in tally && key !== 'other') tally[key] += 1;
  else tally.other += 1;
}

export function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// RFC 5545 text for one Google Calendar event, so what is kept does not depend on Google's JSON.
const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsTime = (t) => {
  if (t?.date) return `;VALUE=DATE:${t.date.replace(/-/g, '')}`;
  if (t?.dateTime) return `:${new Date(t.dateTime).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`;
  return null;
};
function fold(line) {
  const out = [];
  let rest = line;
  while (encoder.encode(rest).length > 75) {
    let cut = 75;
    while (encoder.encode(rest.slice(0, cut)).length > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}
export function toICalendar(event) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//prism//google calendar//EN', 'BEGIN:VEVENT'];
  const add = (name, value) => { if (value != null && value !== '') lines.push(fold(`${name}${value}`)); };
  add('UID:', icsText(event.iCalUID ?? event.id ?? ''));
  const stamp = event.updated ? icsTime({ dateTime: event.updated }) : null;
  add('DTSTAMP', stamp);
  add('DTSTART', icsTime(event.start));
  add('DTEND', icsTime(event.end));
  add('SUMMARY:', event.summary != null ? icsText(event.summary) : null);
  add('LOCATION:', event.location != null ? icsText(event.location) : null);
  add('DESCRIPTION:', event.description != null ? icsText(event.description) : null);
  add('STATUS:', event.status ? event.status.toUpperCase() : null);
  if (event.organizer?.email) add('ORGANIZER:', `mailto:${event.organizer.email}`);
  for (const a of event.attendees ?? []) {
    if (!a.email) continue;
    const part = { accepted: 'ACCEPTED', declined: 'DECLINED', tentative: 'TENTATIVE', needsAction: 'NEEDS-ACTION' }[a.responseStatus] ?? 'NEEDS-ACTION';
    add('ATTENDEE', `;PARTSTAT=${part}:mailto:${a.email}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
