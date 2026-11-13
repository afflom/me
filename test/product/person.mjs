// The synthetic person: a day of mail and calendar on their device, and
// nothing real. The device answers the page the way the person's installed
// Prism extension does (site/device/extension.mjs), so the day arrives with no
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
    { format: "ics", text: calendar(event("review", start, end, "Design review", "Studio", { name: "Robin Example", address: "robin@example.org" })) },
    { format: "ics", text: calendar(event("flight", day(3, 8), day(3, 11), "Flight to Lisbon", "Airport")) },
    { format: "eml", text: mail("Robin Example <robin@example.org>", "Lunch on Thursday?", "Shall we meet at the usual place at noon on Thursday? Let me know.", 0) },
    { format: "eml", text: mail("Sam Example <sam@example.org>", "Time next week", "Could we meet for 30 minutes next week to go over the draft?", 0) },
    { format: "eml", text: mail('"Example Bank" <statements@bank.example.org>', "Your November statement", "Your statement is ready. Payment is due on the 28th.", -1) },
  ];
}

// Installs the person's device on a browser context before any page runs.
export async function device(context) {
  await context.addInitScript((items) => {
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.from !== "page") return;
      const answer = (data) => window.postMessage({ ...data, from: "extension" }, location.origin);
      if (event.data.prism === "hello") answer({ prism: "extension" });
      if (event.data.prism === "pull") answer({ prism: "items", id: event.data.id, items: [true, "yes"].includes(event.data.halted) ? [] : items });
    });
  }, today());
}
