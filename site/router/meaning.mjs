// The router's meaning reader: what a text means, as a vector from the model
// the router spec names for it (PROVIDERS.meaning.model, all-MiniLM-L6-v2),
// compiled into the Prism. The model's bytes are the pinned ones
// (site/models/models.lock.json), fetched from this page and kept in the
// browser by fingerprint, and run in a worker with the network closed. Whether
// it may be fetched or run is the Prism Models decision, asked through the
// root guest ("model <source> <format> <runtime> <weights> <route> <halted>")
// before every call: nothing moves while the Prism is halted.
//
// The grant is the Prism's own: the router spec compiles the meaning model in,
// so the person never routes it.
//
//   const meaning = meaningReader({ line, halted });
//   const [v] = await meaning.embed(["When is the dentist?"]);   // or null until ready
//   nearness(v, w)   // cosine of two normalized vectors
import { PROVIDERS } from "./table.mjs";

const MODEL = PROVIDERS.meaning?.model;
// What the model reads of a text: its first words, as the model's own window takes them.
const WINDOW = 1000;

export const nearness = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
};

export function meaningReader({ line, halted = () => "no", onProgress } = {}) {
  const cache = new Map();
  let models = null;
  let opening = null;
  const open = () => (opening ??= (async () => {
    if (!MODEL || PROVIDERS.meaning?.kind !== "compiled") return null;
    const [{ openModels }, lock] = await Promise.all([
      import("../models/models.mjs"),
      fetch(new URL("../models/models.lock.json", import.meta.url)).then((r) => r.json()),
    ]);
    const decide = async (request) => ({ outcome: (await line(`model ${request}`)).trim() });
    models = await openModels({ lock, decide, grant: { models: [MODEL] }, halted, onProgress });
    const decision = await models.prepare(MODEL);
    return decision.outcome === "run" ? models : null;
  })().catch((error) => { console.warn(`meaning: ${error?.message ?? error}`); opening = null; return null; }));

  return {
    model: MODEL,
    // Whether the reader can run now (it opens the model on first ask).
    ready: async () => Boolean(await open()),
    // One vector per text, from the cache where the same words were read before; null when the model may not run.
    async embed(texts) {
      const ready = await open();
      if (!ready) return null;
      const keys = texts.map((t) => String(t ?? "").slice(0, WINDOW));
      const missing = [...new Set(keys.filter((k) => !cache.has(k)))];
      for (let i = 0; i < missing.length; i += 32) {
        const batch = missing.slice(i, i + 32);
        const vectors = await ready.embed(MODEL, batch);
        batch.forEach((k, j) => cache.set(k, vectors[j]));
      }
      return keys.map((k) => cache.get(k));
    },
  };
}
