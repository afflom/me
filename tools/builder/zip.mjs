/**
 * A ZIP archive of text files, stored without compression, so the builder's
 * output downloads as one file in the browser and the example pages offer the
 * same bytes. Every entry carries the same timestamp, so equal files make an
 * equal archive. The format is PKWARE's APPNOTE: local headers, the central
 * directory and its end record, CRC-32 over each file.
 */
const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date and time of an ISO instant (`YYYY-MM-DDThh:mm:ssZ`), the resolution ZIP keeps. */
function dos(instant) {
  const [date, time] = instant.replace('Z', '').split('T');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi, s] = time.split(':').map(Number);
  return { date: ((y - 1980) << 9) | (mo << 5) | d, time: (h << 11) | (mi << 5) | (s >> 1) };
}

/** `files` maps a path to its text. Returns the archive's bytes. */
export function zip(files, instant) {
  const { date, time } = dos(instant);
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const path of Object.keys(files).sort()) {
    const name = encoder.encode(path);
    const data = encoder.encode(files[path]);
    const crc = crc32(data);
    // Version 2.0, flag bit 11 (UTF-8 names), method 0 (stored).
    const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
    const local = Uint8Array.from([...u32(0x04034b50), ...common]);
    chunks.push(local, name, data);
    central.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += local.length + name.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const count = Object.keys(files).length;
  const end = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(count), ...u16(count), ...u32(size), ...u32(offset), ...u16(0)]);
  const out = new Uint8Array(offset + size + end.length);
  let at = 0;
  for (const c of [...chunks, ...central, end]) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
