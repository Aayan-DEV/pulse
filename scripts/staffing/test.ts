// Run: npx tsx scripts/staffing/test.ts
// Exits 1 on the first failed assertion.

import {
  erlangB, erlangC, serviceLevel, asa, agentsForServiceLevel, offeredLoad, occupancy,
  halfinWhittPWait, betaForPWait, squareRootStaffing,
  staffRequirements, buildSchedule, syntheticRoster, syntheticWeekForecast,
  checkEmployee, DEFAULT_RULES, DEFAULT_STAFFING, type Shift, type Employee,
} from "../../src/lib/staffing";
import { weekStartOf } from "../../src/lib/staffing/check";

let passed = 0;
function ok(cond: boolean, msg: string) {
  if (!cond) { console.error(`FAIL  ${msg}`); process.exit(1); }
  passed++;
  console.log(`ok    ${msg}`);
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// ---------- 1. Erlang C against independent values ----------
// Reference values computed independently in Python with the closed form of
// Gans, Koole and Mandelbaum (2003) eq. (3) (direct sums with factorials, not
// the recursion used here):
//   C(11, 10) = 0.682118   C(12, 10) = 0.449388   C(14, 10) = 0.174132   C(25, 20) = 0.209103
//   SL(c=11, A=10, AHT=100 s, t=20 s) = 0.441529, ASA = 68.2118 s
console.log("\n# Erlang C");
ok(near(erlangC(11, 10), 0.682118, 1e-6), `C(c=11, A=10) = ${erlangC(11, 10).toFixed(6)} (expected 0.682118; 360 calls/h x 100 s)`);
ok(near(erlangC(12, 10), 0.449388, 1e-6), `C(12, 10) = ${erlangC(12, 10).toFixed(6)} (expected 0.449388)`);
ok(near(erlangC(14, 10), 0.174132, 1e-6), `C(14, 10) = ${erlangC(14, 10).toFixed(6)} (expected 0.174132)`);
ok(near(erlangC(25, 20), 0.209103, 1e-6), `C(25, 20) = ${erlangC(25, 20).toFixed(6)} (expected 0.209103)`);
ok(near(erlangC(3, 2), 4 / 9, 1e-12), "C(3, 2) = 4/9 exactly (hand calculation)");
ok(near(erlangC(1, 0.7), 0.7, 1e-12), "M/M/1: C(1, rho) = rho");
ok(near(erlangB(1, 2), 2 / 3, 1e-12), "Erlang B(1, A) = A / (1 + A)");
ok(erlangC(10, 10) === 1 && erlangC(9, 10) === 1, "c <= A means everyone waits (unstable)");
ok(near(offeredLoad(360, 100), 10, 1e-12), "A = lambda * AHT: 360/h x 100 s = 10 Erlangs");
ok(near(serviceLevel(11, 10, 100, 20), 0.441529, 1e-6), `SL(11, 10, 100 s, 20 s) = ${serviceLevel(11, 10, 100, 20).toFixed(6)} (expected 0.441529)`);
ok(near(asa(11, 10, 100), 68.2118, 1e-3), `ASA(11, 10, 100 s) = ${asa(11, 10, 100).toFixed(4)} s (expected 68.2118)`);
ok(erlangC(500, 480) > 0 && erlangC(500, 480) < 1, "recursion is stable for c = 500 (no factorial overflow)");

// ---------- 2. Monotonicity ----------
console.log("\n# Monotonicity");
let mono = true;
for (let c = 11; c < 30; c++) if (serviceLevel(c + 1, 10, 100, 20) < serviceLevel(c, 10, 100, 20)) mono = false;
ok(mono, "service level rises with every extra server (c = 11..30, A = 10)");
mono = true;
for (let lam = 10; lam < 300; lam += 10) {
  const c = 8;
  if (serviceLevel(c, offeredLoad(lam + 10, 60), 60, 30) > serviceLevel(c, offeredLoad(lam, 60), 60, 30)) mono = false;
}
ok(mono, "service level falls as arrivals rise (c = 8 fixed)");
mono = true;
for (let lam = 0; lam <= 600; lam += 15) {
  if (agentsForServiceLevel(lam + 15, 60, 60, 0.8).servers < agentsForServiceLevel(lam, 60, 60, 0.8).servers) mono = false;
}
ok(mono, "servers needed never fall as arrivals rise");
const r80 = agentsForServiceLevel(360, 100, 20, 0.8);
// Python reference: SL(c=12) = 0.698766, SL(c=13) = 0.843440
ok(r80.servers === 13 && near(r80.serviceLevel, 0.84344, 1e-5) && near(serviceLevel(12, 10, 100, 20), 0.698766, 1e-5),
  `80/20 target at A = 10, AHT = 100 s needs c = ${r80.servers} (SL ${r80.serviceLevel.toFixed(4)}; c = 12 gives ${serviceLevel(12, 10, 100, 20).toFixed(4)})`);

// ---------- 3. Halfin-Whitt square-root staffing ----------
console.log("\n# Square-root staffing");
const beta = betaForPWait(0.2);
ok(near(halfinWhittPWait(beta), 0.2, 1e-6), `beta for P(wait) = 0.2 is ${beta.toFixed(4)}`);
const sr = squareRootStaffing(100, beta);
ok(Math.abs(erlangC(sr, 100) - 0.2) < 0.05, `A = 100: N = R + beta*sqrt(R) = ${sr}, exact Erlang C there = ${erlangC(sr, 100).toFixed(4)} (close to 0.2)`);

// ---------- 4. Requirements ----------
console.log("\n# Requirements (synthetic week, P50)");
const fc = syntheticWeekForecast();
const req = staffRequirements(fc);
const open = req.filter((r) => r.phase === "open");
ok(open.length === fc.length, `one open-hour requirement per forecast hour (${open.length})`);
ok(open.every((r) => r.front >= 1 && r.kitchen >= 2 && r.manager === 1), "min crew: front >= 1, kitchen >= 2, 1 manager every open hour");
ok(open.every((r) => r.counterArrivals === 0 || r.serviceLevel >= DEFAULT_STAFFING.targetSL), "every open hour meets the 80 % service target");
ok(open.every((r) => r.occupancy <= DEFAULT_STAFFING.maxOccupancy + 1e-9), "cashier occupancy <= 85 % every hour");
ok(req.filter((r) => r.phase !== "open").every((r) => r.transactions === 0 && r.total === 3), "pre-open and close-down hours have the fixed crew of 3");
const req90 = staffRequirements(fc, { quantile: "p90" });
ok(req90.every((r, i) => r.total >= req[i].total), "P90 plan never has fewer staff than the P50 plan");

// ---------- 5. Schedule ----------
console.log("\n# Schedule (ILP + roster of 45)");
const roster = syntheticRoster();
ok(roster.length === 45, "synthetic roster has 45 employees (brreg)");
const t0 = performance.now();
const sched = buildSchedule(req, roster);
const ms = performance.now() - t0;
ok(sched.coverage.every((c) => c.crewPlanned + 1e-9 >= c.crewRequired && c.managerPlanned + 1e-9 >= c.managerRequired),
  "ILP coverage >= requirement in every hour (crew and manager)");
ok(sched.solves.every((s) => s.feasible), "every day's ILP plan covers the day");
const slowest = Math.max(...sched.solves.map((s) => s.ms));
ok(slowest < 1000, `each ILP solve < 1 s (slowest ${slowest} ms; whole week incl. roster ${Math.round(ms)} ms)`);
const restKinds = new Set(["dailyRest", "weeklyRest", "dailyHours", "weeklyHours", "youthNight", "nightShiftLength", "role", "shiftLength"]);
const legal = sched.violations.filter((v) => restKinds.has(v.kind));
ok(legal.length === 0, `no rest or working-time violations in the assigned roster (${legal.length})`);
ok(sched.cost.unfilledShifts === 0 && sched.violations.length === 0, `all ${sched.cost.shiftCount} shifts filled, 0 violations of any kind`);
ok(sched.coverage.every((c) => c.crewAssigned + 1e-9 >= c.crewRequired), "assigned roster covers every hour");
const gap = sched.solves.reduce((a, s) => a + s.paidHours - s.lowerBound, 0);
ok(gap >= -1e-6, `paid hours ${sched.cost.plannedPaidHours} >= LP lower bound ${(sched.cost.plannedPaidHours - gap).toFixed(1)} (gap ${gap.toFixed(1)} h, ${(100 * gap / sched.cost.plannedPaidHours).toFixed(1)} %)`);
const youthShifts = sched.shifts.filter((s) => roster.find((e) => e.id === s.employeeId)?.ageGroup !== "adult" && s.employeeId);
ok(youthShifts.every((s) => s.start + s.length <= 21), `under-18 shifts all end by 21:00 (${youthShifts.length} shifts)`);

// ---------- 6. The checker catches real breaches ----------
console.log("\n# Checker negative tests");
const adult: Employee = { id: "T1", name: "t", ageGroup: "adult", canManage: false, contractHours: 37.5 };
const youth: Employee = { ...adult, id: "T2", ageGroup: "youth" };
const mk = (dayIndex: number, start: number, length: number): Shift =>
  ({ id: `s${dayIndex}-${start}`, role: "crew", dayIndex, businessDate: "x", weekday: dayIndex % 7, start, length, breakHour: null });
const ws = weekStartOf(0);
ok(checkEmployee(adult, [mk(0, 17, 8), mk(1, 10, 6)], DEFAULT_RULES, ws).some((v) => v.kind === "dailyRest"), "close 01:00 then open 10:00 (9 h rest) is flagged under AML § 10-8 (1)");
ok(checkEmployee(youth, [mk(0, 15, 7)], DEFAULT_RULES, ws).some((v) => v.kind === "youthNight"), "youth shift to 22:00 is flagged under AML § 11-3 (2)");
const sixDays = [0, 1, 2, 3, 4, 5].map((d) => mk(d, 10, 6));
ok(checkEmployee(adult, [...sixDays, mk(6, 8 + 10, 4)], DEFAULT_RULES, ws).some((v) => v.kind === "weeklyRest"), "7 working days with no 35 h break is flagged under AML § 10-8 (2)");
ok(checkEmployee(adult, [0, 1, 2, 3, 4].map((d) => mk(d, 10, 9)), DEFAULT_RULES, ws).some((v) => v.kind === "weeklyHours"), "45 h in a week is flagged under AML § 10-4 (1)");

// ---------- 7. Worked example ----------
console.log("\n# Worked example: busiest Friday hour (synthetic P50 forecast)");
const fri = open.filter((r) => r.weekday === 4).sort((a, b) => b.transactions - a.transactions)[0];
const P = DEFAULT_STAFFING;
const lam = fri.transactions * (1 - P.kioskShare - P.deliveryShare);
const A = offeredLoad(lam, P.counterAhtSec);
console.log(`  hour                     Friday ${fri.businessDate} ${String(fri.hour).padStart(2, "0")}:00`);
console.log(`  transactions (P50)       ${fri.transactions}`);
console.log(`  counter share            1 - kiosk ${P.kioskShare} - delivery ${P.deliveryShare} = ${(1 - P.kioskShare - P.deliveryShare).toFixed(2)}`);
console.log(`  arrivals lambda          ${fri.transactions} x ${(1 - P.kioskShare - P.deliveryShare).toFixed(2)} = ${lam.toFixed(1)} orders/h`);
console.log(`  AHT                      ${P.counterAhtSec} s`);
console.log(`  traffic A = lambda*AHT   ${lam.toFixed(1)} x ${P.counterAhtSec} / 3600 = ${A.toFixed(4)} Erlangs`);
console.log(`  target                   ${P.targetSL * 100} % start ordering within ${P.targetWaitSec} s, occupancy <= ${P.maxOccupancy * 100} %`);
for (let c = Math.floor(A) + 1; c <= fri.front + 1; c++) {
  console.log(`    c = ${c}: P(wait) = ${erlangC(c, A).toFixed(4)}, SL = 1 - ${erlangC(c, A).toFixed(4)} x e^(-(${c} - ${A.toFixed(3)}) x ${P.targetWaitSec}/${P.counterAhtSec}) = ${serviceLevel(c, A, P.counterAhtSec, P.targetWaitSec).toFixed(4)}, ASA = ${asa(c, A, P.counterAhtSec).toFixed(1)} s, occupancy = ${(occupancy(c, A) * 100).toFixed(1)} %`);
}
console.log(`  cashiers chosen c        ${fri.front}  (smallest c with SL >= ${P.targetSL} and occupancy <= ${P.maxOccupancy})`);
console.log(`  P(wait)                  ${fri.pWait}`);
console.log(`  service level            ${fri.serviceLevel}`);
console.log(`  ASA                      ${fri.asaSec} s`);
console.log(`  occupancy                ${(fri.occupancy * 100).toFixed(1)} %`);
console.log(`  kitchen                  max(${P.minKitchen}, ceil(${fri.transactions} / ${P.kitchenTxPerWorkerHour})) = ${fri.kitchen}`);
console.log(`  manager                  ${fri.manager}`);
console.log(`  total on the floor       ${fri.front} + ${fri.kitchen} + ${fri.manager} = ${fri.total}`);
const fri90 = req90.find((r) => r.businessDate === fri.businessDate && r.hour === fri.hour)!;
console.log(`  same hour at P90         ${fri90.transactions} tx -> front ${fri90.front}, kitchen ${fri90.kitchen}, total ${fri90.total}`);
ok(fri.front === agentsForServiceLevel(lam, P.counterAhtSec, P.targetWaitSec, P.targetSL, P.maxOccupancy).servers, "worked example matches the engine");

console.log(`\n# Week summary: ${sched.cost.shiftCount} shifts, ${sched.cost.plannedPaidHours} paid hours, ${sched.cost.requiredPersonHours} required person-hours, ${sched.violations.length} violations`);
console.log(`\nALL ${passed} CHECKS PASSED`);
