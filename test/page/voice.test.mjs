// VO-01 in headless Chromium, against the assembled page: the voice loads
// only with the owner's first gesture, answers a kept note in the model's
// tones and colour, and is silent under Quiet.
// usage: NODE_PATH="$(npm root --global)" [PAGE_SITE=dir | PAGE_URL=url] node --test test/page/voice.test.mjs
import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { chromium, faults, open, serve } from "../product/harness.mjs";

// What the owner types comes from the specifications' own examples (RFC 5546 §4.4).
const { titleOf } = await import(resolve("test/oracle/examples.mjs"));

test("the Prism answers in just tones and colour, only after a gesture, silent under Quiet (VO-01)", async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // Every tone the page starts is recorded, by its frequency.
    await page.addInitScript(() => {
      window.__tones = [];
      const Audio = window.AudioContext;
      if (!Audio) return;
      const make = Audio.prototype.createOscillator;
      Audio.prototype.createOscillator = function () {
        const osc = make.call(this);
        const start = osc.start.bind(osc);
        osc.start = (...args) => { window.__tones.push(Math.round(osc.frequency.value * 1000) / 1000); return start(...args); };
        return osc;
      };
    });
    const voiceFetched = [];
    page.on("request", (request) => { if (request.url().endsWith("/voice.mjs")) voiceFetched.push(request.url()); });
    const errors = faults(page);
    await open(page, server.url);
    await page.waitForTimeout(500);
    assert.equal(voiceFetched.length, 0, "the voice loads before any gesture");

    const { VOICE, WORDS } = await page.evaluate(() => import("./surface/surface.mjs").then((m) => ({ VOICE: m.VOICE, WORDS: m.WORDS })));
    const tonesOf = (key) => {
      const answer = VOICE.answers.find((a) => a.key === key);
      return answer.degrees.flatMap((d) => VOICE.partials.map(([pn, pd]) => Math.round(((VOICE.base * VOICE.scale[d][0] * pn) / (VOICE.scale[d][1] * pd)) * 1000) / 1000));
    };
    const settle = (text) => page.waitForFunction((t) => document.getElementById("pr-out").textContent.trim() === t, text, { timeout: 10000 });
    const note = async (place, text) => {
      await page.click(`.pr-go[data-place="${place}"]`);
      await page.fill("#pr-act input", text);
      await page.click("#pr-act button");
    };

    // A kept task: the voice answers with the model's chime, in its tone.
    await note("tasks", titleOf("rfc5546-41"));
    await settle(WORDS.kept);
    assert.equal(voiceFetched.length, 1, "the first gesture loads the voice once");
    await page.waitForFunction(() => window.__tones.length > 0, null, { timeout: 5000 });
    const heard = await page.evaluate(() => window.__tones.slice());
    assert.deepEqual([...heard].sort((a, b) => a - b), tonesOf(VOICE.outcomes.kept).sort((a, b) => a - b), "the chime is the model's just tones");
    assert.equal(await page.evaluate(() => document.getElementById("pr-out").classList.contains("pr-glow")), true, "the answer is coloured");

    // Under Quiet, still coloured, never sounded.
    await page.evaluate(() => localStorage.setItem("me.pace", "quiet"));
    await page.waitForTimeout(VOICE.refractory + 50);
    await page.evaluate(() => { window.__tones.length = 0; document.getElementById("pr-out").classList.remove("pr-glow"); });
    await note("tasks", titleOf("rfc5546-47"));
    await settle(WORDS.kept);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__tones.length), 0, "Quiet sounds nothing");
    assert.equal(await page.evaluate(() => document.getElementById("pr-out").classList.contains("pr-glow")), true, "Quiet still colours the answer");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
