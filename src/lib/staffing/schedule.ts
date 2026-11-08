// Shift scheduling in two steps.
//
// Step 1, per day and per role: set-covering integer program (Dantzig 1954,
// "A Comment on Edie's 'Traffic Delays at Toll Booths'", Journal of the Operations Research Society of America
// 2(3):339-341, doi:10.1287/opre.2.3.339):
//   minimise   sum_j paid_j * x_j
//   subject to sum_j a_hj * x_j >= r_h   for every hour h
//              x_j integer >= 0
// where x_j = number of people on candidate shift j, a_hj = 1 if shift j covers
// hour h (0.5 in the hour of its 30 min break), r_h = staff required.
// Solved with javascript-lp-solver (branch and bound).
//
// Step 2: greedy assignment of the chosen shifts to named employees, only when
// every rule in check.ts still holds. A shift nobody can legally take is
// reported as a violation; the law is never broken to fill it.

import solver from "javascript-lp-solver";
import type { StaffRequirementDetail } from "./requirements";
import {
  DEFAULT_RULES, type Employee, type Rules, type Shift,
  absEnd, absStart, nightHours, paidHours,
} from "./rules";
import { canTake, checkRoster, groupRules, weekStartOf, type Violation } from "./check";
import { daysBetween } from "./time";

export type Role = "manager" | "crew";

export type AssignedShift = Shift & { employeeId: string | null; employeeName: string | null; paidHours: number };

export type CoverageHour = {
  time: string;
  businessDate: string;
  hour: number;
  crewRequired: number;     // front + kitchen
  crewPlanned: number;      // from the ILP (person-hours in the hour)
  crewAssigned: number;     // after assigning to named employees
  managerRequired: number;
  managerPlanned: number;
  managerAssigned: number;
};

export type DaySolve = { businessDate: string; role: Role; variables: number; ms: number; paidHours: number; lowerBound: number; method: "ilp" | "lp-repair"; feasible: boolean };

export type ScheduleResult = {
  shifts: AssignedShift[];
  coverage: CoverageHour[];
  cost: {
    plannedPaidHours: number;   // ILP objective summed over days and roles
    assignedPaidHours: number;
    requiredPersonHours: number; // sum of hourly requirements (a lower bound)
    shiftCount: number;
    unfilledShifts: number;
  };
  hoursByEmployee: { employeeId: string; name: string; ageGroup: string; contractHours: number; legalHours: number; paidHours: number; shifts: number }[];
  violations: Violation[];
  solves: DaySolve[];
};

type Candidate = { start: number; length: number; breakHour: number | null };

/** Candidate shifts of minShift..maxShift hours starting at each hour of the day's span. */
export function candidateShifts(firstHour: number, lastHour: number, rules: Rules): Candidate[] {
  const out: Candidate[] = [];
  const breakNeeded = (L: number) =>
    L > Math.min(rules.adult.breakAfterHours, rules.youth.breakAfterHours, rules.school.breakAfterHours); // > 4.5 h covers adults and youth
  for (let L = rules.minShiftHours; L <= rules.maxShiftHours; L++) {
    for (let s = firstHour; s + L <= lastHour + 1; s++) {
      if (nightHours(s, L, rules) > 3 && L > rules.adult.nightMaxShiftHours) continue; // AML § 10-11 (6)
      if (!breakNeeded(L)) { out.push({ start: s, length: L, breakHour: null }); continue; }
      const mid = s + Math.floor(L / 2);
      out.push({ start: s, length: L, breakHour: mid });
      if (L >= 7) out.push({ start: s, length: L, breakHour: mid - 1 }); // a second break slot so breaks can be staggered
    }
  }
  return out;
}

export function coverageOf(c: { start: number; length: number; breakHour: number | null }, hour: number, breakHours: number): number {
  if (hour < c.start || hour >= c.start + c.length) return 0;
  return c.breakHour === hour ? 1 - breakHours : 1;
}

/** Solve one day's set-covering ILP. req[i] is the requirement for hour firstHour + i. */
export type DaySolution = {
  picks: { c: Candidate; n: number }[];
  paid: number;          // objective of the plan used
  lowerBound: number;    // LP relaxation; paid - lowerBound is the worst-case gap to optimal
  method: "ilp" | "lp-repair";
  feasible: boolean;     // every hour covered
  variables: number;
  ms: number;
};

export function solveDay(firstHour: number, req: number[], rules: Rules, timeoutMs = 600): DaySolution {
  const t0 = performance.now();
  const lastHour = firstHour + req.length - 1;
  if (req.every((r) => r <= 0)) return { picks: [], paid: 0, lowerBound: 0, method: "ilp", feasible: true, variables: 0, ms: 0 };
  const cands = candidateShifts(firstHour, lastHour, rules);
  const constraints: Record<string, { min: number }> = {};
  req.forEach((r, i) => { if (r > 0) constraints[`h${firstHour + i}`] = { min: r }; });
  const variables: Record<string, Record<string, number>> = {};
  const ints: Record<string, 1> = {};
  cands.forEach((c, j) => {
    const v: Record<string, number> = { paid: c.length - (c.breakHour !== null && !rules.breakIsPaid ? rules.breakHours : 0) };
    for (let h = c.start; h < c.start + c.length; h++) {
      if (constraints[`h${h}`]) v[`h${h}`] = coverageOf(c, h, rules.breakHours);
    }
    variables[`x${j}`] = v;
    ints[`x${j}`] = 1;
  });
  const paidOf = (c: Candidate) => c.length - (c.breakHour !== null && !rules.breakIsPaid ? rules.breakHours : 0);
  // LP relaxation: a lower bound on paid hours and the start point of the repair heuristic.
  const lp = solver.Solve({ optimize: "paid", opType: "min", constraints, variables });
  const lowerBound = Number(lp.result);
  // Branch and bound with a time cap; javascript-lp-solver returns its best integer solution so far.
  const res = solver.Solve({ optimize: "paid", opType: "min", constraints, variables, ints, options: { timeout: timeoutMs } });
  const read = (r: typeof res, round: (x: number) => number) => {
    const out: { c: Candidate; n: number }[] = [];
    cands.forEach((c, j) => {
      const n = round(Number(r[`x${j}`] ?? 0));
      if (n > 0) out.push({ c, n });
    });
    return out;
  };
  const covers = (ps: { c: Candidate; n: number }[]) =>
    req.every((r, i) => ps.reduce((a, p) => a + p.n * coverageOf(p.c, firstHour + i, rules.breakHours), 0) + 1e-9 >= r);
  const cost = (ps: { c: Candidate; n: number }[]) => ps.reduce((a, p) => a + p.n * paidOf(p.c), 0);

  // Repair heuristic: start from floor(LP), add the shift that covers the most
  // missing person-hours per paid hour until every hour is covered, then drop
  // shifts that are no longer needed. Always feasible.
  const repair = (): { c: Candidate; n: number }[] => {
    const n = cands.map((_, j) => Math.floor(Number(lp[`x${j}`] ?? 0) + 1e-9));
    const cov = req.map((_, i) => cands.reduce((a, c, j) => a + n[j] * coverageOf(c, firstHour + i, rules.breakHours), 0));
    for (let guard = 0; guard < 10_000; guard++) {
      const deficit = req.map((r, i) => Math.max(0, r - cov[i]));
      if (deficit.every((d) => d <= 1e-9)) break;
      let bestJ = -1, bestRatio = 0;
      cands.forEach((c, j) => {
        let gain = 0;
        for (let h = c.start; h < c.start + c.length; h++) {
          const i = h - firstHour;
          if (i >= 0 && i < req.length) gain += Math.min(deficit[i], coverageOf(c, h, rules.breakHours));
        }
        const ratio = gain / paidOf(c);
        if (ratio > bestRatio + 1e-12) { bestRatio = ratio; bestJ = j; }
      });
      if (bestJ < 0) break;
      n[bestJ]++;
      for (let h = cands[bestJ].start; h < cands[bestJ].start + cands[bestJ].length; h++) {
        const i = h - firstHour;
        if (i >= 0 && i < req.length) cov[i] += coverageOf(cands[bestJ], h, rules.breakHours);
      }
    }
    const order = cands.map((_, j) => j).sort((a, b) => paidOf(cands[b]) - paidOf(cands[a]));
    for (const j of order) {
      while (n[j] > 0) {
        const c = cands[j];
        let ok = true;
        for (let h = c.start; h < c.start + c.length && ok; h++) {
          const i = h - firstHour;
          if (i >= 0 && i < req.length && cov[i] - coverageOf(c, h, rules.breakHours) + 1e-9 < req[i]) ok = false;
        }
        if (!ok) break;
        n[j]--;
        for (let h = c.start; h < c.start + c.length; h++) {
          const i = h - firstHour;
          if (i >= 0 && i < req.length) cov[i] -= coverageOf(c, h, rules.breakHours);
        }
      }
    }
    return cands.map((c, j) => ({ c, n: n[j] })).filter((p) => p.n > 0);
  };

  let picks = res.feasible ? read(res, (x) => Math.round(x)) : [];
  let method: "ilp" | "lp-repair" = "ilp";
  if (!res.feasible || !covers(picks)) picks = [];
  const fix = repair();
  if (picks.length === 0 || cost(fix) < cost(picks) - 1e-9) { picks = fix; method = "lp-repair"; }
  const paid = cost(picks);
  return { picks, paid, lowerBound, method, feasible: covers(picks), variables: cands.length, ms: performance.now() - t0 };
}

export function buildSchedule(
  requirements: StaffRequirementDetail[],
  employees: Employee[],
  rulesIn: Partial<Rules> = {},
): ScheduleResult {
  const rules: Rules = { ...DEFAULT_RULES, ...rulesIn };
  const dates = [...new Set(requirements.map((r) => r.businessDate))].sort();
  if (dates.length === 0) {
    return { shifts: [], coverage: [], cost: { plannedPaidHours: 0, assignedPaidHours: 0, requiredPersonHours: 0, shiftCount: 0, unfilledShifts: 0 }, hoursByEmployee: [], violations: [], solves: [] };
  }
  const day0 = dates[0];

  // ---- Step 1: ILP per day and role ----
  const shifts: Shift[] = [];
  const solves: DaySolve[] = [];
  const coverage: CoverageHour[] = [];
  let plannedPaid = 0;
  for (const date of dates) {
    const rows = requirements.filter((r) => r.businessDate === date).sort((a, b) => a.hour - b.hour);
    const dayIndex = daysBetween(day0, date);
    const weekday = rows[0].weekday;
    const first = rows[0].hour, last = rows[rows.length - 1].hour;
    const reqCrew = new Array(last - first + 1).fill(0);
    const reqMgr = new Array(last - first + 1).fill(0);
    for (const r of rows) { reqCrew[r.hour - first] = r.front + r.kitchen; reqMgr[r.hour - first] = r.manager; }
    for (const [role, req] of [["manager", reqMgr], ["crew", reqCrew]] as const) {
      const sol = solveDay(first, req, rules);
      solves.push({ businessDate: date, role, variables: sol.variables, ms: Math.round(sol.ms), paidHours: sol.paid, lowerBound: Math.round(sol.lowerBound * 100) / 100, method: sol.method, feasible: sol.feasible });
      plannedPaid += sol.paid;
      for (const p of sol.picks) {
        for (let k = 0; k < p.n; k++) {
          shifts.push({
            id: `${date}-${role}-${p.c.start}-${p.c.length}-${p.c.breakHour ?? "x"}-${k}`,
            role, dayIndex, businessDate: date, weekday,
            start: p.c.start, length: p.c.length, breakHour: p.c.breakHour,
          });
        }
      }
    }
    for (const r of rows) {
      coverage.push({
        time: r.time, businessDate: date, hour: r.hour,
        crewRequired: r.front + r.kitchen, crewPlanned: 0, crewAssigned: 0,
        managerRequired: r.manager, managerPlanned: 0, managerAssigned: 0,
      });
    }
  }

  // ---- Step 2: greedy assignment ----
  const byEmp = new Map<string, Shift[]>(employees.map((e) => [e.id, []]));
  const legalUsed = new Map<string, number>(employees.map((e) => [e.id, 0]));
  const order = [...shifts].sort((a, b) =>
    absStart(a) - absStart(b) || (a.role === b.role ? 0 : a.role === "manager" ? -1 : 1) || b.length - a.length);
  const eligible = (e: Employee, s: Shift, except?: Shift): boolean => {
    const block = Math.floor(s.dayIndex / 7);
    const mine = byEmp.get(e.id)!.filter((x) => x !== except);
    const g = groupRules(e, rules);
    // Daily rest against shifts in neighbouring 7-day blocks.
    if (mine.some((x) => Math.floor(x.dayIndex / 7) !== block &&
      Math.max(absStart(s) - absEnd(x), absStart(x) - absEnd(s)) < g.minDailyRest)) return false;
    return canTake(e, mine.filter((x) => Math.floor(x.dayIndex / 7) === block), s, rules, weekStartOf(block));
  };
  /** True when the employee already has a free period long enough for the weekly rest before this shift. */
  const restSecured = (e: Employee, s: Shift): boolean => {
    const block = Math.floor(s.dayIndex / 7);
    const mine = byEmp.get(e.id)!.filter((x) => Math.floor(x.dayIndex / 7) === block).sort((a, b) => absStart(a) - absStart(b));
    let prev = weekStartOf(block);
    for (const x of mine) { if (absStart(x) - prev >= groupRules(e, rules).minWeeklyRest) return true; prev = absEnd(x); }
    return absStart(s) - prev >= groupRules(e, rules).minWeeklyRest;
  };
  const owner = new Map<Shift, Employee | null>();
  const give = (s: Shift, e: Employee) => {
    byEmp.get(e.id)!.push(s);
    legalUsed.set(e.id, legalUsed.get(e.id)! + s.length);
    owner.set(s, e);
  };
  const take = (s: Shift, e: Employee) => {
    byEmp.set(e.id, byEmp.get(e.id)!.filter((x) => x !== s));
    legalUsed.set(e.id, legalUsed.get(e.id)! - s.length);
    owner.set(s, null);
  };

  for (const s of order) {
    let best: Employee | null = null, bestScore = Infinity;
    for (const e of employees) {
      if (!eligible(e, s)) continue;
      // Score: how full the contract already is. Penalties: going past the
      // contract, a manager on a crew shift, and using someone who has not yet
      // had the weekly free period (keeps them available later in the week).
      const used = legalUsed.get(e.id)!;
      let score = (used + s.length) / e.contractHours;
      if (used + s.length > e.contractHours) score += 10;
      if (s.role === "crew" && e.canManage) score += 0.5;
      if (!restSecured(e, s)) score += 0.3;
      if (score < bestScore - 1e-12) { best = e; bestScore = score; }
    }
    if (best) give(s, best); else owner.set(s, null);
  }

  // Repair: for each unfilled shift, try a one-step swap. Someone who could take
  // it hands one of their shifts to a third person who can legally take that one.
  for (const u of order) {
    if (owner.get(u)) continue;
    let done = false;
    for (const e of employees) {
      if (done) break;
      if (u.role === "manager" && !e.canManage) continue;
      for (const x of [...byEmp.get(e.id)!]) {
        if (!eligible(e, u, x)) continue;
        take(x, e);
        const f = employees.find((o) => o.id !== e.id && eligible(o, x));
        if (f) { give(x, f); give(u, e); done = true; break; }
        give(x, e);
      }
    }
  }

  const assigned: AssignedShift[] = order.map((s) => {
    const e = owner.get(s) ?? null;
    return { ...s, employeeId: e?.id ?? null, employeeName: e?.name ?? null, paidHours: paidHours(s, rules) };
  });

  // ---- Coverage and violations ----
  const covIndex = new Map(coverage.map((c) => [`${c.businessDate}|${c.hour}`, c]));
  for (const a of assigned) {
    for (let h = a.start; h < a.start + a.length; h++) {
      const c = covIndex.get(`${a.businessDate}|${h}`);
      if (!c) continue;
      const v = coverageOf(a, h, rules.breakHours);
      if (a.role === "crew") { c.crewPlanned += v; if (a.employeeId) c.crewAssigned += v; }
      else { c.managerPlanned += v; if (a.employeeId) c.managerAssigned += v; }
    }
  }
  const violations: Violation[] = [];
  for (const a of assigned) {
    if (!a.employeeId) {
      violations.push({ kind: "unfilled", shiftId: a.id, businessDate: a.businessDate, hour: a.start, detail: `${a.role} shift ${a.start}:00 +${a.length} h has no legal taker` });
    }
  }
  for (const c of coverage) {
    if (c.crewAssigned + 1e-9 < c.crewRequired) violations.push({ kind: "understaffed", businessDate: c.businessDate, hour: c.hour, detail: `crew ${c.crewAssigned} < ${c.crewRequired}` });
    if (c.managerAssigned + 1e-9 < c.managerRequired) violations.push({ kind: "understaffed", businessDate: c.businessDate, hour: c.hour, detail: `manager ${c.managerAssigned} < ${c.managerRequired}` });
  }
  violations.push(...checkRoster(assigned.map((a) => ({ shift: a, employeeId: a.employeeId })), employees, rules));

  const hoursByEmployee = employees.map((e) => {
    const mine = assigned.filter((a) => a.employeeId === e.id);
    return {
      employeeId: e.id, name: e.name, ageGroup: e.ageGroup, contractHours: e.contractHours,
      legalHours: mine.reduce((x, a) => x + a.length, 0),
      paidHours: mine.reduce((x, a) => x + a.paidHours, 0),
      shifts: mine.length,
    };
  });

  assigned.sort((a, b) => absStart(a) - absStart(b) || a.role.localeCompare(b.role));
  return {
    shifts: assigned,
    coverage,
    cost: {
      plannedPaidHours: plannedPaid,
      assignedPaidHours: assigned.filter((a) => a.employeeId).reduce((x, a) => x + a.paidHours, 0),
      requiredPersonHours: requirements.reduce((x, r) => x + r.total, 0),
      shiftCount: assigned.length,
      unfilledShifts: assigned.filter((a) => !a.employeeId).length,
    },
    hoursByEmployee,
    violations,
    solves,
  };
}
