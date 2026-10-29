// Coverage gate (ADR 0005). Reads each package's coverage/lcov.info (from `pnpm -r test:cov`) and fails when
//   1. changed lines in this PR (vs BASE_REF, default origin/main) are under COVERAGE_MIN % covered, or
//   2. a package's total line coverage is under its floor in infra/coverage-floors.json.
// No dependencies. Run from the repo root: node infra/coverage-gate.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const BASE = process.env.BASE_REF || "origin/main";
const MIN = Number(process.env.COVERAGE_MIN || 80);
const floors = JSON.parse(readFileSync(resolve(ROOT, "infra/coverage-floors.json"), "utf8"));
const skip = (p) => /(^|\/)(test|tests|dist|node_modules)\//.test(p) || /\.test\.[cm]?[jt]sx?$/.test(p) || /\.d\.ts$/.test(p);

// --- lcov: path -> Map(line -> hits) -------------------------------------------------------------
function parseLcov(file, pkgDir) {
  const cov = new Map();
  let cur = null;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("SF:")) {
      let p = line.slice(3).trim();
      if (p.startsWith("file://")) p = decodeURIComponent(new URL(p).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
      p = relative(ROOT, isAbsolute(p) ? p : resolve(pkgDir, p)).replace(/\\/g, "/");
      cur = skip(p) ? null : (cov.get(p) ?? cov.set(p, new Map()).get(p));
    } else if (cur && line.startsWith("DA:")) {
      const [ln, hits] = line.slice(3).split(",").map(Number);
      cur.set(ln, Math.max(cur.get(ln) ?? 0, hits));
    } else if (line === "end_of_record") cur = null;
  }
  return cov;
}

// --- changed lines: path -> Set(line) ---------------------------------------------------------------
function changedLines() {
  const out = new Map();
  let diff;
  try { diff = execFileSync("git", ["diff", "--unified=0", "--no-color", `${BASE}...HEAD`, "--", "*.ts", "*.tsx", "*.mjs"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 }); }
  catch { diff = execFileSync("git", ["diff", "--unified=0", "--no-color", BASE, "--", "*.ts", "*.tsx", "*.mjs"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 }); }
  let file = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) { const p = line.slice(4).replace(/^b\//, "").trim(); file = p === "/dev/null" || skip(p) ? null : p; }
    else if (file && line.startsWith("@@")) {
      const m = /\+(\d+)(?:,(\d+))?/.exec(line);
      const start = Number(m[1]), count = m[2] === undefined ? 1 : Number(m[2]);
      const set = out.get(file) ?? out.set(file, new Set()).get(file);
      for (let i = 0; i < count; i++) set.add(start + i);
    }
  }
  return out;
}

const pct = (c, t) => (t === 0 ? 100 : Math.round((c / t) * 1000) / 10);
const failures = [];
const all = new Map();
console.log(`coverage gate: base=${BASE} min=${MIN}%`);
console.log("package     lines     floor");
for (const pkg of Object.keys(floors)) {
  const file = resolve(ROOT, pkg, "coverage/lcov.info");
  if (!existsSync(file)) { console.log(`${pkg.padEnd(10)}  (no lcov; skipped)`); continue; }
  const cov = parseLcov(file, resolve(ROOT, pkg));
  let c = 0, t = 0;
  for (const [p, lines] of cov) { all.set(p, lines); for (const h of lines.values()) { t++; if (h > 0) c++; } }
  const p = pct(c, t);
  console.log(`${pkg.padEnd(10)}  ${String(p).padStart(5)}%    ${floors[pkg]}%`);
  if (p < floors[pkg]) failures.push(`${pkg}: ${p}% is below its floor of ${floors[pkg]}% (ADR 0005 item 2; floors only go up)`);
}

let cc = 0, ct = 0;
const perFile = [];
for (const [p, lines] of changedLines()) {
  const cov = all.get(p);
  if (!cov) continue; // not instrumented (scripts, config, files no test imports): outside the gate
  let c = 0, t = 0;
  for (const ln of lines) if (cov.has(ln)) { t++; if (cov.get(ln) > 0) c++; }
  cc += c; ct += t;
  if (t) perFile.push(`  ${p}: ${c}/${t} changed lines covered`);
}
const diffPct = pct(cc, ct);
console.log(`changed lines: ${cc}/${ct} covered = ${diffPct}%`);
for (const l of perFile) console.log(l);
if (ct > 0 && diffPct < MIN) failures.push(`changed lines are ${diffPct}% covered; ADR 0005 requires ${MIN}%`);

if (failures.length) { for (const f of failures) console.error(`::error::${f}`); process.exit(1); }
console.log("coverage gate: OK");
