// Browser tests for the landing page (`/`). Real Chrome against the real page; the page is static, so nothing is
// mocked. Checks what the page says and links to, how it lays out and moves (pinned scene, mobile, reduced motion),
// that it works with the keyboard, and that its text is readable. Writes screenshots to tools/landing/out/.
// usage: node --experimental-strip-types tools/landing/run.mjs       (starts its own Vite on :5196)
// env:   ONLY=<regex> limits groups · PARITY_CHROME_PATH=<binary> overrides the installed Chrome
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CLAIMED_RECORD, CONTRACT_ID, SETTLED_RECORD, explorerContract, explorerTx } from "../../src/features/landing/proof.ts";
import { METRICS, PRICING, TECHNICAL, UNVERIFIED } from "../../src/features/landing/integrity.ts";

const HERE = import.meta.dirname;
const WEB = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "out");
const PORT = 5196;
const BASE = `http://localhost:${PORT}`;
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

const results = [];
const check = (group, ok, msg, extra = "") => {
  results.push({ group, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  [${group}] ${msg}${extra && !ok ? "  — " + extra : ""}`);
};
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

// ------------------------------------------------------------------------------------------------ infrastructure
fs.rmSync(OUT, { recursive: true, force: true });
const vite = spawn(process.execPath, [path.join(WEB, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"], { cwd: WEB, stdio: "ignore" });
process.on("exit", () => vite.kill("SIGTERM"));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE + "/")).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch({ ...(process.env.PARITY_CHROME_PATH ? { executablePath: process.env.PARITY_CHROME_PATH } : { channel: "chrome" }), headless: true });

async function open({ viewport = DESKTOP, reducedMotion = false, mobile = false } = {}) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1.5,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    ...(mobile ? { hasTouch: true, isMobile: true } : {}),
  });
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 160)));
  page.on("console", (m) => m.type() === "error" && problems.push("console: " + m.text().slice(0, 160)));
  page.on("requestfailed", (r) => problems.push("request failed: " + r.url().slice(0, 120)));
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForSelector("h1");
  return { ctx, page, problems };
}

const shot = async (page, dir, name) => {
  fs.mkdirSync(path.join(OUT, dir), { recursive: true });
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(OUT, dir, `${name}.png`) });
};
const sectionBox = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    const r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, height: r.height };
  }, selector);
const scrollTo = async (page, y) => {
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(160);
};
/** Scroll down the whole page in steps so everything that reveals on scroll has revealed. */
async function scrollThrough(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = Math.round((await page.evaluate(() => window.innerHeight)) * 0.6);
  for (let y = 0; y < height; y += step) {
    await scrollTo(page, y);
    await page.waitForTimeout(60);
  }
  await scrollTo(page, height);
  await page.waitForTimeout(900);
  await scrollTo(page, 0);
}
/** The number a registered custom property currently computes to on the first matching element. */
const cssNumber = (page, selector, prop, nth = 0) => page.evaluate(([s, p, n]) => parseFloat(getComputedStyle(document.querySelectorAll(s)[n]).getPropertyValue(p)), [selector, prop, nth]);

const GROUPS = {
  // ---------------------------------------------------------------------------------------------------------------
  async "first-screen"() {
    for (const [name, viewport, mobile] of [["desktop 1280x800", { width: 1280, height: 800 }, false], ["phone 390x844", PHONE, true], ["small phone 360x640", { width: 360, height: 640 }, true]]) {
      const { ctx, page, problems } = await open({ viewport, mobile });
      const g = "first-screen";
      check(g, (await page.$$("h1")).length === 1, `${name}: exactly one h1`);
      check(g, (await page.textContent("h1")) === "Cash out with confidence.", `${name}: the h1 is "Cash out with confidence."`);
      check(g, (await page.title()) === "Cash out with confidence. · PayoutLock", `${name}: the tab title`, await page.title());
      const seen = await page.evaluate(() => {
        const inView = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
        };
        const testnet = [...document.querySelectorAll("body *")].filter((el) => /Testnet/.test(el.textContent ?? "") && ![...el.children].some((c) => /Testnet/.test(c.textContent ?? "")));
        const link = (label) => [...document.querySelectorAll("a")].filter((a) => a.textContent.trim() === label);
        return {
          testnet: testnet.some(inView),
          h1: inView(document.querySelector("h1")),
          demoAnywhere: link("Launch Demo").some(inView),
          heroDemo: link("Launch Demo").filter((a) => a.closest("section")).some(inView),
        };
      });
      check(g, seen.testnet, `${name}: "Testnet" is on the first screen`);
      check(g, seen.h1, `${name}: the headline fits on the first screen`);
      check(g, seen.demoAnywhere, `${name}: Launch Demo is reachable on the first screen`);
      if (viewport.height >= 800) check(g, seen.heroDemo, `${name}: the hero's Launch Demo is on the first screen`);
      check(g, problems.length === 0, `${name}: no console errors, page errors or failed requests`, problems.join(" | "));
      await ctx.close();
    }
  },

  // ---------------------------------------------------------------------------------------------------------------
  async "hero"() {
    const g = "hero";
    const rects = (page) =>
      page.evaluate(() => {
        const box = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
        };
        const q = (s) => document.querySelector(s);
        const card = q("[data-hero-card]");
        const demo = [...document.querySelectorAll('[data-section="hero"] a')].find((a) => a.textContent.trim() === "Launch Demo");
        return {
          vh: window.innerHeight,
          vw: window.innerWidth,
          hero: box(q('[data-section="hero"]')),
          text: box(q("[data-hero-text]")),
          h1: box(q("h1")),
          h1Size: parseFloat(getComputedStyle(q("h1")).fontSize),
          demo: box(demo),
          visual: box(q("[data-hero-visual]")),
          chip: box(q("[data-hero-chip] > span")),
          payout: box(q("[data-hero-payout] > div")),
          // the card's content, which nothing may cover: its header row, its amounts, its progress and step label
          cardContent: [...card.querySelectorAll(":scope > div > *")].map(box),
          next: box(q('[data-section="gap"]')),
        };
      });
    const overlaps = (a, b) => a && b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

    for (const [name, viewport] of [["1280x900", DESKTOP], ["1440x900", { width: 1440, height: 900 }]]) {
      const { ctx, page, problems } = await open({ viewport });
      await page.waitForTimeout(1400);
      const r = await rects(page);
      check(g, r.visual.left >= r.text.right - 1 && r.visual.top < r.text.bottom && r.text.top < r.visual.bottom, `${name}: product first — the words on the left, the product beside them`, JSON.stringify({ text: r.text, visual: r.visual }));
      check(g, r.visual.top >= 0 && r.visual.bottom <= r.vh, `${name}: the whole product visual is on the first screen`, `${Math.round(r.visual.top)}–${Math.round(r.visual.bottom)} of ${r.vh}`);
      check(g, r.demo.bottom <= r.vh && r.h1.top >= 0, `${name}: headline and Launch Demo on the first screen`);
      check(g, r.hero.bottom <= r.vh && r.next.top <= r.vh, `${name}: the hero ends on the first screen — the next section starts in view (no empty screen)`, `hero ends at ${Math.round(r.hero.bottom)}`);
      check(g, r.h1Size >= 48 && r.h1Size <= 64, `${name}: the headline is large, not oversized (48–64px)`, `${r.h1Size}px`);
      check(g, !r.cardContent.some((c) => overlaps(c, r.payout) || overlaps(c, r.chip)), `${name}: the layered pieces sit on the card's edges, never on its content`);
      check(g, problems.length === 0, `${name}: no errors`, problems.join(" | "));
      if (name === "1280x900") {
        const content = await page.evaluate(() => {
          const v = document.querySelector("[data-hero-visual]");
          const bars = [...v.querySelectorAll("ol > li > span:first-child")].map((s) => s.style.transform);
          const glow = v.querySelector(".pl-glow");
          return {
            role: v.getAttribute("role"),
            label: v.getAttribute("aria-label") ?? "",
            text: v.textContent,
            bars,
            raster: v.querySelectorAll("img, picture, canvas, video, iframe").length,
            glow: parseFloat(getComputedStyle(glow).opacity),
            travel: getComputedStyle(v.querySelector(".pl-travel")).animationName,
          };
        });
        for (const words of ["1.00", "USDC", "Protection active", "Protection", "Covered until your bank payout arrives", "Bank payout", "Processing", "Fiat payout processing", "Step 4 of 5", "Payment verified on Stellar"]) {
          check(g, content.text.includes(words), `the product shows "${words}"`);
        }
        check(g, JSON.stringify(content.bars) === JSON.stringify(["scaleX(1)", "scaleX(1)", "scaleX(1)", "scaleX(0.5)", "scaleX(0)"]), "lifecycle progress: three steps done, the payout in progress, the outcome ahead", content.bars.join(" "));
        check(g, content.role === "img" && /1\.00 USDC/.test(content.label) && /processing/.test(content.label), "assistive technology hears one described picture", content.label);
        check(g, /Illustration/.test(content.text), 'it is labelled an illustration');
        check(g, content.raster === 0, "it is drawn from the design system, not a screenshot (no images)");
        check(g, content.glow > 0 && content.glow <= 0.3, "the glow is restrained", String(content.glow));
        check(g, content.travel === "pl-travel", "the value travels along the bank-payout line");
        await shot(page, "hero", "desktop-1280");
      } else {
        await shot(page, "hero", "desktop-1440");
      }
      await ctx.close();
    }

    for (const [name, viewport] of [["390x844", PHONE], ["360x640", { width: 360, height: 640 }], ["768x1024", { width: 768, height: 1024 }]]) {
      const { ctx, page } = await open({ viewport, mobile: viewport.width < 700 });
      await page.waitForTimeout(1400);
      const r = await rects(page);
      check(g, r.visual.top >= r.demo.bottom, `${name}: the product follows the calls to action`);
      check(g, r.visual.left >= 0 && r.visual.right <= r.vw, `${name}: the product fits the screen`, `${Math.round(r.visual.left)}–${Math.round(r.visual.right)} of ${r.vw}`);
      check(g, r.demo.bottom <= r.vh, `${name}: Launch Demo on the first screen`);
      check(g, !r.cardContent.some((c) => overlaps(c, r.payout) || overlaps(c, r.chip)), `${name}: the layered pieces never cover the card's content`);
      if (name === "390x844") {
        check(g, r.visual.top < r.vh, `${name}: the product starts on the first screen`, `${Math.round(r.visual.top)} of ${r.vh}`);
        await shot(page, "hero", "mobile-390");
        const box = await page.evaluate(() => { const b = document.querySelector('[data-section="hero"]').getBoundingClientRect(); return { x: b.x, y: b.y + window.scrollY, width: b.width, height: b.height }; });
        fs.mkdirSync(path.join(OUT, "hero"), { recursive: true });
        await page.screenshot({ path: path.join(OUT, "hero", "mobile-390-whole-hero.png"), fullPage: true, clip: box });
      }
      if (name === "768x1024") await shot(page, "hero", "tablet-768");
      await ctx.close();
    }
  },

  // ---------------------------------------------------------------------------------------------------------------
  async "integrity"() {
    const g = "integrity";
    const { ctx, page } = await open();
    await scrollThrough(page);
    const page_ = await page.evaluate(() => {
      const attrs = [...document.querySelectorAll("[aria-label],[title],[alt]")].flatMap((el) => [el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("alt")].filter(Boolean));
      const sections = [...document.querySelectorAll("[data-section]")].map((el) => ({ id: el.getAttribute("data-section"), technical: el.hasAttribute("data-technical"), text: el.textContent }));
      const header = document.querySelector("header");
      return { text: document.body.textContent, attrs, sections, header: header?.textContent ?? "" };
    });
    const everything = [page_.text, ...page_.attrs].join("\n");
    check(g, !UNVERIFIED.test(everything), "nothing on the page makes an unverifiable claim (insured, guaranteed, trustless, Mainnet, percentages...)", (everything.match(UNVERIFIED) ?? [])[0]);
    check(g, !PRICING.test(everything), "no price, rate or fee amount appears", (everything.match(PRICING) ?? [])[0]);
    check(g, !METRICS.test(everything), "no user, customer or volume figure appears", (everything.match(METRICS) ?? [])[0]);
    check(g, !/guarantee/i.test(everything), 'nobody is called a "Guarantee Provider" here');
    check(g, /protection provider/i.test(everything), 'the role is called a "protection provider"');
    check(g, /Testnet/.test(page_.text) && /not a live financial service/.test(page_.text), "Testnet and 'not a live financial service' are stated on the page");
    check(g, /Business model hypothesis/.test(page_.text) && /hasn't been validated/.test(page_.text), "the business model is labelled a hypothesis and pricing as unvalidated");
    check(g, !/\b(we|PayoutLock) (currently )?(charge|charges)\b/i.test(page_.text), "no line says PayoutLock charges anything today");
    const ids = page_.sections.map((s) => s.id);
    check(g, JSON.stringify(ids) === JSON.stringify(["hero", "gap", "product", "business", "verify", "developers", "final", "footer"]), "sections appear in the planned order", ids.join(" > "));
    for (const section of page_.sections) {
      const technical = section.technical;
      if (technical) continue;
      check(g, !TECHNICAL.test(section.text), `"${section.id}" uses no infrastructure words`, (section.text.match(TECHNICAL) ?? [])[0]);
    }
    check(g, !TECHNICAL.test(page_.header), "the navigation uses no infrastructure words");
    check(g, page_.sections.filter((s) => s.technical).map((s) => s.id).join() === "verify,developers", "only the verification and developer sections are technical");
    check(g, /Soroban/.test(page_.sections.find((s) => s.id === "developers").text) && /contract/i.test(page_.sections.find((s) => s.id === "verify").text), "...and the infrastructure words did go there");
    await ctx.close();
  },

  // ---------------------------------------------------------------------------------------------------------------
  async "links"() {
    const g = "links";
    const { ctx, page } = await open();
    const links = await page.evaluate(() =>
      [...document.querySelectorAll("a")].map((a) => ({ text: a.textContent.trim(), label: a.getAttribute("aria-label") ?? "", href: a.getAttribute("href") ?? "", target: a.getAttribute("target"), rel: a.getAttribute("rel") ?? "", bg: getComputedStyle(a).backgroundColor, border: getComputedStyle(a).borderTopWidth, inHero: !!a.closest('[data-section="hero"]'), inFinal: !!a.closest('[data-section="final"]') })),
    );
    const heroDemo = links.find((l) => l.inHero && l.text === "Launch Demo");
    const heroApp = links.find((l) => l.inHero && l.text === "Open App");
    check(g, heroDemo?.href === "/app/demo", "the hero's primary call to action, Launch Demo, opens /app/demo");
    check(g, heroApp?.href === "/app", "the hero's secondary call to action, Open App, opens /app");
    check(g, heroDemo && heroApp && heroDemo.bg === "rgb(11, 18, 32)" && heroApp.bg === "rgb(255, 255, 255)" && heroApp.border !== "0px", "Launch Demo is the dark primary button; Open App is the light, outlined secondary");
    check(g, links.filter((l) => l.text === "Developer Console").every((l) => l.href === "/developer") && links.filter((l) => l.text === "Developer Console").length >= 3, "Developer Console links go to /developer, and it is offered in the hero, the developers' section and the footer");
    const finalDemo = links.find((l) => l.inFinal && l.text === "Launch Demo");
    check(g, finalDemo?.href === "/app/demo" && links.find((l) => l.inFinal && l.text === "Open App")?.href === "/app", "the closing call to action repeats the same order");
    const external = links.filter((l) => /^https?:/.test(l.href));
    const expected = [explorerContract(CONTRACT_ID), explorerTx(SETTLED_RECORD.outcomeTx), explorerTx(CLAIMED_RECORD.outcomeTx)].sort();
    check(g, JSON.stringify(external.map((l) => l.href).sort()) === JSON.stringify(expected), "the only outside links are the real contract and the two real transactions", external.map((l) => l.href).join(" "));
    check(g, external.every((l) => l.target === "_blank" && /noopener|noreferrer/.test(l.rel)), "outside links open in a new tab, safely");
    check(g, links.every((l) => l.href && l.href !== "#"), "every link goes somewhere");
    check(g, links.every((l) => l.text || l.label), "every link has a name");
    const targets = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map((a) => [a.getAttribute("href"), !!document.querySelector(a.getAttribute("href"))]));
    check(g, targets.length >= 5 && targets.every(([, exists]) => exists), "every in-page link has a target", targets.filter(([, e]) => !e).map(([h]) => h).join());
    // going through a link works, client-side
    await page.getByRole("link", { name: "Launch Demo" }).first().click();
    await page.waitForURL("**/app/demo");
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Demo scenarios", null, { timeout: 15000 });
    check(g, true, "Launch Demo opens the demo scenarios");
    await ctx.close();
  },

  // ---------------------------------------------------------------------------------------------------------------
  async "layout"() {
    const g = "layout";
    for (const width of [360, 390, 768, 1024, 1280, 1440]) {
      const { ctx, page } = await open({ viewport: { width, height: 800 } });
      await scrollThrough(page);
      const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      check(g, sw <= iw, `${width}px: no horizontal overflow`, `${sw} > ${iw}`);
      const wide = await page.evaluate(() => [...document.querySelectorAll("[data-section] *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(el).position !== "fixed").slice(0, 3).map((el) => el.tagName + "." + String(el.className).slice(0, 40)));
      check(g, wide.length === 0, `${width}px: nothing pokes out of the screen`, wide.join(", "));
      await ctx.close();
    }
    {
      const { ctx, page } = await open();
      const h = await page.evaluate(() => [...document.querySelectorAll("h1,h2,h3,h4")].map((h) => Number(h.tagName[1])));
      check(g, h[0] === 1 && h.every((level, i) => i === 0 || level - h[i - 1] <= 1), "headings never skip a level", h.join(""));
      check(g, (await page.$$("main")).length === 1 && (await page.$$("header")).length === 1 && (await page.$$("footer")).length === 1, "one header, one main, one footer");
      await ctx.close();
    }
  },

  // ---------------------------------------------------------------------------------------------------------------
  async "gap-desktop"() {
    const g = "gap-desktop";
    for (const [name, viewport] of [["1280x900", DESKTOP], ["1440x790", { width: 1440, height: 790 }]]) {
      const { ctx, page, problems } = await open({ viewport });
      await page.waitForTimeout(400);
      const geo = await page.evaluate(() => {
        const track = document.querySelector("[data-gap-track]");
        const panel = document.querySelector("[data-gap-panel]");
        const section = document.querySelector('[data-section="gap"]');
        const r = track.getBoundingClientRect();
        return {
          trackTop: r.top + window.scrollY,
          trackH: r.height,
          panelH: panel.offsetHeight,
          sectionH: section.getBoundingClientRect().height,
          position: getComputedStyle(panel).position,
          stickyTop: parseFloat(getComputedStyle(panel).top),
          headlines: section.querySelectorAll("h2").length,
          panelBg: getComputedStyle(panel).backgroundColor,
          sectionBg: getComputedStyle(section).backgroundColor,
          panelWidth: panel.getBoundingClientRect().width,
        };
      });
      const vh = viewport.height;
      check(g, geo.position === "sticky", `${name}: one short pinned moment`);
      check(g, geo.sectionH >= vh && geo.sectionH <= vh * 1.55, `${name}: the section is about 1–1.5 screens tall`, `${(geo.sectionH / vh).toFixed(2)} screens`);
      check(g, geo.trackH - geo.panelH <= vh * 0.55, `${name}: it holds for about half a screen of scrolling, no more`, `${Math.round(geo.trackH - geo.panelH)}px`);
      check(g, geo.panelH + 32 <= vh, `${name}: the whole panel is on screen while it holds`);
      check(g, geo.headlines === 1, `${name}: one headline`);
      check(g, geo.panelBg === "rgb(7, 11, 20)" && geo.sectionBg === "rgba(0, 0, 0, 0)" && geo.panelWidth < viewport.width - 40, `${name}: a dark panel inset on the warm page, not a full-bleed band`);

      const at = async (f) => {
        await scrollTo(page, geo.trackTop - geo.stickyTop + f * (geo.trackH - geo.panelH));
        await page.waitForTimeout(140);
        return page.evaluate(() => {
          const line = document.querySelector('[data-section="gap"] .pl-line');
          const num = (prop) => parseFloat(getComputedStyle(line).getPropertyValue(prop));
          return {
            chain: num("--chain"),
            gap: num("--gp"),
            band: num("--band"),
            phases: [...document.querySelectorAll("[data-gap-phase]")].map((el) => parseFloat(getComputedStyle(el).opacity)),
            failure: parseFloat(getComputedStyle(document.querySelector("[data-gap-failure]")).opacity),
            panelTop: document.querySelector("[data-gap-panel]").getBoundingClientRect().top,
          };
        });
      };
      const s0 = await at(0);
      const s1 = await at(0.3);
      const s2 = await at(0.55);
      const s3 = await at(1);
      check(g, s0.chain === 0 && s0.gap === 0 && s0.band === 0, `${name}: it starts with the line undrawn`, JSON.stringify(s0));
      check(g, s1.chain === 1 && s1.gap > 0 && s1.gap < 1 && s1.band === 0, `${name}: USDC settles, then the gap opens — with nothing under it yet`, JSON.stringify(s1));
      check(g, s2.gap === 1 && s2.band > 0 && s2.band < 1, `${name}: then protection draws under the gap`, JSON.stringify(s2));
      check(g, s3.chain === 1 && s3.gap === 1 && s3.band === 1 && s3.phases.every((o) => o === 1) && s3.failure === 1, `${name}: at the end everything is drawn and at full strength`, JSON.stringify(s3));
      check(g, s1.failure < 0.5 && s2.failure < 0.5, `${name}: the claim path comes last`, `${s1.failure}, ${s2.failure}`);
      const lowest = Math.min(...[s0, s1, s2, s3].flatMap((s) => [...s.phases, s.failure]));
      check(g, lowest >= 0.39, `${name}: captions are dimmed before their moment, never hidden`, String(lowest));
      check(g, Math.abs(s1.panelTop - geo.stickyTop) < 1.5 && Math.abs(s2.panelTop - geo.stickyTop) < 1.5, `${name}: the panel holds still while the line draws`);
      const back = await at(0.3);
      check(g, back.band === 0 && back.gap < 1, `${name}: scrolling back rewinds it (native scroll, nothing hijacked)`);
      if (name === "1280x900") {
        for (const [f, label] of [[0.02, "01-start"], [0.3, "02-gap-opens"], [0.58, "03-protection"], [1, "04-claim-path"]]) {
          await at(f);
          await shot(page, "desktop", `02-gap-${label}`);
        }
      }
      check(g, problems.length === 0, `${name}: no errors`, problems.join(" | "));
      await ctx.close();
    }
    {
      // a window too short to hold the panel: no pin, it simply scrolls, and the line still finishes
      const { ctx, page } = await open({ viewport: { width: 1280, height: 700 } });
      const position = await page.evaluate(() => getComputedStyle(document.querySelector("[data-gap-panel]")).position);
      check(g, position !== "sticky", "1280x700: too short to hold the panel, so nothing pins");
      await scrollThrough(page);
      const box = await sectionBox(page, '[data-section="gap"]');
      await scrollTo(page, box.top + box.height - 400);
      const band = await cssNumber(page, '[data-section="gap"] .pl-line', "--band");
      check(g, band === 1, "1280x700: the line is finished once it has scrolled past", String(band));
      await ctx.close();
    }
  },

  // ---------------------------------------------------------------------------------------------------------------
  async "gap-phone"() {
    const g = "gap-phone";
    const { ctx, page, problems } = await open({ viewport: PHONE, mobile: true });
    const info = await page.evaluate(() => {
      const section = document.querySelector('[data-section="gap"]');
      return {
        sticky: [...section.querySelectorAll("*")].filter((el) => getComputedStyle(el).position === "sticky").length,
        orient: section.querySelector(".pl-line").dataset.orient,
        phases: section.querySelectorAll("[data-gap-phase]").length,
        badges: [...section.querySelectorAll("[data-gap-failure] ol > li")].map((li) => li.getBoundingClientRect().top),
      };
    });
    check(g, info.sticky === 0, "on a phone nothing is pinned");
    check(g, info.orient === "v", "the line runs top to bottom");
    check(g, info.phases === 3, "the three phases are ordinary text");
    check(g, info.badges.length === 5 && info.badges.every((t, i) => i === 0 || t > info.badges[i - 1]), "the claim path reads top to bottom");
    const line = await page.evaluate(() => { const r = document.querySelector('[data-section="gap"] .pl-line').getBoundingClientRect(); return { top: r.top + window.scrollY }; });
    const drawnAt = async (fraction) => {
      await scrollTo(page, line.top - PHONE.height * fraction);
      return { chain: await cssNumber(page, '[data-section="gap"] .pl-line', "--chain"), gap: await cssNumber(page, '[data-section="gap"] .pl-line', "--gp"), band: await cssNumber(page, '[data-section="gap"] .pl-line', "--band") };
    };
    const entering = await drawnAt(0.95);
    const middle = await drawnAt(0.55);
    const passed = await drawnAt(-0.4);
    check(g, entering.chain === 0, "the line arrives undrawn", JSON.stringify(entering));
    check(g, middle.chain > 0 && (middle.gap < 1 || middle.band < 1), "it draws as it crosses the screen", JSON.stringify(middle));
    check(g, passed.chain === 1 && passed.gap === 1 && passed.band === 1, "and is finished once it has gone by", JSON.stringify(passed));
    check(g, problems.length === 0, "no errors", problems.join(" | "));
    await ctx.close();
  },

  // ---------------------------------------------------------------------------------------------------------------
  async "product"() {
    const g = "product";
    const { ctx, page, problems } = await open();
    await scrollThrough(page);
    const box = await sectionBox(page, '[data-section="product"]');
    await scrollTo(page, box.top + 40);
    const stage = () => page.getAttribute("[data-product-stage]", "data-product-stage");
    const surfaceText = () => page.textContent("[data-product-stage]");
    const tabs = page.getByRole("tablist", { name: "Ways a cash out can go" });
    const stepper = page.getByRole("group", { name: "Stages" });
    check(g, JSON.stringify(await tabs.getByRole("tab").allTextContents()).includes("Payout arrives") && (await tabs.getByRole("tab").count()) === 3, "three ways a cash out can go");
    check(g, (await stage()) === "ready", "it opens on Ready to send");
    const played = await page.waitForFunction(() => document.querySelector("[data-product-stage]")?.dataset.productStage === "active", null, { timeout: 5000 }).then(() => true, () => false);
    check(g, played, "on screen, the surface moves to the next stage by itself");

    // what each stage shows, and that the layers never cover the card's content
    const expected = {
      ready: ["Ready to send", "Send 1.00 USDC to start your protected payout.", "Step 2 of 5", "Not started"],
      active: ["Protection active", "covered while the bank payout is processed", "Step 4 of 5", "Processing"],
      settled: ["Settled", "Your bank payout completed.", "Step 5 of 5", "Arrived"],
      delayed: ["Payout delayed", "Taking longer than expected", "Delayed"],
      available: ["Protection available", "The deadline passed and nothing was returned", "Claim Protection"],
      claimed: ["Claimed", "Your protection paid 1.00 USDC to your wallet.", "Protection paid"],
      returned: ["Principal returned", "returned to your wallet", "Simulated bank payout"],
    };
    const seen = new Set();
    for (const [tab, stages] of [["Payout arrives", ["ready", "active", "settled"]], ["Payout doesn't arrive", ["delayed", "available", "claimed"]], ["Principal returned", ["active", "returned"]]]) {
      await tabs.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      for (const [i, id] of stages.entries()) {
        await stepper.getByRole("button").nth(i).click();
        await page.waitForFunction((want) => document.querySelector("[data-product-stage]")?.dataset.productStage === want, id);
        await page.waitForTimeout(450);
        const text = await surfaceText();
        const missing = expected[id].filter((w) => !text.includes(w));
        if (!(tab === "Principal returned" && id === "active")) check(g, missing.length === 0, `${tab} › ${id}: shows ${expected[id].join(" / ")}`, `missing ${missing.join(", ")}`);
        const r = await page.evaluate(() => {
          const box = (el) => el && el.getBoundingClientRect();
          const overlaps = (a, b) => a && b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const card = document.querySelector("[data-stage-card]");
          const content = [...card.querySelectorAll(".pl-state-in > *")].map(box);
          const payout = box(document.querySelector("[data-stage-payout] > div"));
          const chip = box(document.querySelector("[data-stage-chip] > span"));
          const surface = document.querySelector("[data-product-stage]");
          return {
            covered: content.some((c) => overlaps(c, payout) || overlaps(c, chip)),
            protectedLook: card.firstElementChild.className.includes("shadow-glow-seal"),
            claim: surface.textContent.includes("Claim Protection"),
            interactive: surface.querySelectorAll("a, button, input, [tabindex]").length,
            simulated: surface.textContent.includes("Simulated bank payout"),
          };
        });
        check(g, !r.covered, `${tab} › ${id}: the payout card and chip sit on the card's edges, never on its content`);
        check(g, r.protectedLook === ["active", "delayed", "available"].includes(id), `${tab} › ${id}: the protected treatment only while protection holds`);
        check(g, r.claim === (id === "available"), `${tab} › ${id}: Claim Protection appears only when protection is available`);
        check(g, r.interactive === 0, `${tab} › ${id}: the picture has nothing to click or tab to`);
        check(g, r.simulated === (tab === "Principal returned"), `${tab} › ${id}: "Simulated bank payout" exactly on the simulated path`);
        if (!seen.has(id)) {
          seen.add(id);
          await shot(page, "desktop", `05-product-${Object.keys(expected).indexOf(id) + 1}-${id}`);
        }
      }
    }
    check(g, (await tabs.getByRole("tab", { name: /^Principal returned/ }).textContent()).includes("Simulated outcome in the Testnet demo"), "the Principal returned path is labelled a simulated outcome in the Testnet demo");
    await page.waitForTimeout(3600);
    check(g, (await stage()) === "returned", "after someone picks a stage, it stops moving by itself");

    // choosing a path plays that path once, then holds
    await tabs.getByRole("tab", { name: /^Payout doesn't arrive/ }).click();
    const reachedClaim = await page.waitForFunction(() => document.querySelector("[data-product-stage]")?.dataset.productStage === "claimed", null, { timeout: 9000 }).then(() => true, () => false);
    check(g, reachedClaim, "choosing a path plays it through: Payout delayed → Protection available → Claimed");
    await page.waitForTimeout(4800);
    check(g, (await stage()) === "claimed", "...and then holds on its outcome");

    // keyboard
    await tabs.getByRole("tab", { name: /^Payout doesn't arrive/ }).focus();
    await page.keyboard.press("ArrowDown");
    check(g, (await tabs.getByRole("tab", { name: /^Principal returned/ }).getAttribute("aria-selected")) === "true", "the arrow keys move between the paths");
    check(g, problems.length === 0, "no errors", problems.join(" | "));
    await ctx.close();
  },

  // ---------------------------------------------------------------------------------------------------------------
  async "product-phone"() {
    const g = "product-phone";
    const { ctx, page, problems } = await open({ viewport: PHONE, mobile: true });
    await scrollThrough(page);
    const box = await sectionBox(page, '[data-section="product"]');
    const order = await page.evaluate(() => {
      const top = (s) => document.querySelector(s).getBoundingClientRect().top;
      const r = document.querySelector("[data-product-stage]").getBoundingClientRect();
      return { tabs: top('[role="tablist"][aria-label="Ways a cash out can go"]'), surface: r.top, left: r.left, right: r.right, vw: window.innerWidth };
    });
    check(g, order.tabs < order.surface, "the paths come first, then the product");
    check(g, order.left >= 0 && order.right <= order.vw, "the product fits the screen");
    const tabs = page.getByRole("tablist", { name: "Ways a cash out can go" });
    const stepper = page.getByRole("group", { name: "Stages" });
    for (const [tab, i, id] of [["Payout arrives", 1, "active"], ["Payout doesn't arrive", 1, "available"], ["Principal returned", 1, "returned"]]) {
      await tabs.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      await stepper.getByRole("button").nth(i).click();
      await page.waitForFunction((want) => document.querySelector("[data-product-stage]")?.dataset.productStage === want, id);
      await page.waitForTimeout(450); // the stage's crossfade
      const covered = await page.evaluate(() => {
        const box = (el) => el && el.getBoundingClientRect();
        const overlaps = (a, b) => a && b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        const content = [...document.querySelectorAll("[data-stage-card] .pl-state-in > *")].map(box);
        return content.some((c) => overlaps(c, box(document.querySelector("[data-stage-payout] > div"))) || overlaps(c, box(document.querySelector("[data-stage-chip] > span"))));
      });
      check(g, !covered, `${id}: nothing covers the card's content on a phone`);
      const surface = await page.evaluate(() => { const r = document.querySelector("[data-product-stage]").getBoundingClientRect(); return { top: r.top + window.scrollY }; });
      await scrollTo(page, surface.top - 24);
      await shot(page, "mobile", `05-product-${id}`);
    }
    void box;
    check(g, problems.length === 0, "no errors", problems.join(" | "));
    await ctx.close();
  },

  // ---------------------------------------------------------------------------------------------------------------
  async "reduced-motion"() {
    const g = "reduced-motion";
    for (const [name, viewport, mobile] of [["desktop", DESKTOP, false], ["phone", PHONE, true]]) {
      const { ctx, page, problems } = await open({ viewport, mobile, reducedMotion: true });
      const heroMotion = await page.evaluate(() => [...document.querySelectorAll('[data-section="hero"] .pl-rise, [data-section="hero"] .pl-glow, [data-section="hero"] .pl-travel')].map((el) => getComputedStyle(el).animationName));
      check(g, heroMotion.length >= 5 && heroMotion.every((n) => n === "none"), `${name}: the hero doesn't animate: it is in place on load`, heroMotion.join());
      const pinned = await page.evaluate(() => [...document.querySelectorAll('[data-section="gap"] *')].filter((el) => getComputedStyle(el).position === "sticky").length);
      check(g, pinned === 0, `${name}: nothing is pinned`);
      const line = await page.evaluate(() => ["--chain", "--gp", "--band"].map((p) => parseFloat(getComputedStyle(document.querySelector('[data-section="gap"] .pl-line')).getPropertyValue(p))));
      check(g, JSON.stringify(line) === "[1,1,1]", `${name}: the settlement line is complete from the start`, JSON.stringify(line));
      await scrollThrough(page);
      const box = await sectionBox(page, '[data-section="product"]');
      await scrollTo(page, box.top);
      const first = await page.getAttribute("[data-product-stage]", "data-product-stage");
      await page.waitForTimeout(3800);
      check(g, (await page.getAttribute("[data-product-stage]", "data-product-stage")) === first, `${name}: the product surface doesn't play by itself`);
      await page.getByRole("group", { name: "Stages" }).getByRole("button").nth(2).click();
      const crossfade = await page.evaluate(() => [...document.querySelectorAll(".pl-state-in")].map((el) => getComputedStyle(el).animationName));
      check(g, crossfade.length > 0 && crossfade.every((n) => n === "none"), `${name}: a chosen stage appears at once, without a crossfade`);
      const faded = await page.evaluate(() => {
        const bad = [];
        for (const el of document.querySelectorAll("[data-section] *")) {
          if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          let opacity = 1;
          for (let n = el; n && n !== document.body; n = n.parentElement) opacity *= parseFloat(getComputedStyle(n).opacity);
          if (opacity < 0.99) bad.push(el.textContent.trim().slice(0, 40) + ` (${opacity.toFixed(2)})`);
        }
        return bad;
      });
      check(g, faded.length === 0, `${name}: with less motion, no text is left faded out or hidden`, faded.slice(0, 3).join(" | "));
      if (name === "desktop") {
        await scrollTo(page, 0);
        fs.mkdirSync(path.join(OUT, "desktop"), { recursive: true });
        await page.screenshot({ path: path.join(OUT, "desktop", "00-full-page-at-rest.png"), fullPage: true });
        const gap = await sectionBox(page, '[data-section="gap"]');
        await scrollTo(page, gap.top);
        await shot(page, "reduced-motion", "desktop-gap");
        await scrollTo(page, box.top);
        await shot(page, "reduced-motion", "desktop-product");
      } else {
        const gap = await sectionBox(page, '[data-section="gap"]');
        await scrollTo(page, gap.top);
        await shot(page, "reduced-motion", "phone-gap");
      }
      check(g, problems.length === 0, `${name}: no errors`, problems.join(" | "));
      await ctx.close();
    }
  },

  // ---------------------------------------------------------------------------------------------------------------
  async "business-proof-dev"() {
    const g = "business-proof-dev";
    const within = (inner, outer) => inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;
    const overlaps = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    for (const [name, viewport, mobile] of [["desktop", DESKTOP, false], ["phone", PHONE, true]]) {
      const { ctx, page, problems } = await open({ viewport, mobile, reducedMotion: true });
      await page.waitForSelector('[data-section="developers"]');
      const r = await page.evaluate(() => {
        const box = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top + window.scrollY, bottom: b.bottom + window.scrollY, width: b.width, height: b.height }; };
        const q = (s) => document.querySelector(s);
        const qa = (s) => [...document.querySelectorAll(s)];
        return {
          businessTitle: q("#business-title").textContent,
          customers: qa("[data-customer]").map((el) => ({ id: el.dataset.customer, box: box(el), stage: box(el.firstElementChild), screen: box(el.firstElementChild.firstElementChild) })),
          businessText: q('[data-section="business"]').textContent,
          nodes: qa("[data-model-node]").map((el) => ({ id: el.dataset.modelNode, box: box(el) })),
          clippedLabels: qa("[data-business-model] ol span.whitespace-nowrap").filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > el.closest("[data-business-model]").getBoundingClientRect().right).map((el) => el.textContent),
          verifyTitle: q("#verify-title").textContent,
          receipts: qa("[data-receipt]").map((el) => ({ kind: el.dataset.receipt, box: box(el), text: el.textContent, links: [...el.querySelectorAll("a[href^='https://stellar.expert/']")].length })),
          dev: Object.fromEntries(qa("[data-dev-node]").map((el) => [el.dataset.devNode, box(el)])),
          devText: q('[data-section="developers"]').textContent,
          boundary: q("[data-dev-boundary]").textContent,
        };
      });
      // business
      check(g, r.businessTitle.includes("We don't replace wallets or off-ramp providers.") && r.businessTitle.includes("We add a protection layer to the cash-out flow they already run."), `${name}: the business message, word for word`);
      check(g, JSON.stringify(r.customers.map((c) => c.id)) === '["wallet","offramp"]', `${name}: the two customers are wallets and off-ramp providers`);
      check(g, r.customers.every((c) => within(c.screen, c.stage)), `${name}: each customer's screen sits wholly inside its stage`, JSON.stringify(r.customers.map((c) => [c.screen, c.stage])));
      check(g, /Illustrations\. .*no wallet or off-ramp integration is live yet/.test(r.businessText), `${name}: the screens are labelled illustrations, with no live integration implied`);
      check(g, /Business model hypothesis/.test(r.businessText) && /hasn't been validated/.test(r.businessText), `${name}: the business model is a labelled hypothesis`);
      check(g, JSON.stringify(r.nodes.map((n) => n.id)) === '["business","payoutlock","provider"]', `${name}: Wallet / Off-ramp → PayoutLock → Protection provider`);
      check(g, r.clippedLabels.length === 0, `${name}: the model's link labels are fully visible`, r.clippedLabels.join(", "));
      // proof
      check(g, r.verifyTitle.includes("This is not just a concept.") && r.verifyTitle.includes("It is running on Stellar Testnet."), `${name}: the proof message`);
      check(g, JSON.stringify(r.receipts.map((x) => x.kind)) === '["settled","claimed"]' && r.receipts.every((x) => x.links === 1), `${name}: two receipts, settled and claimed, each linking its real transaction`);
      check(g, !overlaps(r.receipts[0].box, r.receipts[1].box), `${name}: the receipts never cover each other (their links stay usable)`);
      check(g, r.receipts[1].text.includes("Simulated payout failure · real on-chain claim"), `${name}: the claimed receipt says the failure was simulated and the claim real`);
      // developers
      const d = r.dev;
      if (name === "desktop") {
        check(g, d.app.right < d.api.left && d.api.right < d.contract.left, "desktop: your flow → PayoutLock → Stellar, left to right");
        check(g, Math.abs(d.app.top - d.api.top) < 2 && Math.abs(d.anchor.top - d.attestor.top) < 2, "desktop: each row lines up across the columns");
        check(g, d.contract.height > d.api.height * 2.5, "desktop: the contract receives all three rows");
        check(g, r.customers[0].box.top === r.customers[1].box.top && r.customers[0].box.right < r.customers[1].box.left, "desktop: the two customers side by side");
        check(g, r.nodes.every((n, i) => i === 0 || n.box.left > r.nodes[i - 1].box.right), "desktop: the model reads left to right");
        check(g, r.receipts[1].box.left > r.receipts[0].box.left, "desktop: the receipts are staggered");
      } else {
        check(g, d.app.top < d.api.top && d.keeper.top < d.contract.top, "phone: the columns stack in reading order");
        check(g, r.customers[0].box.bottom < r.customers[1].box.top, "phone: the customers stack");
        check(g, r.nodes.every((n, i) => i === 0 || n.box.top > r.nodes[i - 1].box.bottom), "phone: the model reads top to bottom");
      }
      check(g, r.boundary.includes("The contract never sees the bank or holds the user's principal."), `${name}: the contract's boundary is stated`);
      check(g, /Protection fee.*Protection provider compensation.*PayoutLock platform fee/.test(r.businessText), `${name}: the fee splits into provider compensation + platform fee`);
      check(g, /POST \/api\/live\/open-protection/.test(r.devText) && /GET \/api\/protections\/\{anchorWithdrawalId\}/.test(r.devText), `${name}: the API calls shown are the real routes`);
      check(g, !/contract (tracks|knows|reads|watches|sees) (the )?(bank|payout)/i.test(r.devText.replace("The contract never sees the bank", "")), `${name}: nothing says the contract follows the bank payout`);
      check(g, problems.length === 0, `${name}: no errors`, problems.join(" | "));
      await ctx.close();
    }
  },

  // ---------------------------------------------------------------------------------------------------------------
  async "keyboard-and-contrast"() {
    const g = "keyboard-and-contrast";
    for (const [name, viewport, mobile] of [["desktop", DESKTOP, false], ["phone", PHONE, true]]) {
      const { ctx, page } = await open({ viewport, mobile, reducedMotion: true });
      await scrollThrough(page);
      // every interactive control shows where the focus is, and has a name
      const controls = await page.evaluate(() => [...document.querySelectorAll("a[href],button")].filter((el) => el.getClientRects().length).map((el) => ({ name: (el.getAttribute("aria-label") || el.textContent).trim(), disabled: el.disabled })));
      check(g, controls.length > 10 && controls.every((c) => c.name), `${name}: every link and button has a name`, controls.filter((c) => !c.name).length + " unnamed");
      await scrollTo(page, 0);
      const rings = [];
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press("Tab");
        rings.push(await page.evaluate(() => {
          const el = document.activeElement;
          const s = getComputedStyle(el);
          return { tag: el.tagName, text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24), outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2 };
        }));
      }
      check(g, rings.every((r) => r.outline), `${name}: the focus ring shows on the first nine tab stops`, JSON.stringify(rings.filter((r) => !r.outline)));
      check(g, rings[0].text.includes("PayoutLock") || rings[0].tag === "A", `${name}: tabbing starts at the top of the page`);

      // text contrast against whatever is behind it (WCAG 2: 4.5, or 3 for large text)
      const failures = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
        const rgba = (css) => {
          ctx2d.clearRect(0, 0, 1, 1);
          ctx2d.fillStyle = "#000";
          ctx2d.fillStyle = css;
          ctx2d.fillRect(0, 0, 1, 1);
          const d = ctx2d.getImageData(0, 0, 1, 1).data;
          return [d[0], d[1], d[2], d[3] / 255];
        };
        const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
        const lum = ([r, g, b]) => {
          const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const ratio = (a, b) => {
          const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
          return (hi + 0.05) / (lo + 0.05);
        };
        const bad = [];
        let checked = 0;
        for (const el of document.querySelectorAll("[data-pl] *")) {
          if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none") continue;
          // background: composite every ancestor's colour, from the page down to this element
          let uncertain = false;
          const stack = [];
          for (let n = el; n; n = n.parentElement) stack.push(n);
          let bg = [255, 255, 255, 1];
          for (const n of stack.reverse()) {
            const s = getComputedStyle(n);
            if (s.backgroundImage !== "none") uncertain = true;
            const c = rgba(s.backgroundColor);
            if (c[3] > 0) bg = over(c, bg);
          }
          if (uncertain) continue;
          const fg = over(rgba(style.color), bg);
          const size = parseFloat(style.fontSize);
          const large = size >= 24 || (size >= 18.66 && parseInt(style.fontWeight) >= 700);
          const need = large ? 3 : 4.5;
          const got = ratio(fg, bg);
          checked++;
          if (got < need) bad.push(`${(el.textContent || "").trim().slice(0, 32)} — ${got.toFixed(2)}:1 (needs ${need}) [${style.color} on rgb(${bg.slice(0, 3).map(Math.round)})]`);
        }
        return { bad, checked };
      });
      check(g, failures.checked > 80, `${name}: contrast was measured on ${failures.checked} pieces of text`);
      check(g, failures.bad.length === 0, `${name}: all text meets WCAG contrast (4.5:1, 3:1 for large text)`, failures.bad.slice(0, 4).join(" | "));
      await ctx.close();
    }
  },

  // ---------------------------------------------------------------------------------------------------------------
  async "screens"() {
    // pictures for review: each section, on a desktop and on a phone
    for (const [dir, viewport, mobile] of [["desktop", DESKTOP, false], ["mobile", PHONE, true]]) {
      const { ctx, page } = await open({ viewport, mobile });
      await page.waitForTimeout(1400); // the hero's entrance
      await shot(page, dir, "01-hero");
      if (dir === "mobile") {
        const gap = await sectionBox(page, '[data-section="gap"]');
        for (let i = 0; i * PHONE.height * 0.85 < gap.height; i++) {
          await scrollTo(page, gap.top + i * PHONE.height * 0.85);
          await shot(page, dir, `02-gap-${String.fromCharCode(97 + i)}`);
        }
      }
      for (const [name, selector] of [["06-business", "#businesses"], ["07-verify", "#verify"], ["08-developers", "#developers"], ["09-final", '[data-section="final"]']]) {
        const box = await sectionBox(page, selector);
        const h = viewport.height;
        const parts = Math.max(1, Math.ceil(box.height / (h * 0.9)));
        for (let i = 0; i < parts; i++) {
          await scrollTo(page, box.top + i * h * 0.85);
          await shot(page, dir, parts === 1 ? name : `${name}-${String.fromCharCode(97 + i)}`);
        }
      }
      await ctx.close();
    }
    check("screens", true, "section screenshots written to tools/landing/out/");
  },
};

for (const [name, fn] of Object.entries(GROUPS)) {
  if (only && !only.test(name)) continue;
  const started = Date.now();
  try {
    await fn();
  } catch (e) {
    check(name, false, `crashed: ${String(e).slice(0, 300)}`);
  }
  console.log(`      ${name} done in ${Math.round((Date.now() - started) / 1000)}s`);
}
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length} checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
