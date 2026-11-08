// Wage cost of a shift plan at the legal minimum wage, plus the collective-agreement extras.
// Rates from the owner demand calendar, item 14 (docs/bk-klingenberg-demand-calendar.md):
//   Minimum wage from 6 Nov 2026: https://lovdata.no/dokument/SF/forskrift/2026-10-22-2235
//   Extras if bound by Riksavtalen 2026: https://www.fellesforbundet.no/globalassets/blokker/t26/riksavtalen/stemmemateriell-riksavtalen---2026.pdf
import type { AssignedShift } from "./schedule";
import type { Employee, Rules } from "./rules";
import { DEFAULT_RULES } from "./rules";

export const MIN_WAGE_NOK = { adult: 215.29, age18: 176.84, age17: 162.58, under17: 153.08 } as const;

/** NOK per hour by roster group. ASSUMPTION: "youth 16-17" are paid as 17-year-olds; school-age (15) as under 17. */
export const RATE_BY_GROUP: Record<Employee["ageGroup"], number> = {
  adult: MIN_WAGE_NOK.adult,
  youth: MIN_WAGE_NOK.age17,
  school: MIN_WAGE_NOK.under17,
};

export const EXTRAS_NOK = {
  evening: 16.59,    // ASSUMPTION on the window: 18:00-21:00 (the calendar gives the rate, not the window)
  weekend: 31.52,    // Saturday from 14:00 and all Sunday
  night: 58.04,      // ASSUMPTION on the window: 21:00-06:00, the AML § 10-11 night window
} as const;

export type WageCost = {
  paidHours: number;
  baseNok: number;        // paid hours x minimum wage
  extrasNok: number;      // agreement extras, only owed if bound by the agreement
  nightHours: number;
  weekendHours: number;
  unpricedHours: number;  // unfilled shifts, priced at the adult rate
};

/** Hour-by-hour pricing of every assigned shift. Breaks are unpaid (same rule as the scheduler). */
export function wageCost(shifts: AssignedShift[], roster: Employee[], rules: Rules = DEFAULT_RULES): WageCost {
  const byId = new Map(roster.map((e) => [e.id, e]));
  const out: WageCost = { paidHours: 0, baseNok: 0, extrasNok: 0, nightHours: 0, weekendHours: 0, unpricedHours: 0 };
  for (const s of shifts) {
    const e = s.employeeId ? byId.get(s.employeeId) : undefined;
    const rate = e ? RATE_BY_GROUP[e.ageGroup] : MIN_WAGE_NOK.adult;
    if (!e) out.unpricedHours += s.paidHours;
    // Scale each on-site hour by paid/length so the unpaid break is spread evenly.
    const paidShare = s.length > 0 ? s.paidHours / s.length : 0;
    for (let h = s.start; h < s.start + s.length; h++) {
      const w = paidShare * Math.min(1, s.start + s.length - h);
      const clock = h % 24;                         // business hour 25 = 01:00 the next day
      const wd = (s.weekday + Math.floor(h / 24)) % 7; // 0 = Monday, 5 = Saturday, 6 = Sunday
      const night = clock >= 21 || clock < 6;
      const evening = clock >= 18 && clock < 21;
      const weekend = (wd === 5 && clock >= 14) || wd === 6;
      out.paidHours += w;
      out.baseNok += w * rate;
      let extra = 0;
      if (night) { extra += EXTRAS_NOK.night; out.nightHours += w; }
      else if (evening) extra += EXTRAS_NOK.evening;
      if (weekend) { extra += EXTRAS_NOK.weekend; out.weekendHours += w; }
      out.extrasNok += w * extra;
    }
  }
  void rules;
  return out;
}
