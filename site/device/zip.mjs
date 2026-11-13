// The entries of a .zip the owner picked or dropped (a Google Takeout export,
// a calendar export), as File-like objects: name, size, lastModified, text(),
// stream(). Read from the central directory, ZIP64 included; stored and
// deflated entries are streamed through the browser's own DecompressionStream,
// so a large mailbox inside is read in pieces. Each entry is then judged by
// PrismFolder like any other file, by its own format.

const u16 = (v, at) => v.getUint16(at, true);
const u32 = (v, at) => v.getUint32(at, true);
const u64 = (v, at) => Number(v.getBigUint64(at, true));
const fail = (code, message) => Object.assign(new Error(message ?? code), { code });

export const isZip = (file) => /\.zip$/i.test(file?.name ?? "");

async function view(file, from, to) {
  return new DataView(await file.slice(from, to).arrayBuffer());
}

export async function zipEntries(file) {
  const tailSize = Math.min(file.size, 65_557 + 20);
  const tail = await view(file, file.size - tailSize, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i -= 1) if (u32(tail, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw fail("zip.eocd", "not a zip file");
  let count = u16(tail, eocd + 10);
  let size = u32(tail, eocd + 12);
  let offset = u32(tail, eocd + 16);
  if (offset === 0xffffffff || count === 0xffff) {
    const locator = eocd - 20;
    if (locator < 0 || u32(tail, locator) !== 0x07064b50) throw fail("zip.zip64", "zip64 locator missing");
    const at = u64(tail, locator + 8);
    const z = await view(file, at, at + 56);
    if (u32(z, 0) !== 0x06064b50) throw fail("zip.zip64", "zip64 directory missing");
    count = u64(z, 32);
    size = u64(z, 40);
    offset = u64(z, 48);
  }
  const dir = await view(file, offset, offset + size);
  const names = new TextDecoder();
  const out = [];
  for (let p = 0, n = 0; n < count && p + 46 <= dir.byteLength; n += 1) {
    if (u32(dir, p) !== 0x02014b50) throw fail("zip.directory", "broken central directory");
    const method = u16(dir, p + 10);
    let packed = u32(dir, p + 20);
    let unpacked = u32(dir, p + 24);
    const nameLength = u16(dir, p + 28);
    const extraLength = u16(dir, p + 30);
    const commentLength = u16(dir, p + 32);
    let local = u32(dir, p + 42);
    const name = names.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLength));
    // ZIP64 extra field: the sizes and offset that did not fit.
    for (let e = p + 46 + nameLength; e + 4 <= p + 46 + nameLength + extraLength;) {
      const id = u16(dir, e);
      const length = u16(dir, e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (unpacked === 0xffffffff) { unpacked = u64(dir, q); q += 8; }
        if (packed === 0xffffffff) { packed = u64(dir, q); q += 8; }
        if (local === 0xffffffff) { local = u64(dir, q); }
      }
      e += 4 + length;
    }
    p += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/") || (method !== 0 && method !== 8)) continue;
    const base = name.split("/").pop();
    const parent = name.split("/").slice(-2, -1)[0] ?? "";
    const entry = { local, packed, method };
    const stream = () => {
      const body = (async () => {
        const head = await view(file, entry.local, entry.local + 30);
        if (u32(head, 0) !== 0x04034b50) throw fail("zip.local", "broken local header");
        const start = entry.local + 30 + u16(head, 26) + u16(head, 28);
        const raw = file.slice(start, start + entry.packed).stream();
        return entry.method === 8 ? raw.pipeThrough(new DecompressionStream("deflate-raw")) : raw;
      })();
      return new ReadableStream({
        async start(controller) {
          const reader = (await body).getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        },
      });
    };
    out.push({
      name: base,
      parent,
      path: name,
      size: unpacked,
      lastModified: file.lastModified,
      stream,
      text: async () => new Response(stream()).text(),
    });
  }
  return out;
}
