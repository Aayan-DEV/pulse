// Legal checks for one employee's set of shifts. Used two ways:
//  1. canTake(): the greedy assigner asks "may this person also take this shift?"
//  2. checkRoster(): an independent audit of the finished roster (tests assert zero).

import {
  type Employee, type GroupRules, type Rules, type Shift,
  absEnd, absStart, legalHours, nightHours,
} from "./rules";

export type Violation = {
  kind:
    | "unfilled" | "understaffed"
    | "dailyRest" | "weeklyRest" | "dailyHours" | "weeklyHours"
    | "youthNight" | "nightShiftLength" | "shiftLength" | "role";
  employeeId?: string;
  shiftId?: string;
  businessDate?: string;
  hour?: number;
  detail: string;
  law?: string; // paragraph reference
};

export const groupRules = (e: Employee, r: Rules): GroupRules => r[e.ageGroup];

/** Is this shift inside the Sunday-work window of AML § 10-10 (1): Sat 18:00 to Sun 22:00? */
export function touchesSunday(s: Shift): boolean {
  const end = s.start + s.length;
  if (s.weekday === 5) return end > 18;       // Saturday business day, after 18:00 (incl. after midnight)
  if (s.weekday === 6) return s.start < 22;   // Sunday business day, before 22:00
  return false;
}

export function weeklyLimit(e: Employee, shifts: Shift[], r: Rules): { limit: number; law: string } {
  if (e.ageGroup === "school") {
    return r.schoolWeek
      ? { limit: r.school.maxWeeklyHoursSchoolWeek!, law: "AML § 11-2 (2) a" }
      : { limit: r.school.maxWeeklyHours, law: "AML § 11-2 (2) b" };
  }
  if (e.ageGroup === "youth") return { limit: r.youth.maxWeeklyHours, law: "AML § 11-2 (3)" };
  return shifts.some(touchesSunday)
    ? { limit: r.adult.sundayRotaMaxWeeklyHours, law: "AML § 10-4 (4) c" }
    : { limit: r.adult.maxWeeklyHours, law: "AML § 10-4 (1)" };
}

function dailyLimit(e: Employee, s: Shift, r: Rules): { limit: number; law: string } {
  if (e.ageGroup === "school") {
    return r.schoolWeek && r.schoolDays.includes(s.weekday)
      ? { limit: r.school.maxDailyHoursSchoolDay!, law: "AML § 11-2 (2) a" }
      : { limit: r.school.maxDailyHours, law: "AML § 11-2 (2) b" };
  }
  if (e.ageGroup === "youth") return { limit: r.youth.maxDailyHours, law: "AML § 11-2 (3)" };
  return { limit: r.adult.maxDailyHours, law: "AML § 10-4 (1)" };
}

/**
 * All violations for one employee's shifts within one 7-day block that starts
 * at absolute hour weekStart (block length 168 h).
 */
export function checkEmployee(e: Employee, shifts: Shift[], r: Rules, weekStart: number): Violation[] {
  const v: Violation[] = [];
  const g = groupRules(e, r);
  const sorted = [...shifts].sort((a, b) => absStart(a) - absStart(b));
  const base = { employeeId: e.id };

  for (const s of sorted) {
    const at = { ...base, shiftId: s.id, businessDate: s.businessDate, hour: s.start };
    if (s.role === "manager" && !e.canManage) v.push({ ...at, kind: "role", detail: "manager shift given to non-manager" });
    if (s.length < r.minShiftHours || s.length > r.maxShiftHours) v.push({ ...at, kind: "shiftLength", detail: `length ${s.length} h` });
    const dl = dailyLimit(e, s, r);
    if (legalHours(s) > dl.limit) v.push({ ...at, kind: "dailyHours", detail: `${legalHours(s)} h > ${dl.limit} h`, law: dl.law });
    if (s.start < g.earliestStart || s.start + s.length > g.latestEnd) {
      v.push({ ...at, kind: "youthNight", detail: `works ${s.start}-${s.start + s.length}, allowed ${g.earliestStart}-${g.latestEnd}`, law: e.ageGroup === "school" ? "AML § 11-3 (1)" : "AML § 11-3 (2)" });
    }
    if (e.ageGroup === "adult" && nightHours(s.start, s.length, r) > 3 && s.length > r.adult.nightMaxShiftHours) {
      v.push({ ...at, kind: "nightShiftLength", detail: `${s.length} h with >3 h at night`, law: "AML § 10-11 (6)" });
    }
  }

  // Any 24 h window: total working time <= daily limit. The max is reached at a shift start.
  for (const s of sorted) {
    const t0 = absStart(s);
    let tot = 0;
    for (const o of sorted) tot += Math.max(0, Math.min(absEnd(o), t0 + 24) - Math.max(absStart(o), t0));
    const dl = dailyLimit(e, s, r);
    if (tot > dl.limit + 1e-9) v.push({ ...base, kind: "dailyHours", shiftId: s.id, businessDate: s.businessDate, detail: `${tot} h in 24 h from ${s.businessDate} ${s.start}:00`, law: dl.law });
  }

  // Daily rest between consecutive shifts.
  for (let i = 1; i < sorted.length; i++) {
    const gap = absStart(sorted[i]) - absEnd(sorted[i - 1]);
    if (gap < g.minDailyRest) {
      v.push({ ...base, kind: "dailyRest", shiftId: sorted[i].id, businessDate: sorted[i].businessDate, detail: `${gap} h rest < ${g.minDailyRest} h`, law: e.ageGroup === "adult" ? "AML § 10-8 (1)" : "AML § 11-5 (2)" });
    }
  }

  // Weekly rest: the longest continuous free period inside the 7-day block.
  if (sorted.length > 0) {
    const weekEnd = weekStart + 168;
    let prev = weekStart, maxGap = 0;
    for (const s of sorted) { maxGap = Math.max(maxGap, absStart(s) - prev); prev = Math.max(prev, absEnd(s)); }
    maxGap = Math.max(maxGap, weekEnd - prev);
    if (maxGap < g.minWeeklyRest) {
      v.push({ ...base, kind: "weeklyRest", detail: `longest free period ${maxGap} h < ${g.minWeeklyRest} h`, law: e.ageGroup === "adult" ? "AML § 10-8 (2)" : "AML § 11-5 (3)" });
    }
  }

  // Weekly hours.
  const wl = weeklyLimit(e, sorted, r);
  const total = sorted.reduce((a, s) => a + legalHours(s), 0);
  if (total > wl.limit + 1e-9) v.push({ ...base, kind: "weeklyHours", detail: `${total} h > ${wl.limit} h`, law: wl.law });

  return v;
}

export function canTake(e: Employee, current: Shift[], s: Shift, r: Rules, weekStart: number): boolean {
  if (s.role === "manager" && !e.canManage) return false;
  return checkEmployee(e, [...current, s], r, weekStart).length === 0;
}

/** Audit a full roster: shifts grouped per employee and per 7-day block. */
export function checkRoster(
  assignments: { shift: Shift; employeeId: string | null }[],
  employees: Employee[],
  r: Rules,
): Violation[] {
  const byEmp = new Map<string, Shift[]>();
  for (const a of assignments) {
    if (!a.employeeId) continue;
    if (!byEmp.has(a.employeeId)) byEmp.set(a.employeeId, []);
    byEmp.get(a.employeeId)!.push(a.shift);
  }
  const out: Violation[] = [];
  for (const e of employees) {
    const shifts = byEmp.get(e.id) ?? [];
    const blocks = new Map<number, Shift[]>();
    for (const s of shifts) {
      const w = Math.floor(s.dayIndex / 7);
      if (!blocks.has(w)) blocks.set(w, []);
      blocks.get(w)!.push(s);
    }
    for (const [w, ss] of blocks) out.push(...checkEmployee(e, ss, r, weekStartOf(w)));
    // Daily rest across block boundaries too.
    const all = [...shifts].sort((a, b) => absStart(a) - absStart(b));
    const g = groupRules(e, r);
    for (let i = 1; i < all.length; i++) {
      if (Math.floor(all[i].dayIndex / 7) === Math.floor(all[i - 1].dayIndex / 7)) continue;
      const gap = absStart(all[i]) - absEnd(all[i - 1]);
      if (gap < g.minDailyRest) out.push({ employeeId: e.id, kind: "dailyRest", shiftId: all[i].id, detail: `${gap} h rest across weeks`, law: "AML § 10-8 (1)" });
    }
  }
  return out;
}

/** 7-day block w runs from 06:00 on its first business day for 168 h. */
export const weekStartOf = (w: number) => w * 168 + 6;
