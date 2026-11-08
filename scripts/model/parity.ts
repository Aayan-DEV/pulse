// Parity test: TS feature builder + tree inference vs Python. Run: npx tsx scripts/model/parity.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFeatures, FEATURE_NAMES } from "../../src/lib/model/features";
import { predictQuantiles } from "../../src/lib/model/predict";

const root = join(__dirname, "..", "..");
const parity = JSON.parse(readFileSync(join(root, "model", "data", "parity.json"), "utf8"));
const nn = (v: number | null) => (v === null ? NaN : v);
const close = (a: number, b: number, tol: number) =>
  (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

let featFail = 0, predFail = 0, maxPredDiff = 0;
for (const r of parity.rows) {
  const x = buildFeatures(new Date(r.time), r.weather, parity.events, parity.situations, parity.cruise, r.transitStats);
  r.features.forEach((pv: number | null, i: number) => {
    if (!close(x[i], nn(pv), 1e-9)) {
      featFail++;
      if (featFail <= 10) console.error(`feature ${FEATURE_NAMES[i]} @ ${r.time}: ts=${x[i]} py=${pv}`);
    }
  });
  // Predictions from the Python features, so the tree check is independent of the feature check.
  const q = predictQuantiles(r.features.map(nn));
  for (const k of ["p10", "p50", "p90"] as const) {
    const dRaw = Math.abs(q.raw[k] - r.raw[k]);
    const dCal = Math.abs(q[k] - r.pred[k]);
    maxPredDiff = Math.max(maxPredDiff, dRaw, dCal);
    if (dRaw > 1e-6 || dCal > 1e-6) {
      predFail++;
      if (predFail <= 10) console.error(`${k} @ ${r.time}: ts=${q.raw[k]} py=${r.raw[k]}`);
    }
  }
}
// Calendar features for every day 2023-2027 (local noon, Europe/Oslo).
let calFail = 0;
const calIdx = ["is_holiday", "school_holiday", "payday_window", "days_to_christmas", "xmas_market"].map((n) => (FEATURE_NAMES as readonly string[]).indexOf(n));
for (const [d, ...vals] of parity.calendar as [string, ...number[]][]) {
  const x = buildFeatures(new Date(`${d}T11:00:00Z`), { tempC: 0, precipMm: 0, windMs: 0 }, [], [], []);
  calIdx.forEach((fi, j) => {
    if (x[fi] !== vals[j]) {
      calFail++;
      if (calFail <= 10) console.error(`calendar ${FEATURE_NAMES[fi]} ${d}: ts=${x[fi]} py=${vals[j]}`);
    }
  });
}
featFail += calFail;
// No transitStats argument -> typical hour, must match Python build_features(..., rail_late5=None).
for (const r of parity.noStats as { time: string; features: number[] }[]) {
  const x = buildFeatures(new Date(r.time), { tempC: 0, precipMm: 0, windMs: 0 }, [], [], []);
  r.features.forEach((pv, i) => { if (!close(x[i], pv, 1e-9)) { featFail++; console.error(`noStats ${FEATURE_NAMES[i]} @ ${r.time}: ts=${x[i]} py=${pv}`); } });
}
console.log(`calendarDays=${parity.calendar.length} calendarMismatches=${calFail}`);
console.log(`rows=${parity.rows.length} featureMismatches=${featFail} predictionMismatches=${predFail} maxPredDiff=${maxPredDiff.toExponential(2)}`);
if (featFail || predFail) {
  console.error("PARITY FAILED");
  process.exit(1);
}
console.log("PARITY OK");
