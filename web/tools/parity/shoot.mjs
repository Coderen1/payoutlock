// Captures screenshots + a full DOM/computed-style dump for every parity scene.
// usage: node shoot.mjs <label> <baseUrl> <consolePath>      (normally driven by run.mjs)
// env:   ONLY=<regex> limits scenes · PARITY_CHROME_PATH=<binary> overrides the installed Chrome
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { installMocks, WALLET } from "./mocks.mjs";

const [label, baseUrl, consolePath] = process.argv.slice(2);
const outDir = path.join(import.meta.dirname, "out", label);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const D = { width: 1280, height: 900 };
const M = { width: 390, height: 844 };
const consoleScenes = [
  { name: "console-offline", vp: D, mocks: { config: "abort" } },
  { name: "console-disconnected", vp: D },
  { name: "console-live", vp: D, seed: true },
  { name: "console-live-mobile", vp: M, seed: true },
  { name: "console-demo-failure", vp: D, seed: true, click: ["Demo: Payout Failure"] },
  { name: "console-demo-refund", vp: D, seed: true, click: ["Demo: Refund"] },
  { name: "console-failure-gate-noaccount", vp: D, seed: true, click: ["Demo: Payout Failure", "Open Demo Failure Scenario"], mocks: { horizon: "no-account" } },
  { name: "console-failure-gate-lowreserve", vp: D, seed: true, click: ["Demo: Payout Failure", "Open Demo Failure Scenario"], mocks: { horizon: "low-reserve" } },
  { name: "console-failure-gate-notrustline", vp: D, seed: true, click: ["Demo: Payout Failure", "Open Demo Failure Scenario"], mocks: { horizon: "no-trustline" } },
  { name: "console-failure-gate-insufficient", vp: D, seed: true, click: ["Demo: Payout Failure", "Open Demo Failure Scenario"], mocks: { horizon: "insufficient" } },
  { name: "console-failure-gate-ready", vp: D, seed: true, click: ["Demo: Payout Failure", "Open Demo Failure Scenario"], mocks: { horizon: "ready" } },
  { name: "console-refund-gate-noaccount", vp: D, seed: true, click: ["Demo: Refund", "Open Demo Refund Scenario"], mocks: { horizon: "no-account" } },
  { name: "console-failure-gate-noaccount-mobile", vp: M, seed: true, click: ["Demo: Payout Failure", "Open Demo Failure Scenario"], mocks: { horizon: "no-account" } },
];
if (label === "current") consoleScenes.push({ name: "zz-review-console-live-with-badge", vp: D, seed: true, showShell: true });
const harnessScenes = [
  ...["AwaitingFunding", "Pending", "Grace", "Claimable", "Settled", "Refunded", "Claimed", "Expired", "loading", "empty"].map((t) => ({ name: `card-${t}`, vp: D, harness: `card-${t}` })),
  { name: "card-Claimed-mobile", vp: M, harness: "card-Claimed" },
  ...["no-account", "low-reserve", "no-trustline", "insufficient", "ready"].map((h) => ({ name: `gate-${h}`, vp: D, harness: `gate-${h}`, mocks: { horizon: h } })),
  { name: "kitchen", vp: D, harness: "kitchen" },
  { name: "kitchen-mobile", vp: M, harness: "kitchen" },
];

const dumpDom = () => {
  const names = Array.from(getComputedStyle(document.body)).filter((p) => !p.startsWith("--"));
  const skip = new Set(["SCRIPT", "STYLE", "LINK", "NOSCRIPT", "TEMPLATE", "META"]);
  const out = [];
  const walk = (el, p) => {
    if (skip.has(el.tagName)) return;
    if (el.hasAttribute("data-dev-shell")) return; // additive /developer badge — not part of the parity comparison
    const cs = getComputedStyle(el);
    const style = {};
    for (const n of names) style[n] = cs.getPropertyValue(n);
    const r = el.getBoundingClientRect();
    out.push({
      path: p, tag: el.tagName, cls: el === document.body ? "" : el.getAttribute("class") ?? "",
      text: el.childElementCount === 0 ? (el.textContent ?? "").trim().slice(0, 80) : "",
      rect: [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100), style,
    });
    const seen = {};
    for (const c of el.children) { seen[c.tagName] = (seen[c.tagName] ?? 0) + 1; walk(c, `${p}>${c.tagName.toLowerCase()}[${seen[c.tagName]}]`); }
  };
  walk(document.body, "body");
  return out;
};

const browser = await chromium.launch({ ...(process.env.PARITY_CHROME_PATH ? { executablePath: process.env.PARITY_CHROME_PATH } : { channel: "chrome" }), headless: true });
let failed = 0;
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
for (const sc of [...consoleScenes, ...harnessScenes].filter((x) => !only || only.test(x.name))) {
  const ctx = await browser.newContext({ viewport: sc.vp, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  try {
    await installMocks(page, sc.mocks ?? {});
    const url = sc.harness ? `${baseUrl}/tools/parity/harness/index.html?scene=${sc.harness}` : `${baseUrl}${consolePath}`;
    await page.goto(url, { waitUntil: "networkidle" });
    if (sc.seed) {
      await page.evaluate(async (addr) => {
        const m = await import("/src/lib/session.ts");
        m.setWalletAddress(addr);
        m.setAppSession("parity-mock-token", Math.floor(Date.now() / 1000) + 900);
      }, WALLET);
      await page.waitForTimeout(400);
    }
    for (const name of sc.click ?? []) {
      await page.getByRole("button", { name, exact: false }).first().click();
      await page.waitForTimeout(700);
    }
    if (sc.harness) await page.waitForTimeout(900); // let ledger/readiness polls settle
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    if (!sc.showShell) await page.addStyleTag({ content: "[data-dev-shell]{display:none !important}" });
    await page.screenshot({ path: path.join(outDir, `${sc.name}.png`), fullPage: true });
    fs.writeFileSync(path.join(outDir, `${sc.name}.json`), JSON.stringify(await page.evaluate(dumpDom)));
    console.log(`ok   ${sc.name}${errors.length ? `  (page errors: ${errors.length})` : ""}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${sc.name}: ${String(e).split("\n")[0]}`);
  }
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} scene(s) failed` : "all scenes captured");
process.exit(failed ? 1 : 0);
