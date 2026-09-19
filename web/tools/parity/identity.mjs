// Source-level "the console did not change" checks against the baseline commit. No browser needed.
//   1. Everything the console runs on (src/components, src/hooks, src/lib) is identical to the baseline.
//      Compared after TypeScript normalises the code (comments and formatting removed), so a comment
//      edit is reported but allowed, while any real code change fails.
//   2. developer.css is a verbatim, prefix-only scoping of the baseline src/index.css.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export function runIdentity({ web, repo, baseline }) {
  let failures = 0;
  const show = (ok, msg) => {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  };
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const normalise = (text, file) =>
    ts.transpileModule(text, {
      fileName: file,
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve, removeComments: true },
    }).outputText;

  const files = git("ls-tree", "-r", "--name-only", baseline, "--", "web/src/components", "web/src/hooks", "web/src/lib")
    .split("\n")
    .filter(Boolean);
  let identical = 0;
  const commentOnly = [];
  for (const rel of files) {
    const abs = path.join(repo, rel);
    if (!fs.existsSync(abs)) {
      show(false, `${rel} exists (it existed at ${baseline})`);
      continue;
    }
    const before = git("show", `${baseline}:${rel}`);
    const after = fs.readFileSync(abs, "utf8");
    if (before === after) identical++;
    else if (normalise(before, rel) === normalise(after, rel)) commentOnly.push(rel);
    else show(false, `${rel}: code differs from ${baseline}`);
  }
  const changedCode = failures;
  show(changedCode === 0, `${files.length} console source files: ${identical} byte-identical, ${commentOnly.length} comment-only, ${changedCode} with code changes (vs ${baseline})`);
  for (const f of commentOnly) console.log(`      comment-only edit: ${f}`);

  // developer.css must be the baseline stylesheet, scoped — nothing else.
  const parse = (t) => {
    t = t.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [];
    for (let i = 0; ; ) {
      const o = t.indexOf("{", i);
      if (o < 0) break;
      const c = t.indexOf("}", o);
      rules.push({ sel: t.slice(i, o).split(",").map((x) => x.trim()).filter(Boolean), body: t.slice(o + 1, c).replace(/\s+/g, " ").trim() });
      i = c + 1;
    }
    return rules;
  };
  const original = parse(git("show", `${baseline}:web/src/index.css`));
  const scoped = parse(fs.readFileSync(path.join(web, "src/developer/developer.css"), "utf8"));
  let cssProblems = original.length === scoped.length ? 0 : 1;
  original.forEach((r, k) => {
    const s = scoped[k];
    if (!s) return;
    const expected = r.sel.map((x) => (x === "body" ? "body.dev-console-body" : `body.dev-console-body ${x}`));
    if (JSON.stringify(expected) !== JSON.stringify(s.sel) || r.body !== s.body) cssProblems++;
  });
  show(cssProblems === 0, `developer.css: ${original.length} rules are the baseline index.css verbatim, selectors only prefixed with body.dev-console-body`);
  return failures;
}
