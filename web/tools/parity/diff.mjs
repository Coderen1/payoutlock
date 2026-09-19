// usage: node diff.mjs <labelA> <labelB>
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const [A, B] = process.argv.slice(2);
const dirA = path.join(import.meta.dirname, "out", A);
const dirB = path.join(import.meta.dirname, "out", B);
const names = fs.readdirSync(dirA).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)).filter((n) => !process.env.ONLY || new RegExp(process.env.ONLY).test(n)).sort();
let bad = 0, elementsCompared = 0, propsCompared = 0;
for (const n of names) {
  const pa = path.join(dirA, `${n}.png`), pb = path.join(dirB, `${n}.png`);
  if (!fs.existsSync(pb)) { console.log(`MISSING in ${B}: ${n}`); bad++; continue; }
  const a = PNG.sync.read(fs.readFileSync(pa)), b = PNG.sync.read(fs.readFileSync(pb));
  let px = -1;
  if (a.width === b.width && a.height === b.height) px = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0, includeAA: true });
  const da = JSON.parse(fs.readFileSync(path.join(dirA, `${n}.json`), "utf8"));
  const db = JSON.parse(fs.readFileSync(path.join(dirB, `${n}.json`), "utf8"));
  const diffs = [];
  if (da.length !== db.length) diffs.push(`element count ${da.length} vs ${db.length}`);
  for (let i = 0; i < Math.min(da.length, db.length); i++) {
    const x = da[i], y = db[i];
    elementsCompared++;
    if (x.path !== y.path) { diffs.push(`path ${x.path} vs ${y.path}`); continue; }
    if (x.tag !== "BODY" && x.cls !== y.cls) diffs.push(`${x.path}: class "${x.cls}" vs "${y.cls}"`);
    if (x.text !== y.text) diffs.push(`${x.path}: text "${x.text}" vs "${y.text}"`);
    if (JSON.stringify(x.rect) !== JSON.stringify(y.rect)) diffs.push(`${x.path}: rect ${x.rect} vs ${y.rect}`);
    for (const k of Object.keys(x.style)) {
      propsCompared++;
      if (x.style[k] !== y.style[k]) diffs.push(`${x.path}: ${k}: "${x.style[k]}" vs "${y.style[k]}"`);
    }
  }
  const dimOk = a.width === b.width && a.height === b.height;
  const ok = dimOk && px === 0 && diffs.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? "IDENTICAL" : "DIFFERS  "} ${n}  size ${a.width}x${a.height}${dimOk ? "" : ` vs ${b.width}x${b.height}`}  pixelsDiff=${px}  domDiffs=${diffs.length}`);
  for (const d of diffs.slice(0, 6)) console.log(`     - ${d}`);
}
console.log(`\n${names.length} scenes, ${elementsCompared} elements, ${propsCompared} computed-style values compared; ${bad === 0 ? "ALL IDENTICAL" : bad + " scene(s) differ"}`);
process.exit(bad ? 1 : 0);
