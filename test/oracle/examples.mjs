// The specifications' own examples (corpus.json, made by tools/oracle/gen.py
// from pinned RFCs), for every test that needs content: nothing invented.
//   example(id) is the example as published; titleOf(id) its title; expectOf(id)
//   the reference reading; bodyOf(id) a message's body; toOf(id) its first To address.
//   serve() serves the built site (PAGE_SITE) as the page is published: { base, close }.
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

export const { corpus } = JSON.parse(readFileSync(new URL("./corpus.json", import.meta.url), "utf8"));
const find = (id) => corpus.find((e) => e.id === id) ?? (() => { throw new Error(`the corpus has no ${id}`); })();
export const example = (id) => find(id).raw;
export const expectOf = (id) => find(id).expect;
export const titleOf = (id) => String(find(id).expect.title ?? "").trim();
const split = (raw) => { const at = raw.search(/\r?\n\r?\n/); return [raw.slice(0, at), raw.slice(at).replace(/^\r?\n\r?\n/, "")]; };
export const bodyOf = (id) => split(find(id).raw)[1].replace(/\r\n/g, "\n").trim();
export const toOf = (id) => /^To:.*?<?([^\s<>,]+@[^\s<>,]+)>?/m.exec(split(find(id).raw)[0])?.[1] ?? "";

const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
export async function serve(site = resolve(process.env.PAGE_SITE ?? "site")) {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/me\//, "/");
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(join(site, path));
    if (!file.startsWith(site) || !existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { base: `http://127.0.0.1:${server.address().port}/me`, close: () => server.close() };
}
