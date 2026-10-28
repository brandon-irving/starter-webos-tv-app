// tv.js interaction regressions, in headless Chromium. Pointer input goes through page.mouse (real mouse events,
// like the Magic Remote); remote keys go through CDP Input.dispatchKeyEvent, the same way `npm run key` drives the TV.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { APP_DIR } from "../scripts/lib.mjs";

const KEY = { left: 37, up: 38, right: 39, down: 40, ok: 13, back: 461, backspace: 8 };

const FIXTURE = `<!DOCTYPE html><html><head><style>
  body { margin: 0; font: 20px sans-serif; }
  .t { display: inline-block; width: 200px; height: 80px; margin: 10px; background: #ddd; }
  #ov { position: fixed; left: 0; top: 400px; }
  input, #wrap { display: block; width: 400px; height: 40px; margin: 10px; }
</style></head><body>
  <div id="row"><div class="t" id="a"><span class="icon">*</span><span class="label">A</span></div><div class="t" id="b">B</div><div class="t" id="c">C</div></div>
  <input id="field" type="text">
  <div id="wrap"><div id="ce" contenteditable="true"><p>hello <b id="ceb">world</b></p></div></div>
  <button class="t" id="btn" type="button">Button</button>
  <div id="ov" hidden><div class="t" id="o1">O1</div><div class="t" id="o2">O2</div></div>
</body></html>`;

let browser, page, cdp;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  cdp = await page.context().newCDPSession(page);
});
after(async () => { await browser?.close(); });

beforeEach(async () => {
  // Park the pointer off every item: Chromium sends a mouseover to whatever lands under a resting pointer after
  // layout, which would hover-focus an item at a racy moment in the next test
  await page.mouse.move(0, 0);
  await page.setContent(FIXTURE);
  await page.addScriptTag({ path: path.join(APP_DIR, "js/tv.js") });
  // Instrumentation: every action TV.onInput sees, every _select call, every onRowFocus call
  await page.evaluate(() => {
    window.log = { input: [], select: [], rowFocus: 0 };
    TV.onInput = (a) => { log.input.push(a); };
    for (const el of document.querySelectorAll(".t")) el._select = () => log.select.push(el.id);
    window.$ = (id) => document.getElementById(id);
    window.base = { rows: [{ items: [$("a"), $("b"), $("c")] }], onRowFocus: () => { log.rowFocus++; }, onBack: () => log.input.push("onBack") };
    TV.nav.push(base);
  });
});

const key = async (name) => {
  const code = KEY[name];
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
};
const focusedId = () => page.evaluate(() => TV.nav.focused()?.id ?? null);
const log = () => page.evaluate(() => window.log);
const activeId = () => page.evaluate(() => document.activeElement?.id || null);
const center = async (sel) => {
  const b = await page.locator(sel).boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};
const hover = async (sel) => { await page.mouse.move(...(await center(sel))); };
const click = async (sel) => { await page.mouse.click(...(await center(sel))); };
const openOverlay = () => page.evaluate(() => {
  $("ov").hidden = false;
  TV.nav.push({ rows: [{ items: [$("o1"), $("o2")] }], onClose: () => { $("ov").hidden = true; } });
});

// ---------- Pointer ----------

test("pointer clicks work after an overlay is closed and reopened", async () => {
  await openOverlay();
  await page.evaluate(() => TV.nav.pop());
  await openOverlay(); // a new layer object around the same elements
  await click("#o2");
  assert.equal(await focusedId(), "o2");
  assert.deepEqual((await log()).select, ["o2"]);
});

test("a pointer click reaches TV.onInput exactly once and selects once", async () => {
  await click("#b");
  const l = await log();
  assert.deepEqual(l.input, ["ok"]);
  assert.deepEqual(l.select, ["b"]);
  assert.equal(await focusedId(), "b");
});

test("a click focuses the clicked item before selecting it", async () => {
  await page.evaluate(() => { $("c")._select = () => log.select.push("focused:" + TV.nav.focused().id); });
  await click("#c");
  assert.deepEqual((await log()).select, ["focused:c"]);
});

test("hover focuses the item under the pointer after rows are reordered", async () => {
  await page.evaluate(() => {
    const row = $("row");
    row.prepend($("c")); // DOM order now c, a, b
    TV.nav.update(base, [{ items: [$("c"), $("a"), $("b")] }]);
  });
  await hover("#a");
  assert.equal(await focusedId(), "a");
  await hover("#c");
  assert.equal(await focusedId(), "c");
});

test("moving between children of a tile doesn't re-focus it", async () => {
  await hover("#b");
  const before = (await log()).rowFocus;
  await hover("#a .icon");
  await hover("#a .label");
  await hover("#a .icon");
  assert.equal((await log()).rowFocus, before + 1);
  assert.equal(await focusedId(), "a");
});

test("hover and click only reach the top layer", async () => {
  await openOverlay();
  await click("#a"); // behind the overlay
  assert.equal(await focusedId(), "o1");
  assert.deepEqual((await log()).select, []);
});

test("an element moved into another layer responds there", async () => {
  await page.evaluate(() => {
    $("ov").prepend($("b"));
    $("ov").hidden = false;
    TV.nav.update(base, [{ items: [$("a"), $("c")] }]);
    TV.nav.push({ rows: [{ items: [$("b"), $("o1")] }] });
  });
  await click("#b");
  assert.equal(await focusedId(), "b");
  assert.deepEqual((await log()).select, ["b"]);
  await page.evaluate(() => TV.nav.pop());
  await hover("#c");
  assert.equal(await focusedId(), "c");
});

// ---------- Rows changing ----------

test("removing the focused item moves focus to its neighbour", async () => {
  await key("right"); await key("right");
  assert.equal(await focusedId(), "c");
  await page.evaluate(() => { $("c").remove(); TV.nav.update(base, [{ items: [$("a"), $("b")] }]); });
  assert.equal(await focusedId(), "b");
  assert.equal(await page.evaluate(() => document.querySelectorAll(".focused").length), 1);
});

test("focus follows the focused element when its row is reordered", async () => {
  await key("right");
  assert.equal(await focusedId(), "b");
  await page.evaluate(() => TV.nav.update(base, [{ items: [$("b"), $("c"), $("a")] }]));
  assert.equal(await focusedId(), "b");
  await key("right");
  assert.equal(await focusedId(), "c");
});

// ---------- Keys and native controls ----------

test("Enter on a focused <button> selects exactly once", async () => {
  await page.evaluate(() => TV.nav.update(base, [{ items: [$("btn")] }]));
  assert.equal(await activeId(), "btn"); // nav focus is mirrored as browser focus
  await key("ok");
  const l = await log();
  assert.deepEqual(l.input, ["ok"]);
  assert.deepEqual(l.select, ["btn"]);
});

test("nav focus is mirrored as browser focus", async () => {
  await key("right");
  assert.equal(await activeId(), "b");
});

// ---------- Text editing ----------

const withField = () => page.evaluate(() => TV.nav.update(base, [{ items: [$("a")] }, { items: [$("field")] }, { items: [$("wrap")] }]));

test("navigating onto a text field doesn't open it; selecting it does", async () => {
  await withField();
  await key("down");
  assert.equal(await focusedId(), "field");
  assert.equal(await activeId(), null);
  await key("ok");
  assert.equal(await activeId(), "field");
  assert.equal(await page.evaluate(() => $("field").classList.contains("editing")), true);
});

test("while editing, Backspace and arrows go to the field, not to navigation", async () => {
  await withField();
  await key("down"); await key("ok");
  await page.keyboard.type("abc");
  await key("backspace");
  await key("left"); await key("down"); await key("up");
  assert.equal(await page.evaluate(() => $("field").value), "ab");
  assert.equal(await focusedId(), "field");
  assert.deepEqual((await log()).input, ["down", "ok"]); // only the two presses before editing started
});

test("Back leaves the field without popping or exiting, and navigation resumes", async () => {
  await withField();
  await key("down"); await key("ok");
  await page.keyboard.type("x");
  await key("back");
  assert.equal(await activeId(), null);
  assert.equal(await focusedId(), "field");
  assert.equal(await page.evaluate(() => $("field").classList.contains("editing")), false);
  assert.ok(!(await log()).input.includes("onBack"));
  await key("down");
  assert.equal(await focusedId(), "wrap");
});

test("Enter in a one-line input ends editing and fires change", async () => {
  await withField();
  await page.evaluate(() => $("field").addEventListener("change", () => log.input.push("change")));
  await key("down"); await key("ok");
  await page.keyboard.type("hi");
  await key("ok");
  assert.equal(await activeId(), null);
  assert.ok((await log()).input.includes("change"));
});

test("selecting a field that is already being edited doesn't focus it again", async () => {
  await withField();
  await page.evaluate(() => { window.focusCount = 0; $("field").addEventListener("focus", () => focusCount++); });
  await key("down"); await key("ok");
  await page.evaluate(() => { TV.nav.select(); TV.nav.select(); });
  assert.equal(await page.evaluate(() => window.focusCount), 1);
});

test("nested contenteditable: select edits it, caret clicks stay in it, Backspace deletes, Back leaves", async () => {
  await withField();
  await key("down"); await key("down");
  assert.equal(await focusedId(), "wrap");
  await key("ok");
  assert.equal(await activeId(), "ce");
  await click("#ceb"); // clicking inside a nested element of the field being edited
  assert.equal(await activeId(), "ce");
  await page.keyboard.press("End");
  await key("backspace");
  assert.equal(await page.evaluate(() => $("ce").textContent), "hello worl");
  await key("back");
  assert.equal(await activeId(), "wrap"); // browser focus returns to the item (a plain div), not the field
  assert.equal(await focusedId(), "wrap");
  assert.deepEqual((await log()).input, ["down", "down", "ok"]);
});

test("clicking a text field starts editing without a separate OK", async () => {
  await withField();
  await click("#field");
  assert.equal(await activeId(), "field");
  assert.equal(await focusedId(), "field");
  assert.deepEqual((await log()).input, []);
});

test("hovering other items while editing doesn't steal focus", async () => {
  await withField();
  await key("down"); await key("ok");
  await hover("#a");
  assert.equal(await activeId(), "field");
  assert.equal(await focusedId(), "field");
});

test("clicking another item while editing ends editing and selects that item once", async () => {
  await withField();
  await key("down"); await key("ok");
  await click("#a");
  assert.equal(await activeId(), "a");
  assert.deepEqual((await log()).select, ["a"]);
  assert.equal(await page.evaluate(() => $("field").classList.contains("editing")), false);
});

// ---------- The demo app ----------

test("demo page: loads cleanly, search filters the row, Back returns to navigation", async () => {
  const errors = [];
  const onError = (e) => errors.push(e.message);
  page.on("pageerror", onError);
  await page.goto(pathToFileURL(path.join(APP_DIR, "index.html")).href);
  await key("down");
  assert.equal(await activeId(), null);
  assert.equal(await page.evaluate(() => TV.nav.focused().id), "search");
  await key("ok");
  await page.keyboard.type("1");
  const shown = await page.evaluate(() => [...document.querySelectorAll("#track .tile:not([hidden])")].map((e) => e.textContent));
  assert.deepEqual(shown, ["Item 1", "Item 10", "Item 11", "Item 12"]);
  await key("back");
  await key("down");
  assert.equal(await page.evaluate(() => TV.nav.focused().textContent), "Item 1");
  await key("right");
  assert.equal(await page.evaluate(() => TV.nav.focused().textContent), "Item 10");
  page.off("pageerror", onError);
  assert.deepEqual(errors, []);
});
