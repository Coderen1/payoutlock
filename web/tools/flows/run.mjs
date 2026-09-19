// Browser flow tests for /app and /app/demo. The app's own code runs unchanged in real Chrome; the I/O modules in
// src/lib are replaced by a simulated world (world.js / stubs.mjs), so nothing touches Testnet or spends funds.
// usage: node tools/flows/run.mjs            (starts its own Vite on :5197)
// env:   ONLY=<regex> limits flows · PARITY_CHROME_PATH=<binary> overrides the installed Chrome
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { STUBS } from "./stubs.mjs";

const HERE = import.meta.dirname;
const WEB = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "out");
const PORT = 5197;
const BASE = `http://localhost:${PORT}`;
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } };

const results = [];
const check = (flow, ok, msg, extra = "") => {
  results.push({ flow, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  [${flow}] ${msg}${extra && !ok ? "  — " + extra : ""}`);
};

// ------------------------------------------------------------------------------------------------ infrastructure
fs.rmSync(OUT, { recursive: true, force: true });
const vite = spawn(process.execPath, [path.join(WEB, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"], { cwd: WEB, stdio: "ignore" });
const stopVite = () => vite.kill("SIGTERM");
process.on("exit", stopVite);
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE + "/")).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ ...(process.env.PARITY_CHROME_PATH ? { executablePath: process.env.PARITY_CHROME_PATH } : { channel: "chrome" }), headless: true });
const worldScript = fs.readFileSync(path.join(HERE, "world.js"), "utf8");

const BANNED = /FUNDED|\bnonce\b|\bSAC\b|advance_to|attestation|SEP-\d|Guarantee Provider|Soroban|stroop|AwaitingFunding|\bClaimable\b|\bPending\b/;

let current = null; // the page a flow is driving — used to show what was on screen if it crashes
async function open(vpName, { mobileUA = false, path: startPath, setup, liquidity = "50000000" } = {}) {
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[vpName],
    deviceScaleFactor: 1.5,
    reducedMotion: "reduce",
    ...(mobileUA ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1", isMobile: true, hasTouch: true } : {}),
  });
  await ctx.addInitScript(worldScript);
  const page = await ctx.newPage();
  current = page;
  page.liquidity = liquidity; // what the (stubbed) backend says the provider can back: stroops, or null = unavailable
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost") {
      const m = /^\/src\/(.+?\.ts)$/.exec(url.pathname);
      if (m && STUBS[m[1]]) return route.fulfill({ status: 200, contentType: "text/javascript", body: STUBS[m[1]] });
      return route.continue();
    }
    if (url.hostname === "backend.test.invalid" && url.pathname === "/api/provider-liquidity") {
      const cors = { "access-control-allow-origin": "*" };
      return page.liquidity == null
        ? route.fulfill({ status: 503, contentType: "application/json", headers: cors, body: JSON.stringify({ error: "provider_liquidity_unavailable" }) })
        : route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ availableStroops: page.liquidity }) });
    }
    if (url.hostname === "anchor.test.invalid" && url.pathname === "/sep38/price") {
      const amount = Number(url.searchParams.get("sell_amount") ?? "1");
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ buy_amount: (48.54 * amount).toFixed(2), sell_amount: amount.toFixed(7), fee: { details: [{ description: "50 bps from the USD/TRY mid rate" }] } }) });
    }
    return route.abort("blockedbyclient");
  });
  if (setup) await page.addInitScript(setup);
  await page.goto(BASE + (startPath ?? "/app"), { waitUntil: "load" });
  await page.waitForSelector("h1", { timeout: 15000 });
  return { ctx, page, errors };
}

const world = (page, fn, arg) => page.evaluate(fn, arg);
const say = (page, text, timeout = 15000) => page.getByText(text, { exact: false }).first().waitFor({ timeout });
const click = (page, name, o = {}) => page.getByRole("button", { name, ...o }).first().click();
const bodyText = (page) => page.evaluate(() => document.body.innerText);

function makeSnap(flow, vpName, isLive, isDemo) {
  return async (page, name) => {
    await page.waitForTimeout(350);
    const dir = path.join(OUT, vpName);
    fs.mkdirSync(dir, { recursive: true });
    // Full page with the sticky action bar put back in the flow (a fixed element would otherwise be pasted mid-page),
    // plus, on phones, the real first screen with the bar where a person sees it.
    const style = await page.addStyleTag({ content: "[data-sticky-bar]{position:static !important}" });
    await page.screenshot({ path: path.join(dir, `${flow}--${name}.png`), fullPage: true });
    await style.evaluate((el) => el.remove());
    if (vpName === "mobile") {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(dir, `${flow}--${name}--viewport.png`) });
    }
    const text = await bodyText(page);
    const leak = text.match(BANNED);
    check(flow, !leak, `${vpName} ${name}: no implementation terms on screen`, leak ? `"${leak[0]}"` : "");
    if (isLive) check(flow, !/simulat/i.test(text), `${vpName} ${name}: no "Simulate…" anywhere in /app`, "");
    if (isDemo) check(flow, /Stellar Testnet · Simulated fiat outcome/.test(text), `${vpName} ${name}: simulated-outcome ribbon visible`);
    // The Testnet marker must be on the first screen at every width, not only wide ones.
    await page.evaluate(() => window.scrollTo(0, 0));
    const marker = await page.evaluate(() => {
      const hits = [...document.querySelectorAll("body *")].filter((el) => /Testnet/.test(el.textContent ?? "") && ![...el.children].some((c) => /Testnet/.test(c.textContent ?? "")));
      return hits.some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight; });
    });
    check(flow, marker, `${vpName} ${name}: "Testnet" marker is visible on the first screen`);
  };
}

/** The lifecycle timeline as a person sees it: [{title, state}], opening the phone's "See all steps" if needed. */
async function timeline(page) {
  const read = () => page.evaluate(() => {
    const ol = [...document.querySelectorAll("ol")].find((o) => o.offsetParent !== null && o.querySelector("li p"));
    if (!ol) return null;
    return [...ol.querySelectorAll(":scope > li")].map((li) => {
      const m = /^(.*?) — (Completed|In progress|Needs attention|Upcoming|Skipped)$/.exec(li.querySelector("p").textContent.trim());
      return m ? { title: m[1], state: m[2] } : null;
    });
  });
  let steps = await read();
  if (!steps) {
    const more = page.getByRole("button", { name: "See all steps" });
    if (await more.count()) { await more.click(); steps = await read(); }
  }
  return steps;
}
const stateOf = (steps, title) => steps?.find((s) => s?.title === title)?.state;
const LIFECYCLE = ["Preparing", "Protection ready", "Funding verified", "Fiat payout processing"];

const connect = async (page) => {
  await click(page, "Connect wallet");
  await page.locator('button[aria-label^="Wallet "]').waitFor({ timeout: 15000 });
};
const idFromUrl = (page) => decodeURIComponent(new URL(page.url()).pathname.split("/").pop());

async function assertClean(flow, page, errors, vpName) {
  const calls = await world(page, () => window.__world.calls);
  check(flow, !calls.some((c) => c.startsWith("FORBIDDEN:")), `${vpName}: the UI never called advance/expire (the keeper does that)`, calls.filter((c) => c.startsWith("FORBIDDEN")).join(","));
  check(flow, errors.length === 0, `${vpName}: no console or page errors`, errors[0] ?? "");
}

async function assertStorage(flow, page, vpName, expectFlow, ref) {
  const dump = await page.evaluate(() => ({ local: Object.fromEntries(Object.entries(localStorage)), sessionKeys: Object.keys(sessionStorage), cookie: document.cookie }));
  const keys = Object.keys(dump.local);
  check(flow, keys.length === 1 && keys[0] === "payoutlock:last-cash-out", `${vpName}: localStorage holds exactly one key`, keys.join(","));
  const value = JSON.parse(dump.local["payoutlock:last-cash-out"] ?? "{}");
  check(flow, Object.keys(value).sort().join() === "flow,reference" && value.flow === expectFlow && value.reference === ref, `${vpName}: it holds only {flow, reference}`, JSON.stringify(value));
  // scan what is actually stored (keys and values), not the labels of this test's own dump
  const stored = JSON.stringify([...Object.keys(dump.local), ...Object.values(dump.local), ...dump.sessionKeys, dump.cookie]);
  check(flow, !/anchor-jwt|app-session-token|token|jwt|session/i.test(stored) && dump.sessionKeys.length === 0 && dump.cookie === "", `${vpName}: no token, JWT or session data in local/session storage or cookies`);
}

// ---------------------------------------------------------------------------------------------------------- flows
const FLOWS = {
  // The real product, start to finish, including the wallet setup checklist.
  async "live-settled"(vp) {
    const flow = "live-settled";
    const { ctx, page, errors } = await open(vp, { path: "/app" });
    const snap = makeSnap(flow, vp, true, false);
    await say(page, "48.54");
    await snap(page, "01-compose-disconnected");
    await world(page, () => { window.__world.readiness.status = "no-account"; });
    await connect(page);
    await say(page, "Set up your wallet");
    await snap(page, "02-wallet-setup");
    await click(page, "Get Testnet funds");
    await click(page, "Enable USDC");
    await click(page, "Get test USDC");
    await page.getByRole("button", { name: "Start protected cash out" }).waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector('button[disabled]') || [...document.querySelectorAll("button")].find((b) => /Start protected/.test(b.textContent) && !b.disabled), null, { timeout: 15000 });
    await snap(page, "03-compose-ready");
    await world(page, () => { window.__world.holdFunding = true; });
    await click(page, "Start protected cash out");
    await say(page, "Signing in with the payout partner");
    await snap(page, "04-starting-sign-in");
    await say(page, "Ready to send", 20000);
    const ref = idFromUrl(page);
    await snap(page, "05-ready-to-send");
    check(flow, !/You sent/.test(await bodyText(page)) && /You send\b/.test(await bodyText(page)), `${vp}: before sending, the summary says "You send", not "You sent"`);
    const t1 = await timeline(page);
    check(flow, LIFECYCLE.every((title, i) => t1?.[i]?.title === title) && t1?.[4]?.title === "Outcome", `${vp}: timeline is Preparing / Protection ready / Funding verified / Fiat payout processing / Outcome`, JSON.stringify(t1?.map((s) => s?.title)));
    check(flow, stateOf(t1, "Protection ready") === "In progress" && stateOf(t1, "Funding verified") === "Upcoming", `${vp}: before the payment is sent, "Protection ready" is active and "Funding verified" has not started`, JSON.stringify(t1));
    await assertStorage(flow, page, vp, "live", ref);
    await click(page, "Send 1.00 USDC");
    await say(page, "Approve the payment in your wallet");
    await snap(page, "06-sending");
    await say(page, "Verifying funding", 12000);
    await snap(page, "07-verifying-funding");
    const t2 = await timeline(page);
    check(flow, stateOf(t2, "Protection ready") === "Completed" && stateOf(t2, "Funding verified") === "In progress", `${vp}: while the payment is being verified, "Funding verified" is in progress`, JSON.stringify(t2));
    await world(page, (id) => { window.__world.holdFunding = false; window.__world.setAnchor(id, "pending_anchor"); }, ref);
    await say(page, "Protection active", 15000);
    await say(page, "Your bank payout is being processed", 12000);
    await snap(page, "08-protection-active");
    const t3 = await timeline(page);
    check(flow, stateOf(t3, "Funding verified") === "Completed" && stateOf(t3, "Fiat payout processing") === "In progress", `${vp}: once funded, "Funding verified" is completed and the payout is in progress`, JSON.stringify(t3));
    check(flow, !/payout completed/i.test(await bodyText(page)), `${vp}: while the payout is processing, nothing on screen says it completed`);
    await world(page, (id) => window.__world.setAnchor(id, "completed"), ref);
    await page.getByRole("heading", { name: "Settled" }).waitFor({ timeout: 20000 });
    await snap(page, "09-settled");
    const c = await world(page, () => ({ settle: window.__world.count("checkLiveSettlement"), claim: window.__world.count("claimProtection") }));
    check(flow, c.settle === 1 && c.claim === 0, `${vp}: settlement confirmed automatically, exactly once; no claim`, JSON.stringify(c));
    check(flow, (await page.getByText("Payout confirmed").count()) > 0, `${vp}: payout receipt shown under "Verify on Stellar"`);
    await assertClean(flow, page, errors, vp);
    await ctx.close();
  },

  // Payout never arrives: the keeper (played by the test) moves the chain; the person only ever claims.
  async "live-claim"(vp) {
    const flow = "live-claim";
    const { ctx, page, errors } = await open(vp, { path: "/app" });
    const snap = makeSnap(flow, vp, true, false);
    await say(page, "48.54");
    await connect(page);
    await click(page, "Start protected cash out");
    await say(page, "Ready to send", 20000);
    const ref = idFromUrl(page);
    await click(page, "Send 1.00 USDC");
    await say(page, "Protection active", 15000);
    await world(page, (id) => window.__world.setAnchor(id, "pending_anchor"), ref);
    await world(page, (id) => window.__world.setState(id, "Grace"), ref);
    await page.getByRole("heading", { name: "Payout delayed" }).waitFor({ timeout: 12000 });
    await snap(page, "01-payout-delayed");
    check(flow, (await page.getByRole("button", { name: "Claim Protection" }).count()) === 0, `${vp}: no Claim button while the chain says the protection has not unlocked`);
    await world(page, (id) => window.__world.setState(id, "Claimable"), ref);
    await page.getByRole("heading", { name: "Protection available" }).waitFor({ timeout: 12000 });
    await page.getByRole("button", { name: "Claim Protection" }).waitFor();
    await snap(page, "02-protection-available");
    await click(page, "Claim Protection");
    await say(page, "Approve the claim in your wallet");
    await snap(page, "03-claiming");
    await page.getByRole("heading", { name: "Claimed" }).waitFor({ timeout: 15000 });
    await snap(page, "04-claimed");
    const c = await world(page, () => window.__world.count("claimProtection"));
    check(flow, c === 1, `${vp}: the claim was submitted exactly once, by the person`, String(c));
    await assertClean(flow, page, errors, vp);
    await ctx.close();
  },

  async "live-expired"(vp) {
    const flow = "live-expired";
    const { ctx, page, errors } = await open(vp, { path: "/app" });
    const snap = makeSnap(flow, vp, true, false);
    await say(page, "48.54");
    await connect(page);
    await click(page, "Start protected cash out");
    await say(page, "Ready to send", 20000);
    await world(page, (id) => window.__world.setState(id, "Expired"), idFromUrl(page));
    await page.getByRole("heading", { name: "Expired" }).waitFor({ timeout: 12000 });
    await snap(page, "01-expired");
    check(flow, (await page.getByRole("link", { name: "Start a new cash out" }).count()) > 0, `${vp}: offers to start again`);
    await assertClean(flow, page, errors, vp);
    await ctx.close();
  },

  // Demo: real Testnet payment, simulated bank failure -> the protection unlocks -> claim.
  async "demo-failure"(vp) {
    const flow = "demo-failure";
    const { ctx, page, errors } = await open(vp, { path: "/app/demo" });
    const snap = makeSnap(flow, vp, false, true);
    await say(page, "Choose a scenario");
    await page.getByRole("radio", { name: /Simulated payout failure/ }).click();
    await snap(page, "01-choose-failure");
    await connect(page);
    await click(page, "Start protected cash out");
    await say(page, "Ready to send", 20000);
    const ref = idFromUrl(page);
    check(flow, ref.startsWith("demo_failure_"), `${vp}: demo failure reference is recognised`, ref);
    await snap(page, "02-ready-to-send");
    await assertStorage(flow, page, vp, "demo", ref);
    await click(page, "Send 0.50 USDC");
    await say(page, "Protection active", 15000);
    await snap(page, "03-protection-active-simulated");
    await world(page, (id) => window.__world.setState(id, "Grace"), ref);
    await page.getByRole("heading", { name: "Payout delayed" }).waitFor({ timeout: 12000 });
    await world(page, (id) => window.__world.setState(id, "Claimable"), ref);
    await page.getByRole("button", { name: "Claim Protection" }).waitFor({ timeout: 12000 });
    await snap(page, "04-protection-available");
    await click(page, "Claim Protection");
    await page.getByRole("heading", { name: "Claimed" }).waitFor({ timeout: 15000 });
    await snap(page, "05-claimed");
    const calls = await world(page, () => window.__world.calls);
    check(flow, calls.includes("openDemoFailure") && !calls.includes("sep10Auth") && !calls.includes("sep6Withdraw"), `${vp}: the failure scenario never touches the anchor`);
    await assertClean(flow, page, errors, vp);
    await ctx.close();
  },

  async "demo-refund"(vp) {
    const flow = "demo-refund";
    const { ctx, page, errors } = await open(vp, { path: "/app/demo" });
    const snap = makeSnap(flow, vp, false, true);
    await say(page, "Choose a scenario");
    await page.getByRole("radio", { name: /Simulated principal return/ }).click();
    await connect(page);
    await click(page, "Start protected cash out");
    await say(page, "Ready to send", 20000);
    await click(page, "Send 0.50 USDC");
    await say(page, "Protection active", 15000);
    await page.getByRole("button", { name: "Simulate principal return" }).waitFor();
    await snap(page, "01-protection-active-simulate-return");
    await click(page, "Simulate principal return");
    await page.getByRole("heading", { name: "Principal returned" }).waitFor({ timeout: 15000 });
    await snap(page, "02-principal-returned");
    await assertClean(flow, page, errors, vp);
    await ctx.close();
  },

  async "demo-success"(vp) {
    const flow = "demo-success";
    const { ctx, page, errors } = await open(vp, { path: "/app/demo" });
    const snap = makeSnap(flow, vp, false, true);
    await say(page, "Choose a scenario");
    await connect(page);
    await click(page, "Start protected cash out");
    await say(page, "Ready to send", 20000);
    const ref = idFromUrl(page);
    await click(page, "Send 1.00 USDC");
    await say(page, "Protection active", 15000);
    await world(page, (id) => window.__world.setAnchor(id, "completed"), ref);
    await page.getByRole("heading", { name: "Settled" }).waitFor({ timeout: 20000 });
    await snap(page, "01-settled");
    await assertClean(flow, page, errors, vp);
    await ctx.close();
  },

  // Refreshing (or opening a link) at every stage: the chain alone decides what is shown.
  async "resume"(vp) {
    const flow = "resume";
    const { ctx, page, errors } = await open(vp, { path: "/app" });
    const snap = makeSnap(flow, vp, true, false);
    const seed = async (id, opts) => world(page, ([i, o]) => window.__world.make(i, o), [id, opts]);
    const states = [["Pending", "Protection active"], ["Grace", "Payout delayed"], ["Claimable", "Protection available"], ["Settled", "Settled"], ["Claimed", "Claimed"], ["Refunded", "Principal returned"], ["Expired", "Expired"]];
    for (const [tag, heading] of states) {
      const id = `sep_resume_${tag.toLowerCase()}`;
      await seed(id, { tag });
      await page.evaluate((p) => history.pushState({}, "", p) || window.dispatchEvent(new PopStateEvent("popstate")), `/app/cash-out/${id}`);
      await page.getByRole("heading", { name: heading }).waitFor({ timeout: 12000 });
      check(flow, true, `${vp}: ${tag} opened by link shows "${heading}" with no wallet connected`);
      if (["Claimable", "Grace", "Settled"].includes(tag)) await snap(page, `state-${tag.toLowerCase()}`);
      if (tag === "Claimable") {
        check(flow, (await page.getByRole("button", { name: "Connect wallet to claim" }).count()) === 1, `${vp}: Claimable without a wallet asks to connect before claiming`);
        await connect(page);
        await page.getByRole("button", { name: "Claim Protection" }).waitFor();
        check(flow, true, `${vp}: after connecting, Claim Protection is offered`);
      }
    }
    // an unfunded live protection opened earlier: never offer "Send" until we know no payment already exists
    await seed("sep_resume_unfunded", { tag: "AwaitingFunding" });
    await page.evaluate((p) => history.pushState({}, "", p) || window.dispatchEvent(new PopStateEvent("popstate")), "/app/cash-out/sep_resume_unfunded");
    await page.getByText("Sign in to continue").first().waitFor({ timeout: 12000 });
    check(flow, (await page.getByRole("button", { name: /^Send / }).count()) === 0, `${vp}: resumed unfunded cash out does not offer Send yet`);
    await snap(page, "unfunded-needs-anchor-sign-in");
    await click(page, "Sign in");
    await page.getByRole("button", { name: /^Send / }).waitFor({ timeout: 12000 });
    check(flow, true, `${vp}: after signing in with the payout partner, Send is offered`);
    await snap(page, "unfunded-can-send");
    // a payment that already exists must never be paid twice
    await seed("sep_resume_paid", { tag: "AwaitingFunding" });
    await world(page, () => window.__world.paid.add("sep_resume_paid"));
    await page.evaluate((p) => history.pushState({}, "", p) || window.dispatchEvent(new PopStateEvent("popstate")), "/app/cash-out/sep_resume_paid");
    await page.getByRole("heading", { name: /Protection active|Verifying funding/ }).waitFor({ timeout: 15000 });
    check(flow, (await page.getByRole("button", { name: /^Send / }).count()) === 0, `${vp}: an already-paid cash out is never offered "Send" again`);
    // unknown reference
    await page.evaluate((p) => history.pushState({}, "", p) || window.dispatchEvent(new PopStateEvent("popstate")), "/app/cash-out/does_not_exist");
    await page.getByText("We couldn't load this cash out").waitFor({ timeout: 15000 });
    await snap(page, "not-found");
    await assertClean(flow, page, errors, vp);
    await ctx.close();
  },

  // The app session expires mid-cash-out: say so plainly, one tap to continue.
  async "session-expiry"(vp) {
    const flow = "session-expiry";
    const { ctx, page, errors } = await open(vp, { path: "/app" });
    const snap = makeSnap(flow, vp, true, false);
    await say(page, "48.54");
    await connect(page);
    await click(page, "Start protected cash out");
    await say(page, "Ready to send", 20000);
    const ref = idFromUrl(page);
    await click(page, "Send 1.00 USDC");
    await say(page, "Protection active", 15000);
    await world(page, (id) => { window.__world.sessionRevoked = true; window.__world.setAnchor(id, "completed"); }, ref);
    await page.getByText("Your sign-in expired").first().waitFor({ timeout: 15000 });
    await snap(page, "01-sign-in-expired");
    await world(page, () => { window.__world.sessionRevoked = false; });
    await click(page, "Sign in again");
    await page.getByRole("heading", { name: "Settled" }).waitFor({ timeout: 20000 });
    await snap(page, "02-settled-after-sign-in");
    await assertClean(flow, page, errors, vp);
    await ctx.close();
  },

  // The anchor reports the payout complete before Stellar has recorded the settlement: one consistent message.
  async "live-finalizing"(vp) {
    const flow = "live-finalizing";
    const { ctx, page, errors } = await open(vp, { path: "/app" });
    const snap = makeSnap(flow, vp, true, false);
    await say(page, "48.54");
    await connect(page);
    await page.waitForFunction(() => [...document.querySelectorAll("button")].find((b) => /Start protected/.test(b.textContent) && !b.disabled), null, { timeout: 15000 });
    await world(page, () => { window.__world.holdSettlement = true; });
    await click(page, "Start protected cash out");
    await say(page, "Ready to send", 20000);
    const ref = idFromUrl(page);
    await click(page, "Send 1.00 USDC");
    await say(page, "Protection active", 15000);
    await world(page, (id) => window.__world.setAnchor(id, "pending_anchor"), ref);
    await say(page, "Your bank payout is being processed", 12000);
    check(flow, !/payout completed/i.test(await bodyText(page)), `${vp}: payout processing -> the card does not say completed`);
    await world(page, (id) => window.__world.setAnchor(id, "completed"), ref);
    await say(page, "Finalizing protection", 15000);
    await snap(page, "01-payout-completed-finalizing");
    const text = await bodyText(page);
    const t = await timeline(page);
    check(flow, /Your bank payout completed\. Finalizing protection/.test(text), `${vp}: anchor completed, settlement pending -> "Your bank payout completed. Finalizing protection…"`);
    check(flow, !/being processed/i.test(text), `${vp}: ...and nothing says it is still being processed`);
    check(flow, stateOf(t, "Fiat payout processing") === "In progress", `${vp}: the timeline is still on the payout step until Stellar settles`, JSON.stringify(t));
    check(flow, (await page.getByRole("button", { name: /Claim Protection/ }).count()) === 0, `${vp}: no Claim while the payout is known complete`);
    await assertClean(flow, page, errors, vp);
    await ctx.close();
  },

  // Provider liquidity limits the amount before anything is sent; the backend's 409 stays the fallback.
  async "capacity"(vp) {
    const flow = "capacity";
    const { ctx, page, errors } = await open(vp, { path: "/app", liquidity: "10197233" }); // 1.0197233 USDC
    const snap = makeSnap(flow, vp, true, false);
    await say(page, "up to 1.01 USDC");
    await connect(page);
    await page.waitForFunction(() => [...document.querySelectorAll("button")].find((b) => /Start protected/.test(b.textContent) && !b.disabled), null, { timeout: 15000 });
    const start = page.getByRole("button", { name: "Start protected cash out" });
    check(flow, !(await start.isDisabled()), `${vp}: an amount within capacity can start`);
    await page.getByLabel("You send").fill("2");
    await say(page, "Protection capacity is currently 1.01 USDC.");
    check(flow, await start.isDisabled(), `${vp}: an amount above capacity disables Start`);
    await snap(page, "01-over-capacity");
    check(flow, (await world(page, () => window.__world.count("openLiveProtection"))) === 0, `${vp}: nothing was sent to the backend`);
    await page.getByLabel("You send").fill("1.02");
    await say(page, "Protection capacity is currently 1.01 USDC.");
    await page.getByLabel("You send").fill("1.01");
    await page.waitForFunction(() => !document.body.innerText.includes("Protection capacity is currently"));
    // (the wallet re-checks its balance for the new amount, so Start may take a moment to come back)
    const allowed = await page.waitForFunction(() => [...document.querySelectorAll("button")].find((b) => /Start protected/.test(b.textContent) && !b.disabled), null, { timeout: 8000 }).then(() => true, () => false);
    check(flow, allowed, `${vp}: exactly the capacity is allowed`);
    // the backend's answer stays the authority if the balance moved in the meantime
    await world(page, () => { window.__world.fail.open = "Protection liquidity is temporarily insufficient. Available: 0.5 USDC."; });
    await click(page, "Start protected cash out");
    await say(page, "Protection isn't available right now", 15000);
    await snap(page, "02-backend-409-fallback");
    await assertClean(flow, page, errors, vp);
    await ctx.close();
  },

  // If the balance can't be read, only the product cap applies (and the backend still checks the rest).
  async "capacity-unavailable"(vp) {
    const flow = "capacity-unavailable";
    const { ctx, page, errors } = await open(vp, { path: "/app", liquidity: null });
    await say(page, "up to 2.00 USDC");
    await connect(page);
    await page.getByLabel("You send").fill("2.5");
    await say(page, "Protection capacity is currently 2.00 USDC.");
    check(flow, await page.getByRole("button", { name: "Start protected cash out" }).isDisabled(), `${vp}: the product cap still applies when liquidity is unknown`);
    await assertClean(flow, page, errors, vp);
    await ctx.close();
  },

  async "errors"(vp) {
    const flow = "errors";
    const { ctx, page, errors } = await open(vp, { path: "/app" });
    const snap = makeSnap(flow, vp, true, false);
    await say(page, "48.54");
    await world(page, () => { window.__world.wallet.rejectNext = "User declined access"; });
    await click(page, "Connect wallet");
    await say(page, "You closed the wallet request");
    await snap(page, "01-wallet-closed");
    await connect(page);
    await world(page, () => { window.__world.fail.open = "too_many_active_protections_for_wallet"; });
    await click(page, "Start protected cash out");
    await say(page, "You already have cash outs in progress", 15000);
    await snap(page, "02-too-many-cash-outs");
    await world(page, () => { window.__world.fail.withdraw = 'SEP-6 withdraw failed: {"error":"Minimum off-ramp is 1.0000000 USDC"}'; });
    await click(page, "Start protected cash out");
    await say(page, "The minimum cash out is 1 USDC", 15000);
    // amount validation happens before anything is sent
    await page.getByLabel("You send").fill("0.5");
    await say(page, "The minimum is 1 USDC.");
    check(flow, await page.getByRole("button", { name: "Start protected cash out" }).isDisabled(), `${vp}: below-minimum amount disables Start`);
    await page.getByLabel("You send").fill("2.5");
    await say(page, "Protection capacity is currently 2.00 USDC.");
    check(flow, await page.getByRole("button", { name: "Start protected cash out" }).isDisabled(), `${vp}: an amount above capacity disables Start`);
    await snap(page, "03-amount-over-limit");
    await assertClean(flow, page, errors, vp);
    await ctx.close();
  },

  async "mobile-wallet"() {
    const flow = "mobile-wallet";
    const { ctx, page } = await open("mobile", { path: "/app", mobileUA: true });
    const snap = makeSnap(flow, "mobile", true, false);
    await say(page, "Open this on a desktop browser");
    await snap(page, "01-desktop-wallet-required");
    check(flow, await page.getByRole("button", { name: "Connect wallet" }).last().isDisabled(), "mobile browser: Connect is disabled (no wallet can connect there)");
    await ctx.close();
  },
};

const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
for (const [name, fn] of Object.entries(FLOWS)) {
  if (only && !only.test(name)) continue;
  for (const vp of name === "mobile-wallet" ? ["mobile"] : ["desktop", "mobile"]) {
    const started = Date.now();
    try {
      await fn(vp);
      console.log(`      ${name} @ ${vp} done in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (e) {
      const onScreen = current ? await current.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 420)).catch(() => "") : "";
      check(name, false, `${vp}: flow crashed`, `${String(e).split("\n")[0]} | on screen: ${onScreen}`);
    }
  }
}
await browser.close();
stopVite();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length} checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
