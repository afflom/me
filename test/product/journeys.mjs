// The journeys of app/specs/product/spec.json, walked as the person walks
// them: by what they can see and the names of what they press, never by the
// page's ids. Each walk throws with the first part of its done-state the page
// does not meet. A walk is named by the journey's "walk" key.
import assert from "node:assert/strict";
import { surface } from "./harness.mjs";

const app = (page) => page.locator("#stage, #rail");
const text = async (page) => (await app(page).allInnerTexts()).join("\n");
const seen = (page, words, ms = 15000) => page.waitForFunction(
  (w) => [...document.querySelectorAll("#stage, #rail")].some((root) => root.innerText.includes(w)), words, { timeout: ms },
).then(() => true, () => false);
const placeName = (key) => surface.places.find((p) => p.key === key)?.name ?? key;
async function go(page, key) {
  const name = placeName(key);
  const control = app(page).getByRole("button", { name, exact: true }).or(app(page).getByRole("link", { name, exact: true })).or(app(page).getByRole("tab", { name, exact: true })).first();
  assert.ok(await control.count(), `the person finds no "${name}" to open`);
  await control.click();
  await page.waitForTimeout(300);
}
// The row the person reads a visible thing on, as its whole line.
const rowOf = (page, words) => page.evaluate((w) => {
  const roots = [...document.querySelectorAll("#stage, #rail")];
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const e = n.parentElement;
      if (!n.textContent.includes(w) || !e.checkVisibility?.()) continue;
      return (e.closest("li, [role=listitem], article, tr") ?? e).innerText;
    }
  }
  return "";
}, words);
const TIME = /\b\d{1,2}(:\d{2})?\s*(AM|PM)\b|\b\d{1,2}:\d{2}\b/i;
// The synthetic day has arrived once any of it shows anywhere in the Prism.
const arrived = (page) => page.waitForFunction(
  () => [...document.querySelectorAll("#stage, #rail")].some((root) => /Lisbon|Lunch on Thursday|Time next week|Design review|November statement/.test(root.innerText)), null, { timeout: 30000 },
).then(() => true, () => false);
// The item the person sees with these words, as one control or row.
// The person looks for it on Today, then in each of their own places.
async function item(page, words) {
  for (const key of ["today", "conversations", "tasks", "calendar", "people"]) {
    const found = app(page).getByText(words, { exact: false }).filter({ visible: true }).first();
    if (await found.count()) return found;
    await go(page, key).catch(() => {});
  }
  assert.fail(`the person cannot find "${words}" in their places`);
}

export const walks = {
  // J9: the Prism says who the person is, from their own mail; one press confirms it, and it is kept.
  async j9(page) {
    assert.ok(await arrived(page), "the person's day never arrives");
    assert.ok(await seen(page, "person@example.org"), "the Prism does not say who the person is, from their own mail");
    const confirm = app(page).getByRole("button", { name: /^this is me$/i }).first();
    assert.ok(await confirm.count(), "there is no one press that confirms who the person is");
    await confirm.click();
    await page.waitForTimeout(800);
    assert.equal(await app(page).getByRole("button", { name: /^this is me$/i }).filter({ visible: true }).count(), 0, "confirming does not settle who the person is");
    await page.reload();
    await page.waitForSelector("html.pr-ready", { timeout: 60000 });
    await go(page, surface.places.find((p) => p.show === "settings").key);
    const names = app(page).getByRole("textbox", { name: /your addresses/i }).first();
    assert.ok(await names.count(), "the settings have no place for who the person is");
    assert.match(await names.inputValue(), /person@example\.org/, "who the person is was not kept");
  },
  // J0: nothing pressed; the day is on Today within a minute.
  async j0(page) {
    const by = Date.now() + 60000;
    while (Date.now() < by && !TIME.test(await rowOf(page, "Design review"))) await page.waitForTimeout(1000);
    assert.match(await rowOf(page, "Design review"), TIME, "Today does not show today's meeting, at its time, within a minute of opening with nothing pressed");
  },
  // J1: today's meeting, what is due and who is waiting, on Today.
  async j1(page) {
    assert.ok(await arrived(page), "the person's day never arrives");
    assert.match(await rowOf(page, "Design review"), TIME, "Today does not show today's meeting at its time");
    const shown = await text(page);
    assert.match(shown, /due/i, "Today does not show what is due (the payment due on the 28th)");
    assert.ok(shown.includes("Lunch on Thursday"), "Today does not show the message waiting on the person (Robin's lunch question)");
  },
  // J2: a Needs me list holding Robin's question; one gesture clears it.
  async j2(page) {
    assert.ok(await arrived(page), "the person's day never arrives");
    const list = app(page).getByRole("region", { name: /needs me/i }).or(app(page).getByRole("list", { name: /needs me/i })).first();
    assert.ok(await list.count(), "there is no list named Needs me");
    const row = list.getByRole("listitem").filter({ hasText: "Lunch on Thursday" }).first();
    assert.ok(await row.count(), "Needs me does not hold the message that asks the person something");
    await row.getByRole("button").first().click();
    await page.waitForTimeout(800);
    assert.equal(await list.getByRole("listitem").filter({ hasText: "Lunch on Thursday" }).count(), 0, "one gesture on it does not take it off Needs me");
  },
  // J3: the message as it reads, a reply already drafted, and one press of Send.
  async j3(page) {
    assert.ok(await arrived(page), "the person's day never arrives");
    await (await item(page, "Lunch on Thursday")).click();
    await page.waitForTimeout(500);
    const shown = await text(page);
    assert.ok(shown.includes("Shall we meet at the usual place"), "opening the message does not show it as it reads");
    assert.doesNotMatch(shown, /Message-ID|Content-Type|^From: /m, "the message is shown with its mail headers");
    const drafted = app(page).getByRole("textbox").filter({ hasNotText: "" });
    const values = await drafted.evaluateAll((boxes) => boxes.map((b) => b.value ?? b.textContent ?? ""));
    assert.ok(values.some((v) => v.trim().length > 10), "no reply is already drafted");
    const send = app(page).getByRole("button", { name: /^send$/i }).first();
    assert.ok(await send.count(), "there is no Send");
    await send.click();
    assert.ok(await seen(page, "Sent", 10000), "one press of Send does not send it");
  },
  // J4: a jot from Today lands on the Calendar on Friday at 3 PM, once.
  async j4(page) {
    assert.ok(await arrived(page), "the person's day never arrives");
    const jot = app(page).getByRole("textbox").filter({ visible: true }).and(app(page).locator(":not(#pr-prompt)")).first();
    assert.ok(await jot.count(), "Today has nowhere to jot something down");
    await jot.fill("Call the dentist Friday at 3");
    await jot.press("Enter");
    await page.waitForTimeout(800);
    await go(page, "calendar");
    const rows = app(page).getByText("Call the dentist");
    assert.equal(await rows.count(), 1, "the jot is not on the Calendar exactly once");
    const row = await rows.first().evaluate((e) => (e.closest("li, [role=listitem], article, .pr-item") ?? e).innerText);
    assert.match(row, /Fri/i, "the jot is not on Friday");
    assert.match(row, /\b(3(:00)?\s*PM|15:00)\b/i, "the jot is not at 3 PM");
  },
  // J5: a request to meet offers free times; one pick answers and books it.
  async j5(page) {
    assert.ok(await arrived(page), "the person's day never arrives");
    const request = await item(page, "Time next week");
    const before = new Set(await app(page).getByRole("button", { name: TIME }).allInnerTexts());
    await request.click();
    await page.waitForTimeout(500);
    const offered = [];
    for (const button of await app(page).getByRole("button", { name: TIME }).all()) if (!before.has(await button.innerText())) offered.push(button);
    assert.ok(offered.length, "opening the request offers no free times");
    await offered[0].click();
    await page.waitForTimeout(800);
    await go(page, "calendar");
    assert.ok((await text(page)).includes("Sam"), "picking a time does not put the meeting with Sam on the Calendar");
  },
  // J6: an answer in a sentence, with a link to where it came from.
  async j6(page) {
    assert.ok(await arrived(page), "the person's day never arrives");
    const ask = app(page).getByRole("textbox", { name: /ask/i }).or(app(page).getByPlaceholder(/ask/i)).first();
    assert.ok(await ask.count(), "there is nowhere to ask");
    await ask.fill("When is my flight?");
    await ask.press("Enter");
    await page.waitForTimeout(3000);
    const answer = app(page).locator("[aria-live], output, #pr-out").filter({ hasText: "Lisbon" }).first();
    assert.ok(await answer.count(), "the answer does not name the flight");
    const said = await answer.innerText();
    assert.match(said, /\b(is|leaves|departs|on)\b.*\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d{1,2})/i, `the answer is not a sentence with the flight's day: "${said}"`);
    assert.ok(await answer.getByRole("link").or(answer.getByRole("button", { name: /Flight to Lisbon/ })).count(), "the answer does not link to the item it came from");
  },
  // J8: talking with my data: a sentence from my own items, where it came from, and the decision in front of me.
  async j8(page) {
    assert.ok(await arrived(page), "the person's day never arrives");
    const ask = app(page).getByRole("textbox", { name: /ask/i }).or(app(page).getByPlaceholder(/ask/i)).first();
    assert.ok(await ask.count(), "there is nowhere to talk with the Prism");
    await ask.fill("What is going on with Robin?");
    await ask.press("Enter");
    await page.waitForTimeout(3000);
    const answer = app(page).locator("[aria-live], output, #pr-out").filter({ hasText: /Robin|Lunch|Design review/ }).first();
    assert.ok(await answer.count(), "the answer does not draw on Robin's items");
    const said = (await answer.innerText()).trim();
    assert.match(said, /\b(is|are|asked|asks|wrote|meets|meeting|has|wants)\b[^·]*[.?!]/i, `the answer is not a sentence: "${said}"`);
    assert.ok(await answer.getByRole("link").count(), "the answer does not link to where it came from");
    assert.ok(await answer.getByRole("button", { name: /reply|schedule|keep|let go|done/i }).count(), "the answer offers no decision");
  },
  // J7: a person's page shows what is open between us.
  async j7(page) {
    assert.ok(await arrived(page), "the person's day never arrives");
    await go(page, "people");
    const robin = app(page).getByText("Robin Example").first();
    assert.ok(await robin.count(), "People does not list Robin");
    await robin.click();
    await page.waitForTimeout(500);
    assert.ok(await app(page).getByRole("heading", { name: /Robin/ }).count(), "pressing Robin does not open Robin's page");
    const shown = await text(page);
    assert.ok(shown.includes("Lunch on Thursday"), "Robin's page does not show their latest message");
    assert.ok(shown.includes("Design review"), "Robin's page does not show the next meeting with them");
  },
  // J10: Settings has a Connections section; each service the person uses has a
  // row with its state and the one next step, and the steps leave it live.
  async j10(page) {
    await go(page, surface.places.find((p) => p.show === "settings").key);
    const section = app(page).getByRole("region", { name: /^connections$/i }).first();
    assert.ok(await section.count(), "the settings have no Connections section");
    for (const service of ["Gmail", "Calendar"]) {
      const row = section.getByRole("group", { name: new RegExp(service) }).first();
      assert.ok(await row.count(), `Connections has no row for ${service}`);
      const connected = (await row.innerText()).includes(surface.words["service.live"]);
      // A folded row opens with a tap on its name.
      if (!connected && !(await row.getByRole("button").count())) await row.getByText(service, { exact: true }).first().click();
      assert.ok(connected || (await row.getByRole("button").count()), `${service}'s row is neither connected nor offers its next step`);
    }
  },
  // J11: Quiet is one switch in Settings, and it stays on until the person turns it off.
  async j11(page) {
    const settings = surface.places.find((p) => p.show === "settings").key;
    await go(page, settings);
    const quiet = app(page).getByRole("switch", { name: /^quiet$/i }).first();
    assert.ok(await quiet.count(), "the settings have no Quiet switch");
    await quiet.check();
    await page.reload();
    await page.waitForSelector("html.pr-ready", { timeout: 60000 });
    await go(page, settings);
    assert.ok(await app(page).getByRole("switch", { name: /^quiet$/i }).first().isChecked(), "Quiet does not stay on");
  },
};
