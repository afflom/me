// Written by GenBrowser (deviceformats) from deviceFormats in app/src/PrismDevice.lex.tex:
// each file extension a media type's IANA registration states, the format it is
// judged as, the kind of item it holds and the content type an item is kept under.

export const FORMATS = [
  ['mbox', 'mbox', 'message', 'message/rfc822'],
  ['ics', 'ics', 'calendar', 'text/calendar'],
  ['ifb', 'ics', 'calendar', 'text/calendar'],
  ['vcf', 'vcf', 'contactCard', 'text/vcard'],
  ['vcard', 'vcf', 'contactCard', 'text/vcard'],
];
