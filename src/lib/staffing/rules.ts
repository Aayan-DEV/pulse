// Norwegian working-time rules used by the roster, with the paragraph each
// number comes from. All verified on Lovdata on 2026-11-08:
//   Arbeidsmiljøloven (AML): https://lovdata.no/dokument/NL/lov/2005-06-17-62
//   (paragraph links: https://lovdata.no/dokument/NL/lov/2005-06-17-62/§10-8)
//   Youth night rules: forskrift om organisering, ledelse og medvirkning § 12-9,
//   https://lovdata.no/dokument/SF/forskrift/2011-12-06-1355/§12-9
// Tariff agreements (e.g. Riksavtalen NHO Reiseliv / Fellesforbundet) can change
// some limits (AML § 10-12 (4)); they are NOT modelled here.

export type AgeGroup =
  | "adult"   // 18+
  | "youth"   // 15-18 and not of compulsory school age (AML § 11-2 (3))
  | "school"; // under 15 or of compulsory school age (AML § 11-2 (2))

export type GroupRules = {
  maxDailyHours: number;        // per 24 h
  maxDailyHoursSchoolDay?: number;
  maxWeeklyHours: number;       // per 7 days
  maxWeeklyHoursSchoolWeek?: number;
  minDailyRest: number;         // continuous hours off between shifts
  minWeeklyRest: number;        // continuous hours off in 7 days
  earliestStart: number;        // business hour (6 = 06:00)
  latestEnd: number;            // business hour (21 = 21:00, 24 = midnight)
  breakAfterHours: number;      // a 30 min break is required when the shift is longer than this
};

export type Rules = {
  adult: GroupRules & { sundayRotaMaxWeeklyHours: number; nightMaxShiftHours: number; nightStart: number; nightEnd: number };
  youth: GroupRules;
  school: GroupRules;
  /** Treat this week as a school week (term time) for "school" employees. */
  schoolWeek: boolean;
  /** Mon-Fri are school days in term time. */
  schoolDays: number[];
  minShiftHours: number;
  maxShiftHours: number;
  /** Breaks are unpaid (staff may leave the workplace, AML § 10-9 (1)). ASSUMPTION. */
  breakIsPaid: boolean;
  breakHours: number;
};

export const DEFAULT_RULES: Rules = {
  adult: {
    maxDailyHours: 9,            // AML § 10-4 (1): 9 h per 24 h
    maxWeeklyHours: 40,          // AML § 10-4 (1): 40 h per 7 days
    sundayRotaMaxWeeklyHours: 38, // AML § 10-4 (4) c: 38 h if the rota makes you work at least every 3rd Sunday
    minDailyRest: 11,            // AML § 10-8 (1)
    minWeeklyRest: 35,           // AML § 10-8 (2)
    earliestStart: 0,
    latestEnd: 30,
    breakAfterHours: 5.5,        // AML § 10-9 (1)
    nightStart: 21,              // AML § 10-11 (1): 21:00-06:00 is night work
    nightEnd: 30,
    nightMaxShiftHours: 8,       // AML § 10-11 (6): >3 h at night -> average max 8 h per 24 h (applied per shift, stricter)
  },
  youth: {
    maxDailyHours: 8,            // AML § 11-2 (3)
    maxWeeklyHours: 40,          // AML § 11-2 (3)
    minDailyRest: 12,            // AML § 11-5 (2) b
    minWeeklyRest: 48,           // AML § 11-5 (3)
    earliestStart: 6,            // AML § 11-3 (2): free 23:00-06:00
    latestEnd: 21,               // AML § 11-3 (2): 21-23 only if "necessary"; we take the safe side and stop at 21:00
    breakAfterHours: 4.5,        // AML § 11-5 (1)
  },
  school: {
    maxDailyHours: 7,            // AML § 11-2 (2) b: non-school days
    maxDailyHoursSchoolDay: 2,   // AML § 11-2 (2) a
    maxWeeklyHours: 35,          // AML § 11-2 (2) b: non-school weeks
    maxWeeklyHoursSchoolWeek: 12, // AML § 11-2 (2) a
    minDailyRest: 14,            // AML § 11-5 (2) a
    minWeeklyRest: 48,           // AML § 11-5 (3)
    earliestStart: 6,            // AML § 11-3 (1): no work 20:00-06:00
    latestEnd: 20,
    breakAfterHours: 4.5,        // AML § 11-5 (1)
  },
  schoolWeek: true,
  schoolDays: [0, 1, 2, 3, 4],
  minShiftHours: 4,
  maxShiftHours: 9,
  breakIsPaid: false,
  breakHours: 0.5,
};

export type Employee = {
  id: string;
  name: string;
  ageGroup: AgeGroup;
  canManage: boolean;
  contractHours: number;  // agreed weekly hours (full-time 37.5 per Riksavtalen § 2.1, part-time less)
};

/**
 * Synthetic roster of 45 (brreg: 45 employees). The mix is an ASSUMPTION:
 * 6 shift managers, 10 full-time crew, 19 part-time adults, 8 youth 16-17,
 * 2 school-age 15-year-olds.
 */
export function syntheticRoster(): Employee[] {
  const out: Employee[] = [];
  let n = 1;
  const add = (count: number, e: Omit<Employee, "id" | "name">, label: string) => {
    for (let i = 0; i < count; i++, n++) out.push({ id: `E${String(n).padStart(2, "0")}`, name: `${label} ${i + 1}`, ...e });
  };
  add(6, { ageGroup: "adult", canManage: true, contractHours: 37.5 }, "Shift manager");
  add(10, { ageGroup: "adult", canManage: false, contractHours: 37.5 }, "Crew FT");
  const pt = [30, 25, 24, 20, 20, 20, 18, 16, 16, 15, 15, 14, 12, 12, 12, 10, 10, 8, 8];
  pt.forEach((h, i) => out.push({ id: `E${String(n++).padStart(2, "0")}`, name: `Crew PT ${i + 1}`, ageGroup: "adult", canManage: false, contractHours: h }));
  const yt = [16, 15, 15, 12, 12, 12, 10, 10];
  yt.forEach((h, i) => out.push({ id: `E${String(n++).padStart(2, "0")}`, name: `Youth 16-17 ${i + 1}`, ageGroup: "youth", canManage: false, contractHours: h }));
  add(2, { ageGroup: "school", canManage: false, contractHours: 10 }, "School-age 15");
  return out;
}

// ---------------- shift geometry ----------------

export type Shift = {
  id: string;
  role: "manager" | "crew";
  dayIndex: number;     // 0 = first business day of the plan
  businessDate: string;
  weekday: number;      // 0 = Monday
  start: number;        // business hour, may be > 24
  length: number;       // on-site span in hours
  breakHour: number | null; // business hour in which the 30 min break is taken
};

export const absStart = (s: Shift) => s.dayIndex * 24 + s.start;
export const absEnd = (s: Shift) => absStart(s) + s.length;

export function paidHours(s: Shift, rules: Rules): number {
  return s.length - (s.breakHour !== null && !rules.breakIsPaid ? rules.breakHours : 0);
}

/** Hours of the shift that fall in the AML § 10-11 night window. */
export function nightHours(start: number, length: number, rules: Rules): number {
  const a = Math.max(start, rules.adult.nightStart);
  const b = Math.min(start + length, rules.adult.nightEnd);
  return Math.max(0, b - a);
}

/**
 * Working time counted against legal limits. Conservative: the whole on-site
 * span, including the break (AML § 10-9 (1) counts the break as working time
 * when staff cannot leave; we always count it so limits hold either way).
 */
export const legalHours = (s: Shift) => s.length;
