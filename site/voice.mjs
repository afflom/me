// The Prism's voice: how it answers a gesture in tone and colour, after
// verdant resonance's soundscape without its garden. Every number is
// PrismSurface's (VOICE in surface.mjs): 5-limit just ratios over one base,
// five partials, a ceiling far under the owner's own sounds, a rest between
// answers. Loaded on the owner's first gesture, so a visit that only looks
// fetches none of it and no sound can come before the owner acts.
import { VOICE, WORDS } from "./surface/surface.mjs";

const PACE_KEY = "me.pace";
const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const answers = new Map(VOICE.answers.map((a) => [a.key, a]));
const still = matchMedia("(prefers-reduced-motion: reduce)");

let context = null;
let master = null;
let last = 0;

function open() {
  if (context) return context;
  const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Audio) return null;
  context = new Audio();
  // A limiter after the master: nothing the voice plays can clip.
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master = context.createGain();
  master.gain.value = VOICE.ceiling / 100;
  master.connect(limiter).connect(context.destination);
  return context;
}

function sound(answer, salience) {
  if (!answer.degrees.length || !answer.level) return;
  const audio = open();
  if (!audio) return;
  if (audio.state === "suspended") audio.resume().catch(() => {});
  const begin = audio.currentTime + 0.01;
  const attack = VOICE.attack / 1000;
  const release = VOICE.release / 1000;
  const share = (answer.level / 100) * salience / answer.degrees.length;
  answer.degrees.forEach((degree, i) => {
    const [num, den] = VOICE.scale[degree];
    const at = begin + (i * VOICE.spread) / 1000;
    for (const [pn, pd, weight] of VOICE.partials) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = (VOICE.base * num * pn) / (den * pd);
      // Upper partials fade sooner, as a struck bell's do.
      const end = at + release * Math.min(1, pd / pn + 0.25);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime((share * weight) / 100, at + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(master);
      osc.start(at);
      osc.stop(end + 0.02);
    }
  });
}

function colour(answer) {
  const out = document.getElementById("pr-out");
  if (!out || !answer.level) return;
  out.style.setProperty("--pr-glow", `var(--vr-${answer.tone})`);
  if (still.matches) return;
  out.classList.remove("pr-glow");
  void out.offsetWidth;
  out.classList.add("pr-glow");
}

// One answer: coloured always, sounded unless the owner chose Quiet, and
// never two inside the rest between answers.
export function answer(key, { salience = "near", attention } = {}) {
  const chosen = answers.get(key);
  if (!chosen) return;
  const now = performance.now();
  if (now - last < VOICE.refractory) return;
  last = now;
  colour(chosen);
  const quiet = (attention ?? (read(PACE_KEY, "open") === "quiet" ? "quiet" : "open")) === "quiet";
  if (!quiet) sound(chosen, (VOICE.salience[salience] ?? VOICE.salience.near) / 100);
}

// The page's own outcomes, until the resonance signal arrives: the word the
// result shows names the answer.
const outcome = new Map(Object.entries(VOICE.outcomes).map(([word, key]) => [WORDS[word], key]));
const out = document.getElementById("pr-out");
let resonance = false;
if (out) {
  new MutationObserver(() => {
    if (resonance) return;
    const key = outcome.get(out.textContent);
    if (key) answer(key);
  }).observe(out, { childList: true, characterData: true, subtree: true });
}

// The resonance signal, when the page carries it: PrismResonance decides the
// answer, salience and attention; the voice only sounds and colours it.
if (VOICE.resonance) import(new URL(VOICE.resonance, new URL("./surface/surface.mjs", import.meta.url)).href).then(({ onResonance }) => {
  if (typeof onResonance !== "function") return;
  resonance = true;
  onResonance((signal) => answer(signal.answer, { salience: signal.salience, attention: signal.attention }));
}).catch(() => {});
