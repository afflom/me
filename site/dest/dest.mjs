// Destinations: where one thing the Prism holds may go next. The Prism routes
// its sources in (google, store); this routes it out, to the owner's own view
// and to the places the owner acts in: their calendar, a mail reply, another
// platform. Nothing here decides. Two proved guests do, through the Prism root:
//
//   boundary "<label> <detector> <browser|outbound> <none|owner> <identifier> <halted>"
//            -> allow|hashonly|ask|deny                                (PrismBoundary)
//   dest     "<target> <verdict> <cause> <act> <wording> <tone> <pace> <urgency> <halted>"
//            -> deliver|draft|show|hold|refuse                         (PrismDest)
//
// This module reports facts to them (the tone check, the seal of the words the
// owner saw, whether the item has a cause) and passes their answers on. The
// one hand-off out of the browser is `handoff(`, reached only after PrismDest
// answered deliver, and every hand-off goes through an app the owner already
// uses (their mail client, their calendar, the device's share sheet or a
// file), started by the owner's own press. No host is called from here.

export const TARGETS = ['owner', 'calendar', 'mail', 'platform'];

// The tone check, for the `tone` field. Coercive wording: pressure, false
// urgency or scarcity, guilt, threat. A match keeps words from leaving and
// keeps content from being pushed into the owner's view (it waits, quietly).
// A miss is a known limit; the owner still sees every draft before it leaves.
const COERCIVE = [
  /\b(?:act|reply|respond|decide|pay|buy|sign up|order) (?:now|immediately|today or)\b/i,
  /\b(?:last|final) (?:chance|warning|notice|reminder)\b/i,
  /\b(?:or else|you(?:'| wi)ll regret|before it'?s too late|don'?t miss out)\b/i,
  /\bonly \d+ (?:left|remaining|spots?|seats?)\b/i,
  /\b(?:expires?|ends?) in \d+ (?:minutes?|hours?)\b/i,
  /\b(?:you must|failure to (?:respond|comply|pay))\b/i,
  /\bif you (?:really )?cared\b/i,
];

export function toneOf(text) {
  return COERCIVE.some((pattern) => pattern.test(text)) ? 'coercive' : 'calm';
}

const encoder = new TextEncoder();
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
export async function sealOf(bytes) {
  const data = typeof bytes === 'string' ? encoder.encode(bytes) : bytes;
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
}

// --- What goes out: payloads for each destination, built in the browser. ---

const crlf = (lines) => `${lines.join('\r\n')}\r\n`;
const header = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

// An RFC 5322 reply (or new message): the bytes the owner sees are the bytes
// that leave, as a .eml the owner opens in their mail app, or a mailto: link.
export function buildMail({ to, subject, body, inReplyTo = '', references = '' }) {
  const lines = [`To: ${header(to)}`, `Subject: ${header(subject)}`];
  if (inReplyTo) lines.push(`In-Reply-To: ${header(inReplyTo)}`, `References: ${header(references || inReplyTo)}`);
  lines.push('MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '');
  const text = crlf(lines) + String(body ?? '').replace(/\r?\n/g, '\r\n');
  const query = new URLSearchParams({ subject: header(subject), body: String(body ?? '') });
  if (inReplyTo) query.set('In-Reply-To', header(inReplyTo));
  return {
    bytes: text,
    type: 'message/rfc822',
    name: 'reply.eml',
    href: `mailto:${encodeURIComponent(header(to))}?${query.toString().replace(/\+/g, '%20')}`,
  };
}

// iCalendar text escaping (RFC 5545 3.3.11) and UTC stamps.
const ics = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (date) => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// One VEVENT as an .ics the owner opens in their calendar (METHOD:PUBLISH:
// it adds an entry to the owner's own calendar and invites no one).
export function buildEvent({ uid, start, end, summary, description = '', location = '', now = Date.now() }) {
  if (!(new Date(end) > new Date(start))) throw Object.assign(new Error('an event ends after it starts'), { code: 'dest.event' });
  const text = crlf([
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//afflom//me dest//EN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${ics(uid)}`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${ics(summary)}`, ...(description ? [`DESCRIPTION:${ics(description)}`] : []), ...(location ? [`LOCATION:${ics(location)}`] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ]);
  return { bytes: text, type: 'text/calendar', name: 'event.ics' };
}

// Any other platform: the device's share sheet carries the words to whatever
// app the owner picks; without one, a text file.
export function buildShare({ title = '', text }) {
  return { bytes: String(text ?? ''), type: 'text/plain', name: 'share.txt', share: { title: header(title), text: String(text ?? '') } };
}

export const BUILD = { mail: buildMail, calendar: buildEvent, platform: buildShare };

// --- The router: ask, then pass the answer on. ---

//   makeRouter({ line, halted, pace, handoff })
//   line(text)  asks the Prism root guest ("<facet> <rest>")
//   halted()    'yes' | 'no'      (the kill switch)
//   pace()      'open' | 'quiet'  (the owner's attention right now)
//   handoff(payload, target) hands the payload to an app the owner uses
export function makeRouter({ line, halted = () => 'no', pace = () => 'open', handoff = browserHandoff }) {
  if (typeof line !== 'function') throw new Error('makeRouter needs line (the Prism root guest)');

  // An item: { target, text, label, detector, identifier, cause, urgency, payload }
  // `payload` is the destination's fields (to/subject/... or start/end/...);
  // `text` is the words a person reads. `cause` is grounded only when the item
  // names its source (an address in the vault) or is the owner's own input.
  async function ask(item, { act = 'none', seen = null } = {}) {
    const target = TARGETS.includes(item.target) ? item.target : 'other';
    const outward = target !== 'owner';
    const out = BUILD[target] ? BUILD[target](item.payload ?? {}) : null;
    const words = out ? out.bytes : String(item.text ?? '');
    const seal = await sealOf(words);
    const verdict = await line(`boundary ${item.label ?? 'confidential'} ${item.detector ?? 'none'} ${outward ? 'outbound' : 'browser'} ${act} ${item.identifier ?? 'no'} ${halted()}`);
    const cause = item.source || item.cause === 'owner' ? 'grounded' : 'orphan';
    // Prepare compares the words with themselves; Send compares them with the
    // seal of what the owner saw, and a missing seal counts as changed.
    const wording = (seen ?? (act === 'none' ? seal : null)) === seal ? 'seen' : 'changed';
    const tone = toneOf(String(item.text ?? words));
    const request = `${target} ${verdict} ${cause} ${act} ${wording} ${tone} ${pace()} ${item.urgency === 'urgent' ? 'urgent' : 'normal'} ${halted()}`;
    const answer = verdict === 'allow' || verdict === 'ask' || verdict === 'hashonly' || verdict === 'deny'
      ? await line(`dest ${request}`)
      : 'refuse';
    return { answer, request, seal, out, tone, verdict };
  }

  // Prepare: what the Prism may do on its own. Never delivers (act none).
  async function prepare(item) {
    return ask(item, { act: 'none' });
  }

  // Send: the owner pressed the button for this item, having seen `seen`.
  async function send(item, seen) {
    const decided = await ask(item, { act: 'owner', seen });
    if (decided.answer !== 'deliver') return decided;
    await handoff(decided.out, item.target);
    return { ...decided, delivered: true };
  }

  return { prepare, send };
}

// The browser's hand-offs. Each runs in the owner's press (a user gesture).
export async function browserHandoff(out, target) {
  if (target === 'platform' && navigator.share) {
    await navigator.share(out.share);
    return;
  }
  if (target === 'mail' && out.href && out.href.length < 2000) {
    window.location.href = out.href;
    return;
  }
  const url = URL.createObjectURL(new Blob([out.bytes], { type: out.type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: out.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
