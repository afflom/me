// What arrived, as structure only: which fields the items carry, their MIME
// shapes, kinds and sizes, and whether what the person reads still looks
// encoded. No value of any item is in it (no names, addresses, subjects,
// times or words), so the person can share it to have the reading fixed
// against the real shape of their content while the content stays here.

const count = (map, key) => { map[key] = (map[key] ?? 0) + 1; };
const bucket = (n) => (n === 0 ? '0' : n < 200 ? '<200' : n < 2000 ? '<2k' : n < 20000 ? '<20k' : '>=20k');
const unfold = (text) => String(text ?? '').replace(/\r?\n[ \t]+/g, ' ');

function headersOf(raw) {
  const text = String(raw ?? '');
  const m = /\r?\n\r?\n/.exec(text);
  const head = unfold(m ? text.slice(0, m.index) : text);
  const out = {};
  for (const line of head.split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at > 0) out[line.slice(0, at).trim().toLowerCase()] ??= line.slice(at + 1).trim();
  }
  return { headers: out, body: m ? text.slice(m.index + m[0].length) : '' };
}

// Only header names a standard or a common mailer defines; any other is "x-other".
const KNOWN = /^(from|to|cc|bcc|reply-to|sender|subject|date|message-id|in-reply-to|references|mime-version|content-type|content-transfer-encoding|content-disposition|content-id|delivered-to|received|return-path|list-id|list-unsubscribe|dkim-signature|arc-.*|authentication-results|x-gm-.*|x-google-.*|x-received|x-prism-service|precedence|auto-submitted|importance|thread-topic|thread-index)$/;
const kind = (value = '') => {
  const [type, ...rest] = value.split(';');
  const charset = /charset="?([\w.-]+)"?/i.exec(rest.join(';'))?.[1]?.toLowerCase();
  return { type: type.trim().toLowerCase() || 'text/plain', charset: charset && /^[a-z0-9.-]{1,20}$/.test(charset) ? charset : undefined, boundary: /boundary="?([^";]+)"?/i.exec(value)?.[1] };
};

function tree(raw, depth = 0) {
  const { headers, body } = headersOf(raw);
  const ct = kind(headers['content-type']);
  const enc = (headers['content-transfer-encoding'] ?? '7bit').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20);
  const disp = (headers['content-disposition'] ?? '').toLowerCase().startsWith('attachment') ? ' attachment' : '';
  const type = /^[a-z]+\/[a-z0-9.+-]+$/.test(ct.type) ? ct.type : 'other';
  if (type.startsWith('multipart/') && ct.boundary && depth < 6) {
    const esc = ct.boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = body.split(new RegExp(`^--${esc}(?:--)?[ \\t]*$`, 'm')).slice(1, -1).map((p) => p.replace(/^\r?\n/, ''));
    return `${type}[${parts.map((p) => tree(p, depth + 1)).join(', ')}]`;
  }
  return `${type}(${enc}${ct.charset ? `,${ct.charset}` : ''})${disp}`;
}

// Whether text the person reads still carries an encoding or markup.
export function looksEncoded(text = '') {
  const s = String(text);
  return {
    encodedWord: /=\?[^?]+\?[bq]\?/i.test(s),
    quotedPrintable: /=[0-9A-F]{2}/.test(s) && /=\r?\n/.test(s),
    base64: /^[A-Za-z0-9+/]{60,}={0,2}$/m.test(s),
    html: /<\/?(html|div|table|p|span|br|td)\b/i.test(s),
    entity: /&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(s),
    mimeBoundary: /^--[-=_A-Za-z0-9.]{8,}$/m.test(s),
  };
}

export function describe(items) {
  const out = { items: items.length, sealed: 0, media: {}, message: { fields: {}, shapes: {}, size: {}, readable: { body: {}, stillEncoded: {} } }, calendar: { properties: {}, repeat: {}, size: {}, readable: { stillEncoded: {} } }, contactCard: { properties: {} }, other: { size: {} } };
  for (const item of items) {
    if (item.sealed) { out.sealed += 1; continue; }
    count(out.media, item.media ?? 'none');
    const text = String(item.text ?? '');
    if (item.media === 'message') {
      const { headers } = headersOf(text);
      for (const name of Object.keys(headers)) count(out.message.fields, KNOWN.test(name) ? name : 'x-other');
      count(out.message.shapes, tree(text));
      count(out.message.size, bucket(text.length));
      count(out.message.readable.body, bucket(String(item.body ?? '').length));
      for (const [k, v] of Object.entries(looksEncoded(`${item.title ?? ''}\n${item.who ?? ''}\n${item.body ?? ''}`))) if (v) count(out.message.readable.stillEncoded, k);
    } else if (item.media === 'calendar') {
      for (const m of unfold(text).matchAll(/^([A-Z][A-Z0-9-]*)((?:;[^:\r\n]*)?):/gm)) {
        const params = [...m[2].matchAll(/;([A-Z-]+)=/g)].map((p) => p[1]).join(',');
        count(out.calendar.properties, params ? `${m[1]};${params}` : m[1]);
      }
      const freq = /^RRULE:.*FREQ=([A-Z]+)/m.exec(unfold(text))?.[1];
      count(out.calendar.repeat, freq ?? 'none');
      count(out.calendar.size, bucket(text.length));
      for (const [k, v] of Object.entries(looksEncoded(`${item.title ?? ''}\n${item.who ?? ''}\n${item.body ?? ''}`))) if (v) count(out.calendar.readable.stillEncoded, k);
    } else if (item.media === 'contactCard') {
      for (const m of unfold(text).matchAll(/^([A-Z][A-Z0-9-]*)(?:;[^:\r\n]*)?:/gm)) count(out.contactCard.properties, m[1]);
    } else count(out.other.size, bucket(text.length));
  }
  return out;
}
