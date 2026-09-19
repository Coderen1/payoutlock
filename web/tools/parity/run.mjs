#!/usr/bin/env node
// Proves the engineering console at /developer still looks and behaves exactly like the original app.
//
//   node tools/parity/run.mjs baseline   regenerate the baseline (from the pinned commit) into out/baseline
//   node tools/parity/run.mjs identity   source checks: console code untouched, developer.css verbatim
//   node tools/parity/run.mjs check      screenshot + DOM + computed-style diff of the current tree vs the baseline
//   node tools/parity/run.mjs routes     production build: routes, isolation, viewport, code splitting
//   node tools/parity/run.mjs all        identity, then check, then routes (baseline is generated if missing)
//
// Needs Google Chrome (or PARITY_CHROME_PATH=<binary>) and a git checkout that contains the baseline commit.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runIdentity } from "./identity.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../..");
const REPO = path.resolve(WEB, "..");
/** The commit the redesign started from: the original console, before any change. */
const BASELINE_COMMIT = "ca542a7";
const OUT = path.join(HERE, "out");
const WORK = path.join(HERE, ".work");
const VITE = path.join(WEB, "node_modules/vite/bin/vite.js");

function run(cmd, args, opts = {}) {
  const r = execFileSync(cmd, args, { stdio: "inherit", ...opts });
  return r;
}

/** Starts a Vite process and resolves once it answers HTTP. `stop()` ends it. */
async function startVite(args, cwd, port, readyPath = "/") {
  const child = spawn(process.execPath, [VITE, ...args, "--port", String(port), "--strictPort"], { cwd, stdio: "ignore" });
  const exited = new Promise((r) => child.once("exit", r));
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url + readyPath)).ok) return { url, stop: async () => (child.kill("SIGTERM"), exited) };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill("SIGTERM");
  throw new Error(`vite did not come up on :${port}`);
}

function shoot(label, baseUrl, consolePath) {
  run(process.execPath, [path.join(HERE, "shoot.mjs"), label, baseUrl, consolePath], { cwd: HERE });
}

function installHarness(root, flavour) {
  const dest = path.join(root, "tools/parity/harness");
  fs.mkdirSync(dest, { recursive: true });
  for (const f of ["index.html", "scenes.tsx"]) fs.copyFileSync(path.join(HERE, "harness", f), path.join(dest, f));
  fs.copyFileSync(path.join(HERE, "harness", `entry-${flavour}.tsx`), path.join(dest, "entry.tsx"));
}

async function baseline() {
  console.log(`\n== baseline: rebuilding the original app from ${BASELINE_COMMIT}`);
  fs.rmSync(path.join(WORK, "baseline"), { recursive: true, force: true });
  fs.mkdirSync(path.join(WORK, "baseline"), { recursive: true });
  const tar = execFileSync("git", ["-C", REPO, "archive", "--format=tar", BASELINE_COMMIT, "web"], { maxBuffer: 256 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", path.join(WORK, "baseline")], { input: tar });
  const root = path.join(WORK, "baseline/web");
  fs.symlinkSync(path.join(WEB, "node_modules"), path.join(root, "node_modules"), "dir");
  installHarness(root, "baseline");
  const vite = await startVite([], root, 5198);
  try {
    shoot("baseline", vite.url, "/"); // in the original app the console lived at /
  } finally {
    await vite.stop();
    fs.unlinkSync(path.join(root, "node_modules")); // remove the symlink itself before any recursive delete
  }
  fs.rmSync(path.join(WORK, "baseline"), { recursive: true, force: true });
}

async function check() {
  if (!fs.existsSync(path.join(OUT, "baseline"))) await baseline();
  console.log("\n== check: current tree vs baseline (pixels, DOM, every computed style)");
  installHarness(WEB, "current");
  const vite = await startVite([], WEB, 5199);
  try {
    shoot("current", vite.url, "/developer");
  } finally {
    await vite.stop();
  }
  run(process.execPath, [path.join(HERE, "diff.mjs"), "baseline", "current"], { cwd: HERE });
}

async function routes() {
  console.log("\n== routes: production build");
  run("npm", ["run", "build"], { cwd: WEB });
  const vite = await startVite(["preview"], WEB, 4173, "/developer");
  try {
    run(process.execPath, [path.join(HERE, "verify-routes.mjs"), vite.url], { cwd: HERE });
  } finally {
    await vite.stop();
  }
}

const steps = {
  baseline,
  identity: async () => {
    console.log(`\n== identity: source checks against ${BASELINE_COMMIT}`);
    if (runIdentity({ web: WEB, repo: REPO, baseline: BASELINE_COMMIT }) > 0) throw new Error("identity checks failed");
  },
  check,
  routes,
};
const which = process.argv[2];
const plan = which === "all" ? ["identity", "check", "routes"] : which in steps ? [which] : null;
if (!plan) {
  console.error("usage: node tools/parity/run.mjs <baseline|identity|check|routes|all>");
  process.exit(2);
}
try {
  for (const step of plan) await steps[step]();
  console.log(`\nparity: ${plan.join(" + ")} OK`);
} catch (e) {
  console.error(`\nparity: FAILED — ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
