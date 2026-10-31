// Lab 4 traceability check (docs/lab-04/tests.md section 3).
// Reads the numbered requirements from specification.md and the test plan from tests.md, and fails when
//   1. a requirement (FR, BR or AC) is missing from the traceability tables,
//   2. a table points at a test id that is not in the plan,
//   3. a requirement has no test whose Result is "Pass",
//   4. a test's automated file does not exist, or does not mention the test id.
// Run from the repository root:  node server/scripts/check-traceability.mjs
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => readFileSync(path.join(root, p), "utf-8");
const spec = read("docs/lab-04/specification.md");
const plan = read("docs/lab-04/tests.md");

// Requirements: "- **AC-01** ..." style list items in the specification.
const requirements = [...spec.matchAll(/^\s*-\s+\*\*((?:FR|BR|AC)-\d\d)\*\*/gm)].map((m) => m[1]);
const uniqueRequirements = [...new Set(requirements)];

// Tests: rows whose first cell is a Lab 4 test id. Columns: id | requirement | what | expected | file | result.
const tests = new Map();
for (const line of plan.split("\n")) {
  const m = line.match(/^\| ((?:UNIT|API|WF|SEC|RDASH|SDASH|FLT|MIG|REG|UI|STY|RESP|E2E)-\d\d) \|/);
  if (!m) continue;
  const cells = line.replace(/^\||\|\s*$/g, "").split("|").map((c) => c.trim());
  const files = [...(cells[4] ?? "").matchAll(/`([^`]+)`/g)].map((f) => f[1]);
  const result = cells[cells.length - 1];
  tests.set(m[1], { files, result, state: /^Pass$/.test(result) ? "pass" : /^Partial/.test(result) ? "partial" : "not-run" });
}

// Traceability tables: "| AC-01 | API-01, UI-09 |" rows.
const trace = new Map();
for (const line of plan.split("\n")) {
  const m = line.match(/^\| ((?:FR|BR|AC)-\d\d) \| ([^|]+) \|\s*$/);
  if (m) trace.set(m[1], m[2].split(",").map((t) => t.trim()).filter(Boolean));
}

const problems = [];
const fileText = (f) => {
  const full = path.join(root, f);
  if (!existsSync(full)) return null;
  if (statSync(full).isDirectory()) return "";
  return readFileSync(full, "utf-8");
};

for (const id of uniqueRequirements) {
  const ids = trace.get(id);
  if (!ids) {
    problems.push(`${id}: not in any traceability table`);
    continue;
  }
  for (const t of ids) if (!tests.has(t)) problems.push(`${id}: points at ${t}, which is not in the test plan`);
  const passing = ids.filter((t) => tests.get(t)?.state === "pass");
  if (passing.length === 0) problems.push(`${id}: no passing test (mapped to ${ids.join(", ")})`);
}
for (const id of trace.keys()) if (!uniqueRequirements.includes(id)) problems.push(`${id}: in a traceability table but not in the specification`);

for (const [id, t] of tests) {
  if (t.state === "not-run") problems.push(`${id}: result is "${t.result}", not Pass or Partial`);
  if (t.files.length === 0) problems.push(`${id}: no automated test file listed`);
  for (const f of t.files) {
    const text = fileText(f);
    if (text === null) problems.push(`${id}: ${f} does not exist`);
    else if (text !== "" && !text.includes(id)) problems.push(`${id}: ${f} never mentions ${id}`);
  }
}

const byKind = (k) => uniqueRequirements.filter((r) => r.startsWith(k));
const covered = (k) => byKind(k).filter((r) => (trace.get(r) ?? []).some((t) => tests.get(t)?.state === "pass")).length;
const states = { pass: 0, partial: 0, "not-run": 0 };
for (const t of tests.values()) states[t.state] += 1;

console.log(`Requirements with a passing test: AC ${covered("AC")}/${byKind("AC").length}, FR ${covered("FR")}/${byKind("FR").length}, BR ${covered("BR")}/${byKind("BR").length}`);
console.log(`Tests in the plan: ${tests.size} (Pass ${states.pass}, Partial ${states.partial}, other ${states["not-run"]})`);
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log("Every FR, BR and AC has a passing test, and every listed test file exists and names its test.");
