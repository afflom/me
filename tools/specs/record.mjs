// Reads a model record that is kept as parts, so parallel changes never
// collide: the JavaScript twin of tools/specs/record.py (same rules).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const natural = (a, b) => a.localeCompare(b, "en", { numeric: true });

export function load(path) {
  const record = JSON.parse(readFileSync(path, "utf8"));
  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== "object" || Array.isArray(value) || !("parts" in value)) continue;
    if (Object.keys(value).some((k) => !["parts", "as"].includes(k))) continue;
    const folder = join(dirname(path), value.parts);
    const names = readdirSync(folder).filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)).sort(natural);
    const read = (name) => JSON.parse(readFileSync(join(folder, `${name}.json`), "utf8"));
    if (value.as === "map") record[key] = Object.fromEntries(names.map((n) => [n, read(n)]));
    else record[key] = names.map((n) => {
      const entry = read(n);
      if (entry.key !== n) throw new Error(`${folder}/${n}.json names key ${JSON.stringify(entry.key)}; a part's key is its file name`);
      return entry;
    });
  }
  return record;
}
