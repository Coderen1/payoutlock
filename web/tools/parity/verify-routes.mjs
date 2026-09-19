// Behavioural checks against the PRODUCTION build (vite preview): routes, design-system
// application, viewport ownership, code splitting, and isolation between /developer and the
// redesigned routes. usage: node verify-routes.mjs [baseUrl]   (normally driven by run.mjs)
import { chromium } from "playwright-core";
import zlib from "node:zlib";
import { installMocks } from "./mocks.mjs";

const BASE = process.argv[2] ?? "http://localhost:4173";
let fails = 0;
const check = (ok, msg, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${extra ? "  — " + extra : ""}`); };
const browser = await chromium.launch({ ...(process.env.PARITY_CHROME_PATH ? { executablePath: process.env.PARITY_CHROME_PATH } : { channel: "chrome" }), headless: true });

async function open(path, { vp = { width: 1280, height: 800 } } = {}) {
  const ctx = await browser.newContext({ viewport: vp, reducedMotion: "reduce", colorScheme: "light" });
  const page = await ctx.newPage();
  const errors = []; const reqs = []; const bodies = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  page.on("response", async (r) => { const u = r.url(); if (u.startsWith(BASE)) { reqs.push(u.replace(BASE, "")); if (/\.js$/.test(u)) bodies.push({ u: u.replace(BASE, ""), r }); } });
  await installMocks(page, {});
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  return { ctx, page, errors, reqs, bodies };
}
const css = (page, sel, prop) => page.$eval(sel, (el, p) => getComputedStyle(el)[p], prop);
const near = (a, b, tol = 0.6) => Math.abs(parseFloat(a) - b) <= tol;

console.log("── A. every route renders (fresh load = deep link)");
for (const [path, h1, extra] of [
  ["/", "Cash out with confidence.", null],
  ["/app", "Protected Cash Out", null],
  ["/app/cash-out/abc123", "Protected Cash Out", "Reference · abc123"],
  ["/app/demo", "Demo scenarios", "Stellar Testnet · Simulated fiat outcome"],
  ["/app/demo/xyz789", "Demo scenarios", "Reference · xyz789"],
  ["/nope/nothing", "Page not found", null],
]) {
  const { ctx, page, errors } = await open(path);
  const text = await page.$eval("h1", (e) => e.textContent);
  check(text === h1, `${path.padEnd(22)} h1 = "${h1}"`, text !== h1 ? `got "${text}"` : "");
  if (extra) check((await page.content()).includes(extra), `${path.padEnd(22)} shows "${extra}"`);
  check((await page.textContent("body")).includes("Stellar Testnet"), `${path.padEnd(22)} carries the Testnet pill`);
  check(errors.length === 0, `${path.padEnd(22)} no console/page errors`, errors[0] ?? "");
  await ctx.close();
}
{
  // The component gallery is development-only: in a production build /_kit must simply not exist.
  const { ctx, page } = await open("/_kit");
  check((await page.$eval("h1", (e) => e.textContent)) === "Page not found", "/_kit                 dev-only gallery is not part of the production build");
  check(!(await page.content()).includes("PayoutLock UI kit"), "/_kit                 gallery content absent");
  await ctx.close();
}
{
  const { ctx, page, errors } = await open("/developer");
  check((await page.$eval("header h1", (e) => e.textContent)) === "PayoutLock", "/developer            legacy console renders (header h1 = PayoutLock)");
  check(await page.$eval("body", (b) => b.classList.contains("dev-console-body")), "/developer            body has dev-console-body");
  check((await page.$$("meta[name=robots][content=noindex]")).length === 1, "/developer            robots noindex present");
  check((await page.title()) === "PayoutLock · Developer console", "/developer            title set");
  check((await css(page, "body", "maxWidth")) === "900px", "/developer            legacy body rule active (max-width 900px)");
  check(await page.isVisible("[data-dev-shell]"), "/developer            engineering-console badge visible");
  check(errors.length === 0, "/developer            no console/page errors", errors[0] ?? "");
  await ctx.close();
}

console.log("\n── B. design system applied on the redesigned routes (1280px)");
{
  const { ctx, page } = await open("/");
  check((await css(page, "[data-pl]", "backgroundColor")) === "rgb(246, 246, 243)", "canvas background = #f6f6f3");
  check((await css(page, "h1", "color")) === "rgb(11, 18, 32)", "h1 color = ink-900 #0b1220");
  check((await css(page, "h1", "fontFamily")).startsWith('"Geist Variable"'), "h1 uses Geist Variable", await css(page, "h1", "fontFamily"));
  check(await page.evaluate(() => document.fonts.check('600 16px "Geist Variable"')), "Geist Variable font loaded (600)");
  check(near(await css(page, "h1", "fontSize"), 38.4), "h1 fluid size = 3vw at 1280 (38.4px)", await css(page, "h1", "fontSize"));
  check(near(await css(page, "h1", "letterSpacing"), -0.768, 0.01), "h1 tracking = -0.02em", await css(page, "h1", "letterSpacing"));
  check((await css(page, "h1", "fontWeight")) === "600", "h1 weight 600 (from type token)");
  check((await css(page, "h1", "textWrap")).includes("balance"), "h1 text-wrap: balance");
  await ctx.close();
}

console.log("\n── B2. the redesigned routes own the whole viewport (no body margin, no vertical overflow)");
for (const [w, h] of [[1280, 800], [390, 700], [360, 640]]) for (const path of ["/", "/app", "/app/demo"]) {
  const { ctx, page } = await open(path, { vp: { width: w, height: h } });
  const [sh, ih, margin, bg] = await page.evaluate(() => [document.documentElement.scrollHeight, window.innerHeight, getComputedStyle(document.body).margin, getComputedStyle(document.body).backgroundColor]);
  check(sh <= ih && margin === "0px" && bg === "rgb(246, 246, 243)", `${w}x${h} ${path.padEnd(10)} scrollHeight ${sh} <= ${ih}, body margin ${margin}, body bg ${bg}`);
  await ctx.close();
}
{
  const { ctx, page } = await open("/developer");
  // Legacy: body { max-width: 900px; padding: 24px; margin: 0 auto } (content-box) => 948px wide, centred in 1280px => 166px side margins.
  const [ml, mt, hasRoot] = await page.evaluate(() => [getComputedStyle(document.body).marginLeft, getComputedStyle(document.body).marginTop, !!document.querySelector("[data-pl]")]);
  check(!hasRoot && mt === "0px" && ml === "166px", "/developer            body keeps its own legacy margin (no [data-pl] root; margin-top 0, side margins 166px)", `marginTop ${mt}, marginLeft ${ml}`);
  await ctx.close();
}

console.log("\n── C. no horizontal overflow at small widths");
for (const w of [360, 390]) for (const path of ["/", "/app/cash-out/abc123", "/app/demo"]) {
  const { ctx, page } = await open(path, { vp: { width: w, height: 800 } });
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  check(sw <= iw, `${String(w).padEnd(3)}px ${path.padEnd(22)} scrollWidth ${sw} <= ${iw}`);
  await ctx.close();
}

console.log("\n── D. code splitting (production chunks)");
const gz = async (bodies) => { let raw = 0, z = 0; for (const b of bodies) { const buf = await b.r.body(); raw += buf.length; z += zlib.gzipSync(buf).length; } return [raw, z]; };
{
  const { ctx, reqs, bodies } = await open("/");
  const [raw, z] = await gz(bodies);
  check(!reqs.some((r) => /DeveloperConsole/.test(r)), "/ does NOT request the DeveloperConsole chunk");
  check(!reqs.some((r) => /^\/assets\/[^/]*\.js$/.test(r) && r.includes("stellar")), "/ requests no stellar-named script");
  console.log(`      / JS: ${bodies.length} files, ${(raw / 1024).toFixed(1)} KB raw, ${(z / 1024).toFixed(1)} KB gzip   (baseline single bundle: 1006.6 KB raw / 247.9 KB gzip)`);
  const fonts = reqs.filter((r) => r.endsWith(".woff2"));
  check(fonts.every((f) => /latin/.test(f)) && !fonts.some((f) => /cyrillic|vietnamese/.test(f)), `/ downloads only latin font subsets`, fonts.map((f) => f.split("/").pop().replace(/-[A-Za-z0-9_]{8}\.woff2/, "")).join(", ") || "(none)");
  await ctx.close();
}
{
  const { ctx, reqs, bodies } = await open("/developer");
  const [raw, z] = await gz(bodies);
  check(reqs.some((r) => /DeveloperConsole-.*\.js/.test(r)), "/developer requests the DeveloperConsole chunk");
  console.log(`      /developer JS: ${bodies.length} files, ${(raw / 1024).toFixed(1)} KB raw, ${(z / 1024).toFixed(1)} KB gzip`);
  await ctx.close();
}

console.log("\n── E. client-side navigation keeps the two worlds apart");
{
  const { ctx, page } = await open("/");
  const marginBefore = await css(page, "h1", "marginTop");
  await page.getByRole("link", { name: "Developer console" }).click();
  await page.waitForURL("**/developer");
  await page.waitForSelector("header h1");
  check(await page.$eval("body", (b) => b.classList.contains("dev-console-body")), "SPA nav / -> /developer: legacy body class ON");
  check((await css(page, "body", "maxWidth")) === "900px", "SPA nav / -> /developer: legacy body rule active");
  await page.getByRole("link", { name: "← PayoutLock" }).click();
  await page.waitForURL(BASE + "/");
  await page.waitForSelector("[data-pl] h1");
  check(await page.$eval("body", (b) => !b.classList.contains("dev-console-body")), "SPA nav /developer -> /: legacy body class OFF");
  check((await css(page, "body", "maxWidth")) === "none", "SPA nav /developer -> /: legacy body rule no longer applies (max-width none)");
  check((await page.$$("meta[name=robots]")).length === 0, "SPA nav /developer -> /: noindex removed");
  check(!(await page.title()).includes("Developer console"), "SPA nav /developer -> /: title restored", await page.title());
  check((await css(page, "h1", "marginTop")) === marginBefore && (await css(page, "h1", "color")) === "rgb(11, 18, 32)", "redesigned page unaffected by the legacy stylesheet that stays loaded", `h1 margin-top ${await css(page, "h1", "marginTop")}`);
  check((await css(page, "[data-pl]", "backgroundColor")) === "rgb(246, 246, 243)", "canvas background intact after visiting /developer");
  await ctx.close();
}
await browser.close();
console.log(`\n${fails ? fails + " CHECK(S) FAILED" : "ALL CHECKS PASSED"}`);
process.exit(fails ? 1 : 0);
