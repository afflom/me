// An invented mailbox and calendar in the shape real ones arrive in: MIME
// multipart with base64 and quoted-printable parts, HTML-only newsletters,
// RFC 2047 subjects, reply chains with quoted history, calendar invitations
// carried as text/calendar parts, events with attendees and repeat rules.
// Every name, address and number is made up; addresses use the reserved
// example domains. Each item carries what a person would label it.
const b64 = (text) => Buffer.from(text, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
const qp = (text) => Buffer.from(text, "utf8").toString("latin1")
  .replace(/[=\u0080-\u00ff]/g, (c) => `=${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
const enc = (text) => `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
const ME = "Robin Vale <robin.vale@example.net>";
const DAY = 86_400_000;
const BASE = Date.UTC(2026, 10, 2, 15, 0, 0);
let n = 0;
const date = () => new Date(BASE + (n += 1) * 0.37 * DAY).toUTCString().replace("GMT", "+0000");
const id = () => `<${n}.${(n * 7919) % 10007}@mail.example.com>`;

function mail({ from, to = ME, cc = "", subject, plain = "", html = "", headers = [], calendar = "", reply = false }) {
  const head = [
    `Delivered-To: robin.vale@example.net`,
    `Received: by 2002:a05:6000:1a8c with SMTP id x12csp; ${date()}`,
    `From: ${from}`, `To: ${to}`, cc && `Cc: ${cc}`, `Subject: ${subject}`, `Date: ${date()}`, `Message-ID: ${id()}`,
    reply && `In-Reply-To: <earlier.${n}@mail.example.com>`, reply && `References: <earlier.${n}@mail.example.com>`,
    `MIME-Version: 1.0`, ...headers,
  ].filter(Boolean);
  const parts = [];
  if (plain) parts.push(`Content-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${qp(plain)}`);
  if (html) parts.push(`Content-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(html)}`);
  if (calendar) parts.push(`Content-Type: text/calendar; charset="UTF-8"; method=REQUEST\r\nContent-Transfer-Encoding: 7bit\r\n\r\n${calendar}`);
  const boundary = `000000000000${(n * 104729).toString(16)}`;
  const body = parts.length === 1 && !calendar
    ? parts[0]
    : `Content-Type: multipart/${calendar ? "mixed" : "alternative"}; boundary="${boundary}"\r\n\r\n${parts.map((p) => `--${boundary}\r\n${p}\r\n`).join("")}--${boundary}--\r\n`;
  return `${head.join("\r\n")}\r\n${body}`;
}

const list = (name) => [`List-Unsubscribe: <https://${name}.example.com/u/a8f3c2>, <mailto:unsub@${name}.example.com>`, `List-Id: ${name} <news.${name}.example.com>`, `Precedence: bulk`];
const page = (title, ...paras) => `<!doctype html><html><head><style>.x{color:#333}</style><title>${title}</title></head><body><table><tr><td><h1>${title}</h1>${paras.map((p) => `<p>${p}</p>`).join("")}<p><a href="https://example.com/track/very/long/path/that/goes/on/and/on/forever?utm_source=mail&amp;utm_medium=x">View in browser</a> &middot; Unsubscribe</p></td></tr></table></body></html>`;

function vevent({ summary, start, organizer = "", attendees = [], location = "", rule = "", notes = "" }) {
  const stamp = new Date(start).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return [
    "BEGIN:VCALENDAR", "PRODID:-//Example Calendar//EN", "VERSION:2.0", "METHOD:REQUEST",
    "BEGIN:VTIMEZONE", "TZID:America/Denver", "BEGIN:STANDARD", "DTSTART:19701101T020000", "TZOFFSETFROM:-0600", "TZOFFSETTO:-0700", "END:STANDARD", "END:VTIMEZONE",
    "BEGIN:VEVENT", `DTSTART:${stamp}`, `DTEND:${stamp.replace(/T(\d\d)/, (_, h) => `T${String((+h + 1) % 24).padStart(2, "0")}`)}`, `DTSTAMP:${stamp}`,
    organizer && `ORGANIZER;CN=${organizer.split("<")[0].trim()}:mailto:${/<(.*)>/.exec(organizer)[1]}`,
    ...attendees.map((a) => `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=${a.split("<")[0].trim()};X-NUM-GUESTS=0:mailto:${/<(.*)>/.exec(a)[1]}`),
    `SUMMARY:${summary}`, location && `LOCATION:${location}`, rule && `RRULE:${rule}`,
    notes && `DESCRIPTION:${notes.replace(/\n/g, "\\n").replace(/,/g, "\\,")}`,
    `UID:${n}-${stamp}@calendar.example.com`, "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

const people = {
  mara: "Mara Quill <mara.quill@example.org>",
  theo: "Theo Banks <theo@example.com>",
  joel: `"Joël Arden" <joel.arden@example.org>`,
  priya: "Priya Lund <priya.lund@example.com>",
  sam: "Sam Okafor <sam.okafor@example.net>",
  ines: "Ines Cardo <ines@example.org>",
};

export const corpus = [];
const add = (media, raw, kind, parties = [], extra = {}) => corpus.push({ media, raw, expect: { kind, parties, ...extra } });

// People writing.
add("message", mail({ from: people.mara, subject: "Dinner on Saturday?", plain: "Hi Robin,\n\nAre you free for dinner on Saturday? Theo said he could bring the garden tomatoes.\n\nMara" }), "person", ["Mara Quill"], { lead: "Are you free for dinner on Saturday?" });
add("message", mail({ from: people.theo, cc: people.mara, subject: "Re: Dinner on Saturday?", reply: true, plain: "Count me in. I'll bring the tomatoes and the bread.\n\nOn Mon, Nov 2, 2026 at 9:14 AM Mara Quill <mara.quill@example.org> wrote:\n> Are you free for dinner on Saturday?\n> Theo said he could bring the garden tomatoes." }), "person", ["Theo Banks", "Mara Quill"], { lead: "Count me in. I'll bring the tomatoes and the bread." });
add("message", mail({ from: people.joel, subject: enc("Les photos du week-end — à bientôt"), plain: "Robin, voilà les photos du week-end au lac. Joël", html: "<p>Robin, voilà les photos du week-end au lac.</p><p>Joël</p>" }), "person", ["Joël Arden"], { lead: "Robin, voilà les photos du week-end au lac." });
add("message", mail({ from: people.priya, subject: "Re: flight times for the reunion", reply: true, plain: "I land at 4:10 on Friday, can you pick me up? The reunion starts at 7.\n\n-----Original Message-----\nFrom: Robin Vale\nSent: Sunday\nWhat time is your flight?" }), "person", ["Priya Lund"], { lead: "I land at 4:10 on Friday, can you pick me up?" });
add("message", mail({ from: people.sam, subject: "garden plot paperwork", html: "<div dir=\"ltr\">Hey, the garden plot paperwork is due Thursday. Can you sign it when you're by?<br><br>Sam</div>" }), "person", ["Sam Okafor"]);
add("message", mail({ from: people.ines, subject: "Re: Re: the reunion playlist", reply: true, plain: "Added three songs to the reunion playlist. Priya wants more Motown.\n\nOn Tue, Nov 3, 2026 at 8:02 PM Robin Vale <robin.vale@example.net> wrote:\n> what's on the playlist so far?" }), "person", ["Ines Cardo"], { lead: "Added three songs to the reunion playlist." });
add("message", mail({ from: ME, to: people.mara, subject: "Re: Dinner on Saturday?", reply: true, plain: "Yes! I'll make the soup.\n\nOn Mon, Nov 2, 2026 Mara Quill wrote:\n> Are you free?" }), "person", ["Mara Quill"]);
add("message", mail({ from: people.theo, subject: "Garden plot", plain: "The garden plot by the fence opened up. Sam put our names down." }), "person", ["Theo Banks"], { lead: "The garden plot by the fence opened up." });
add("message", mail({ from: people.mara, subject: "Book club: next pick", plain: "For book club next month I vote for the lighthouse novel. Ines agrees." }), "person", ["Mara Quill"], { lead: "For book club next month I vote for the lighthouse novel." });
add("message", mail({ from: people.priya, subject: "Re: book club", reply: true, plain: "Lighthouse novel is fine by me. Can we do book club at my place?" }), "person", ["Priya Lund"], { lead: "Lighthouse novel is fine by me." });

// Invitations sent through a calendar.
add("message", mail({ from: "Google Calendar <calendar-notification@example.com>", to: ME, subject: "Invitation: Design review @ Wed Nov 18, 2026 10am - 11am (MST) (robin.vale@example.net)", plain: "You have been invited to the following event.\n\nDesign review\nWhen: Wednesday Nov 18, 2026 10am – 11am\nJoining info: Join with Google Meet\nmeet.example.com/abc-defg-hij", calendar: vevent({ summary: "Design review", start: BASE + 16 * DAY, organizer: people.priya, attendees: [ME, people.theo] }) }), "invitation", ["Priya Lund", "Theo Banks"]);
add("message", mail({ from: people.sam, subject: "Garden workday", plain: "Join us for the garden workday.", calendar: vevent({ summary: "Garden workday", start: BASE + 9 * DAY, organizer: people.sam, attendees: [ME, people.mara] }) }), "invitation", ["Sam Okafor", "Mara Quill"]);
add("message", mail({ from: "Ines Cardo (via Calendar) <calendar-notification@example.com>", subject: "Accepted: Reunion planning call @ Thu Nov 12, 2026 6pm - 7pm", plain: "Ines Cardo has accepted this invitation." }), "invitation", ["Ines Cardo"]);
add("message", mail({ from: "Calendar <calendar-notification@example.com>", subject: "Updated invitation: Book club @ Tue Dec 1, 2026 7pm", plain: "This event has been changed." }), "invitation", []);

// Newsletters and other updates.
for (const [name, title, sender] of [
  ["fieldnotes", "The Weekly Fieldnotes: frost dates and seed swaps", "The Fieldnotes Team <hello@fieldnotes.example.com>"],
  ["citylib", "New at the library this month", "City Library <news@citylib.example.org>"],
  ["trailclub", "Trail Club digest: 12 new posts", "Trail Club <digest@trailclub.example.com>"],
  ["pottery", "Introducing glaze night, every Thursday", "Clay House Studio <studio@pottery.example.com>"],
  ["devweekly", "Dev Weekly #311: tracing in the browser", "Dev Weekly <newsletter@devweekly.example.com>"],
  ["outfitter", "Our winter sale: 30% off jackets", "North Outfitter <deals@outfitter.example.com>"],
  ["podcast", "New episode: the history of lighthouses", "Harbor Stories <updates@podcast.example.com>"],
  ["school", "Community school: spring course catalog", "Community School <info@school.example.org>"],
]) add("message", mail({ from: sender, subject: title, html: page(title, "This week we have more for you than ever.", "Read on for the highlights, events and offers."), headers: list(name) }), "update", []);
add("message", mail({ from: "Trail Club <noreply@trailclub.example.com>", subject: "Ines Cardo commented on your post", plain: "Ines Cardo commented: Great photos from the ridge!" }), "update", ["Ines Cardo"]);
add("message", mail({ from: "Photo Share <no-reply@photos.example.com>", subject: "You have 24 new memories", html: page("Your memories", "Look back at this week, three years ago.") }), "update", []);

// Receipts and orders.
for (const [subject, sender, line] of [
  ["Your order #4821-7730 has shipped", "Bookhouse <orders@bookhouse.example.com>", "Your package is on its way. Track your package."],
  ["Receipt from Corner Bakery", "Corner Bakery <receipts@cornerbakery.example.com>", "Thank you for your purchase. Total paid: 14.50."],
  ["Your invoice for November", "Hosting Co <billing@hosting.example.com>", "Invoice INV-2026-11 is attached. Amount due: 12.00."],
  ["Payment received - thank you", "City Utilities <noreply@utilities.example.org>", "We received your payment for the account ending 0042."],
  ["Order confirmation: seed potatoes", "Garden Supply <orders@gardensupply.example.com>", "Thanks for your order! We'll email you when it ships."],
  ["Your refund has been issued", "North Outfitter <support@outfitter.example.com>", "A refund of 48.00 has been issued to your card."],
]) add("message", mail({ from: sender, subject, html: page(subject, line, "Questions? Visit our help center."), headers: ["Auto-Submitted: auto-generated"] }), "receipt", []);
add("message", mail({ from: "Bookhouse <orders@bookhouse.example.com>", subject: "Delivered: 2 items", plain: "Your package was delivered to the front door." }), "receipt", []);

// Travel.
for (const [subject, sender, line] of [
  ["Your flight to Lisbon: check in now", "Atlantic Air <noreply@atlanticair.example.com>", "Check in for flight AT 214, departing Friday. Boarding pass inside."],
  ["Booking confirmation: Harbor Inn, Nov 20-23", "Harbor Inn <reservations@harborinn.example.com>", "Your reservation is confirmed. Check-in from 3 PM."],
  ["Your itinerary for the coast trip", "Rail Line <tickets@railline.example.com>", "Your e-ticket for the train to the coast."],
  ["Gate change for flight AT 214", "Atlantic Air <alerts@atlanticair.example.com>", "Your flight now departs from gate B12."],
  ["Your rental car reservation", "Coast Cars <reservations@coastcars.example.com>", "Pick-up at the airport desk on Friday."],
]) add("message", mail({ from: sender, subject, html: page(subject, line), headers: ["Auto-Submitted: auto-generated"] }), "travel", []);

// Security and account notices.
for (const [subject, sender, line] of [
  ["Security alert: new sign-in on Chrome", "Accounts <no-reply@accounts.example.com>", "We noticed a new sign-in to your account."],
  ["Verify your email address", "Trail Club <noreply@trailclub.example.com>", "Please verify your email address to finish signing up."],
  ["Your password was changed", "Hosting Co <security@hosting.example.com>", "The password for your account was changed."],
  ["Action required: update your billing details", "Hosting Co <billing@hosting.example.com>", "Your card on file expires soon."],
  ["We're updating our terms of service", "Photo Share <no-reply@photos.example.com>", "Our terms of service are changing on Dec 1."],
]) add("message", mail({ from: sender, subject, plain: line, headers: ["Auto-Submitted: auto-generated"] }), "notice", []);

// The calendar itself.
for (const [summary, offset, attendees, rule, location, kind] of [
  ["Dentist", 3, [], "", "Smile Dental, Suite 4", "event"],
  ["Team standup", -20, [people.theo, people.priya], "FREQ=WEEKLY;BYDAY=MO,WE,FR", "", "event"],
  ["Flight to Lisbon AT 214", 11, [], "", "Airport, Terminal 1", "travel"],
  ["Book club", 28, [people.mara, people.priya, people.ines], "FREQ=MONTHLY", "Priya's place", "event"],
  ["Garden workday", 9, [people.sam, people.mara], "", "Community garden", "event"],
  ["Reunion", 13, [people.priya, people.ines, people.joel], "", "Old school hall", "event"],
  ["Pottery class", -5, [], "FREQ=WEEKLY;BYDAY=TH", "Clay House Studio", "event"],
  ["Hotel check-in: Harbor Inn", 18, [], "", "Harbor Inn", "travel"],
]) {
  const names = attendees.map((a) => a.split("<")[0].replace(/"/g, "").trim());
  add("calendar", vevent({ summary, start: BASE + offset * DAY, organizer: attendees[0] ?? "", attendees, rule, location, notes: "-::~:~::~:~:~:~:\nJoin with Google Meet: meet.example.com/xyz" }), kind, names);
}

// The person's own notes.
for (const text of ["Call the dentist Friday at 3", "Buy seed potatoes and twine", "Ask Mara about the book club pick", "Reunion: bring the photo album", "Renew the library card"]) add("plainText", text, "note", text.includes("Mara") ? ["Mara Quill"] : []);
