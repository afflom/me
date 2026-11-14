// The synthetic person: a day of mail and calendar on their device, and
// nothing real. The device answers the page the way the person's installed
// Prism extension does (site/extension/background.js: each item names its declared
// service and route), so the day arrives with no
// gesture, as it does for the person. Every address is at example.org.
const pad = (n) => String(n).padStart(2, "0");
const utc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const day = (days, hour, minute = 0) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); d.setUTCHours(hour, minute, 0, 0); return d; };

export function today(now = new Date()) {
  // The meeting runs from a few minutes from now to the end of today (UTC),
  // so it is ahead of the person whenever the walk runs.
  const start = new Date(Math.min(now.getTime() + 5 * 60000, day(0, 23, 50).getTime()));
  const end = day(0, 23, 59);
  const event = (uid, from, to, summary, location, attendee) => [
    "BEGIN:VEVENT", `UID:${uid}@example.org`, `DTSTAMP:${utc(now)}`, `DTSTART:${utc(from)}`, `DTEND:${utc(to)}`, `SUMMARY:${summary}`, `LOCATION:${location}`,
    ...(attendee ? [`ATTENDEE;CN=${attendee.name}:mailto:${attendee.address}`] : []), "END:VEVENT",
  ].join("\r\n");
  const calendar = (...events) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//example//synthetic person//EN", ...events, "END:VCALENDAR", ""].join("\r\n");
  const mail = (from, subject, body, days) => [
    `From: ${from}`, "To: person@example.org", `Subject: ${subject}`, `Date: ${day(days, 8).toUTCString()}`,
    `Message-ID: <${subject.replace(/\W/g, "").toLowerCase()}@example.org>`, "Content-Type: text/plain; charset=utf-8", "", body, "",
  ].join("\r\n");
  return [
    { service: "calendar", route: "own", kind: "event", format: "ics", text: calendar(event("review", start, end, "Design review", "Studio", { name: "Robin Example", address: "robin@example.org" })) },
    { service: "calendar", route: "own", kind: "event", format: "ics", text: calendar(event("flight", day(3, 8), day(3, 11), "Flight to Lisbon", "Airport")) },
    { service: "gmail", route: "own", kind: "message", format: "eml", text: mail("Robin Example <robin@example.org>", "Lunch on Thursday?", "Shall we meet at the usual place at noon on Thursday? Let me know.", 0) },
    { service: "gmail", route: "own", kind: "message", format: "eml", text: mail("Sam Example <sam@example.org>", "Time next week", "Could we meet for 30 minutes next week to go over the draft?", 0) },
    { service: "gmail", route: "own", kind: "message", format: "eml", text: mail('"Example Bank" <statements@bank.example.org>', "Your November statement", "Your statement is ready. Payment is due on the 28th.", -1) },
    // As Gmail's original reads: MIME parts, an encoded subject, quoted-printable, the history quoted below.
    { service: "gmail", route: "own", kind: "message", format: "eml", text: [
      "From: =?UTF-8?Q?Jordan_Ex=C3=A1mple?= <jordan@example.org>", "To: person@example.org", "Subject: =?UTF-8?Q?Caf=C3=A9_booking?=",
      `Date: ${day(-1, 9).toUTCString()}`, "Message-ID: <cafe@example.org>", "MIME-Version: 1.0", 'Content-Type: multipart/alternative; boundary="b1"', "",
      "--b1", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: quoted-printable", "",
      "The caf=C3=A9 booking is confirmed for Friday.", "", "On Mon, Jordan wrote:", "> Earlier words", "",
      "--b1", 'Content-Type: text/html; charset="UTF-8"', "", "<p>The caf&eacute; booking is confirmed for Friday.</p>", "--b1--", "",
    ].join("\r\n") },
  ];
}

// Installs the person's device on a browser context before any page runs.
export async function device(context) {
  await context.addInitScript((items) => {
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.from !== "page") return;
      const answer = (data) => window.postMessage({ ...data, from: "extension" }, location.origin);
      if (event.data.prism === "hello") answer({ prism: "extension", version: 3 });
      if (event.data.prism === "pull") answer({ prism: "items", id: event.data.id, items: [true, "yes"].includes(event.data.halted) ? [] : items });
    });
  }, today());
}
