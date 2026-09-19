// Screenshots and automated checks for the dev-only component gallery at /_kit.
// usage: node tools/gallery/shots.mjs [baseUrl]      (needs `npm run dev` running; default http://localhost:5173)
// env:   PARITY_CHROME_PATH=<binary> overrides the installed Chrome
// Writes out/<viewport>/<section>.png plus out/states/*.png (real hover, focus, open menu, timeline scenarios).
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = path.join(import.meta.dirname, "out");
fs.rmSync(OUT, { recursive: true, force: true });
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 }, narrow: { width: 360, height: 740 } };
let fails = 0;
const check = (ok, msg, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${extra ? "  — " + extra : ""}`);
};

const browser = await chromium.launch({ ...(process.env.PARITY_CHROME_PATH ? { executablePath: process.env.PARITY_CHROME_PATH } : { channel: "chrome" }), headless: true });

async function open(vpName) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vpName], deviceScaleFactor: vpName === "desktop" ? 1.5 : 2, colorScheme: "light" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  await page.goto(`${BASE}/_kit`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector("[data-gallery-section]");
  await page.waitForTimeout(700); // lazy motion features
  return { ctx, page, errors };
}

const shot = async (page, selector, file) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.addStyleTag({ content: "header.sticky { visibility: hidden !important; }" }); // the sticky gallery header would otherwise be composited into element shots
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900); // reveal / draw animations settle
  await el.screenshot({ path: file, animations: "disabled" });
};

for (const vp of ["desktop", "mobile"]) {
  const { ctx, page, errors } = await open(vp);
  const ids = await page.$$eval("[data-gallery-section]", (els) => els.map((e) => e.getAttribute("data-gallery-section")));
  for (const id of ids) await shot(page, `[data-gallery-section="${id}"]`, path.join(OUT, vp, `${id}.png`));
  check(errors.length === 0, `${vp}: no console or page errors`, errors[0] ?? "");
  await ctx.close();
}

for (const vp of ["narrow", "mobile", "desktop"]) {
  const { ctx, page } = await open(vp);
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  check(sw <= iw, `${VIEWPORTS[vp].width}px: no horizontal page overflow`, `scrollWidth ${sw} vs ${iw}`);
  await ctx.close();
}

// Touch targets: every interactive control that is meant to be a primary control must be >= 44px tall.
{
  const { ctx, page } = await open("mobile");
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("[data-pl] :is(button, a[href], input, [role=tab])")]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => {
        // an <input> inside a <label> is tapped through the label, which is the real target
        const target = el.tagName === "INPUT" && el.closest("label") ? el.closest("label") : el;
        const cls = el.getAttribute("class") || "";
        const deliberate =
          /\bh-9\b/.test(cls) || // the "sm" size: dense desktop use, documented as not for primary mobile actions
          !!el.closest("[data-gallery-nav]") || // gallery navigation pills
          !!el.closest("[data-chip-actions]") || // hash chip icon buttons: hit area extended by a pseudo-element
          el.closest("code") !== null;
        return { h: Math.round(target.getBoundingClientRect().height), deliberate, text: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 30) };
      })
      .filter((x) => x.h < 44),
  );
  const unexpected = small.filter((x) => !x.deliberate);
  check(unexpected.length === 0, "mobile: every non-deliberate control is at least 44px tall", unexpected.map((x) => `${x.text}=${x.h}`).join(", "));
  console.log(`      (${small.filter((x) => x.deliberate).length} controls under 44px are deliberate: the "sm" size, gallery nav pills, hash-chip icon buttons)`);
  await ctx.close();
}

// Real interaction states, captured as they happen.
{
  const { ctx, page } = await open("desktop");
  await page.addStyleTag({ content: "header.sticky { visibility: hidden !important; }" });
  const controls = page.locator('[data-gallery-section="controls"]');
  await controls.scrollIntoViewIfNeeded();
  const primary = controls.getByRole("button", { name: "Continue" }).first();
  await primary.hover();
  await page.waitForTimeout(250);
  await page.locator('[data-gallery-section="controls"] >> text=Buttons').first().scrollIntoViewIfNeeded();
  await controls.locator("div.grid.gap-6").first().screenshot({ path: path.join(OUT, "states", "button-hover-primary.png"), animations: "disabled" });
  await page.mouse.move(0, 0);
  await primary.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const ring = await primary.evaluate((el) => getComputedStyle(el).outlineStyle + " " + getComputedStyle(el).outlineWidth);
  check(/solid 2px/.test(ring), "keyboard focus draws the 2px focus ring", ring);
  await controls.locator("div.grid.gap-6").first().screenshot({ path: path.join(OUT, "states", "button-focus-primary.png"), animations: "disabled" });

  // wallet menu open
  const wallet = page.locator('[data-gallery-section="wallet-amount"]');
  await wallet.scrollIntoViewIfNeeded();
  await wallet.getByRole("button", { name: /open menu/ }).first().click();
  await page.waitForTimeout(500);
  const menuInRoot = await page.evaluate(() => !!document.querySelector("[data-pl] [role=menu]"));
  check(menuInRoot, "wallet menu portals inside [data-pl] (gets the design-system styles)");
  await page.screenshot({ path: path.join(OUT, "states", "wallet-menu-open.png"), animations: "disabled" });
  await page.keyboard.press("Escape");

  // timeline scenarios
  const tl = page.locator('[data-gallery-section="timeline"]');
  await tl.scrollIntoViewIfNeeded();
  for (const name of ["Payout delayed", "Protection available", "Settled", "Expired"]) {
    await tl.getByRole("tab", { name }).click();
    await page.waitForTimeout(800);
    await tl.screenshot({ path: path.join(OUT, "states", `timeline-${name.toLowerCase().replace(/\W+/g, "-")}.png`), animations: "disabled" });
  }

  // amount input sanitising
  const ctl = page.locator('[data-gallery-section="controls"]');
  const amountField = ctl.getByLabel("You send");
  await amountField.fill("0012,3456abc.7");
  check((await amountField.inputValue()) === "12.34", "AmountInput sanitises typing to a clean 2-decimal amount", await amountField.inputValue());
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall gallery checks passed");
process.exit(fails ? 1 : 0);
