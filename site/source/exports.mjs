// A service's own data download, read as the declared `export` route: a
// WhatsApp chat export, a Discord data package, a LinkedIn archive. Each
// message becomes one RFC 822 message and each connection one vCard, so the
// Prism keeps them as it keeps mail and contacts (PrismFolder decides each
// item by that format). Which service a file belongs to is recognized here;
// whether it is read is PrismSource's answer, asked by the caller. Nothing
// here is sent anywhere, and the addresses written are on .invalid, so none
// of them can ever be mailed.

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'someone';
const header = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();
const quoted = (s) => `"${header(s).replace(/["\\]/g, '\\$&')}"`;

async function digest(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(bytes.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

// One message, as mail: who said it, in which conversation, when, and what.
export async function messageOf({ service, from, to, title, at, body }) {
  const when = Number.isNaN(at.getTime()) ? new Date(0) : at;
  const id = await digest(`${service}\n${title}\n${from}\n${when.toISOString()}\n${body}`);
  return [
    `From: ${quoted(from)} <${slug(from)}@${service}.invalid>`,
    `To: ${quoted(to)} <${slug(to)}@${service}.invalid>`,
    `Subject: ${header(title)}`,
    `Date: ${when.toUTCString()}`,
    `Message-ID: <${id}@${service}.invalid>`,
    `X-Prism-Service: ${service}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    String(body).replace(/\r?\n/g, '\r\n'),
    '',
  ].join('\r\n');
}

// RFC 4180 CSV: quoted fields may hold commas, quotes and newlines.
export function csv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted_ = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted_) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') quoted_ = false; else field += c;
    } else if (c === '"') quoted_ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f !== ''));
}

// Rows as records, from the first row that holds every named column.
function records(text, columns) {
  const rows = csv(text.replace(/^\uFEFF/, ''));
  const at = rows.findIndex((r) => columns.every((c) => r.map((f) => f.trim().toUpperCase()).includes(c.toUpperCase())));
  if (at < 0) return [];
  const names = rows[at].map((f) => f.trim().toUpperCase());
  return rows.slice(at + 1).map((r) => Object.fromEntries(names.map((n, i) => [n, (r[i] ?? '').trim()])));
}

// WhatsApp "Export chat": "[d/m/y, h:mm:ss] Name: text" (iPhone) or
// "d/m/y, h:mm - Name: text" (Android); a line without a stamp continues the
// message before it, and a stamped line without "Name:" is WhatsApp's own.
const STAMP = /^\u200e?(?:\[(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?\s?([AaPp]\.?\s?[Mm]\.?)?\]|(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?\s?([AaPp]\.?\s?[Mm]\.?)? [-–]) (.*)$/;

export function whatsappLines(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/[\u202f\u00a0]/g, ' ').split('\n');
  const out = [];
  for (const line of lines) {
    const m = line.match(STAMP);
    if (!m) { if (out.length && line) out[out.length - 1].body += `\n${line}`; continue; }
    const [a, b, c, h, mi, s, ap] = m[1] ? m.slice(1, 8) : m.slice(8, 15);
    const rest = m[15];
    const said = rest.match(/^\u200e?([^:]{1,80}): ([\s\S]*)$/);
    out.push({ parts: [Number(a), Number(b), Number(c)], h: Number(h), mi: Number(mi), s: Number(s ?? 0), ap: ap?.replace(/[.\s]/g, '').toLowerCase() ?? '', from: said ? said[1].replace(/^\u200e/, '').trim() : null, body: said ? said[2] : rest });
  }
  // Day before month wherever any stamp's first part is over 12; else month first.
  const dayFirst = out.some((l) => l.parts[0] > 12 && l.parts[0] < 32);
  return out.filter((l) => l.from).map((l) => {
    let [x, y, z] = l.parts;
    let year; let month; let day;
    if (x > 31) [year, month, day] = [x, y, z];
    else [day, month, year] = dayFirst ? [x, y, z] : [y, x, z];
    if (year < 100) year += 2000;
    let hour = l.h % 12;
    if (l.ap === 'pm') hour += 12;
    else if (l.ap !== 'am') hour = l.h;
    return { from: l.from, at: new Date(Date.UTC(year, month - 1, day, hour, l.mi, l.s)), body: l.body };
  });
}

// Discord's data package: messages/c<channel>/messages.json (or .csv) holds
// the owner's own messages; messages/index.json names the channels.
const DISCORD = /(?:^|\/)messages\/c?(\d+)\/messages\.(json|csv)$/i;
function discordTime(s) {
  let t = String(s ?? '').trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  if (!/(?:Z|[+-]\d\d:\d\d)$/.test(t)) t += 'Z';
  return new Date(t);
}

// LinkedIn's archive: messages.csv and Connections.csv.
const linkedinTime = (s) => new Date(String(s).replace(' UTC', 'Z').replace(' ', 'T'));

// The service each file belongs to, by its declared export: { service, kind }.
export function exportKind(file) {
  const path = file.path ?? file.name;
  const name = file.name.toLowerCase();
  if (/^whatsapp chat.*\.txt$/i.test(file.name) || (name === '_chat.txt')) return { service: 'whatsapp', kind: 'whatsapp-chat' };
  if (DISCORD.test(path) || /(?:^|\/)messages\/index\.json$/i.test(path)) return { service: 'discord', kind: 'discord-package' };
  if (name === 'messages.csv' || name === 'connections.csv') return { service: 'linkedin', kind: 'linkedin-archive' };
  return null;
}

// The files of a pick, a drop or a zip that are a service's own data download,
// as items: { service, format: 'eml' | 'vcf', text }. Files no export claims
// are passed back untouched as `rest`.
export async function exportItems(files) {
  const items = [];
  const rest = [];
  const discord = [];
  let channels = {};
  for (const file of files) {
    const kind = exportKind(file);
    if (!kind) { rest.push(file); continue; }
    if (kind.service === 'whatsapp') {
      const title = (file.name.match(/^WhatsApp Chat (?:with |- )?(.+)\.txt$/i)?.[1] ?? String(file.archive ?? '').replace(/^WhatsApp Chat (?:with |- )?/i, '').replace(/\.zip$/i, '')) || 'WhatsApp';
      for (const line of whatsappLines(await file.text())) items.push({ service: 'whatsapp', format: 'eml', text: await messageOf({ service: 'whatsapp', from: line.from, to: title, title, at: line.at, body: line.body }) });
    } else if (kind.service === 'discord') {
      if (/index\.json$/i.test(file.name)) { try { channels = { ...channels, ...JSON.parse(await file.text()) }; } catch { /* not an index */ } } else discord.push(file);
    } else {
      const text = await file.text();
      if (file.name.toLowerCase() === 'messages.csv') {
        const rows = records(text, ['CONVERSATION ID', 'FROM', 'DATE', 'CONTENT']);
        if (!rows.length) { rest.push(file); continue; }
        for (const r of rows) if (r.CONTENT) items.push({ service: 'linkedin', format: 'eml', text: await messageOf({ service: 'linkedin', from: r.FROM || 'LinkedIn', to: r.TO || r['CONVERSATION TITLE'] || 'LinkedIn', title: r['CONVERSATION TITLE'] || r.SUBJECT || `Conversation with ${r.FROM}`, at: linkedinTime(r.DATE), body: r.CONTENT }) });
      } else {
        const rows = records(text, ['First Name', 'Last Name']);
        if (!rows.length) { rest.push(file); continue; }
        const esc = (s) => String(s).replace(/[\\;,]/g, (c) => `\\${c}`);
        for (const r of rows) {
          const name = `${r['FIRST NAME']} ${r['LAST NAME']}`.trim();
          if (!name) continue;
          items.push({ service: 'linkedin', format: 'vcf', text: ['BEGIN:VCARD', 'VERSION:4.0', `FN:${esc(name)}`, `N:${esc(r['LAST NAME'])};${esc(r['FIRST NAME'])};;;`, ...(r['EMAIL ADDRESS'] ? [`EMAIL:${esc(r['EMAIL ADDRESS'])}`] : []), ...(r.COMPANY ? [`ORG:${esc(r.COMPANY)}`] : []), ...(r.POSITION ? [`TITLE:${esc(r.POSITION)}`] : []), ...(r.URL ? [`URL:${r.URL}`] : []), 'X-PRISM-SERVICE:linkedin', 'END:VCARD', ''].join('\r\n') });
        }
      }
    }
  }
  for (const file of discord) {
    const [, id, type] = (file.path ?? file.name).match(DISCORD) ?? [];
    const title = channels[id] || `Discord channel ${id}`;
    const text = await file.text();
    let rows = [];
    if (type.toLowerCase() === 'json') { try { rows = JSON.parse(text); } catch { rows = []; } } else rows = records(text, ['ID', 'Timestamp', 'Contents']).map((r) => ({ ID: r.ID, Timestamp: r.TIMESTAMP, Contents: r.CONTENTS, Attachments: r.ATTACHMENTS }));
    for (const r of Array.isArray(rows) ? rows : []) {
      const body = [r.Contents, r.Attachments].filter(Boolean).join('\n');
      if (body) items.push({ service: 'discord', format: 'eml', text: await messageOf({ service: 'discord', from: 'Me', to: title, title, at: discordTime(r.Timestamp), body }) });
    }
  }
  return { items, rest };
}
