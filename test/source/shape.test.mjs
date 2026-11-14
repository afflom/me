// The shape of what arrived carries no value of any item (SH-01 in DV-05).
import test from 'node:test';
import assert from 'node:assert/strict';
import { describe, looksEncoded } from '../../site/source/shape.mjs';

const mail = [
  'Delivered-To: robin@example.org', 'From: =?UTF-8?B?Um9iaW4gRXhhbXBsZQ==?= <robin@example.org>', 'To: sam@example.org',
  'Subject: =?UTF-8?Q?Lunch_on_Thursday=3F?=', 'Date: Thu, 12 Nov 2026 08:00:00 +0000', 'Message-ID: <secret-id-123@example.org>',
  'X-Unusual-Header: secretvalue', 'MIME-Version: 1.0', 'Content-Type: multipart/alternative; boundary="b1"', '',
  '--b1', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: quoted-printable', '', 'Shall we meet at noon=3F', '',
  '--b1', 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', btoa('<div>Shall we meet at noon?</div>'), '', '--b1--', '',
].join('\r\n');
const event = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;TZID=America/Denver:20261112T090000', 'RRULE:FREQ=WEEKLY;BYDAY=TH', 'SUMMARY:Design review with Robin', 'DESCRIPTION:<a href="https://meet.example.org/abc">Join</a>', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');

test('the shape names fields, MIME shapes and sizes, and no value of any item', () => {
  const items = [
    { media: 'message', text: mail, title: 'Lunch on Thursday?', who: 'Robin Example', body: 'Shall we meet at noon?' },
    { media: 'message', text: mail, title: '=?UTF-8?Q?raw?=', who: '', body: '<div>still html</div>' },
    { media: 'calendar', text: event, title: 'Design review with Robin', body: 'Join' },
    { sealed: true },
  ];
  const shape = describe(items);
  const json = JSON.stringify(shape);
  for (const value of ['robin', 'sam@', 'Lunch', 'noon', 'secret', 'Design review', 'meet.example', 'America/Denver', '20261112', 'Thursday', 'Um9i']) assert.ok(!json.toLowerCase().includes(value.toLowerCase()), `no value in the shape: ${value}`);
  assert.equal(shape.items, 4);
  assert.equal(shape.sealed, 1);
  assert.equal(shape.message.shapes['multipart/alternative[text/plain(quoted-printable,utf-8), text/html(base64,utf-8)]'], 2);
  assert.equal(shape.message.fields['x-other'], 2);
  assert.equal(shape.message.fields.subject, 2);
  assert.equal(shape.message.readable.stillEncoded.html, 1);
  assert.equal(shape.message.readable.stillEncoded.encodedWord, 1);
  assert.equal(shape.calendar.repeat.WEEKLY, 1);
  assert.equal(shape.calendar.properties['DTSTART;TZID'], 1);
  assert.ok(!looksEncoded('Shall we meet at noon?').html);
});
