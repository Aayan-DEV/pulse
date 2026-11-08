// Forecast (transactions per hour) -> staff needed per hour.
//
// front   = Erlang C on the counter channel only (kiosk and delivery orders
//           need no cashier). Gans, Koole and Mandelbaum (2003), see erlang.ts.
// kitchen = ceil(transactions / kitchen labor standard), at least a minimum crew.
// manager = 1 per staffed hour.
// Plus pre-open and close-down hours with a fixed crew.
//
// Every number below that is not cited is an ASSUMPTION and is a parameter.
// See docs/staffing-method.md for the source list.

import type { ForecastHour, StaffRequirement } from "../types";
import {
  agentsForServiceLevel, betaForPWait, erlangSummary, offeredLoad, squareRootStaffing,
} from "./erlang";
import { toLocalHour } from "./time";

export type Quantile = "p50" | "p90";
export type FrontMethod = "erlangC" | "squareRoot";

export type OpeningHours = { open: number; close: number }; // business hours, close is exclusive (25 = 01:00)

export type StaffingParams = {
  /** Which forecast quantile to staff to. P50 = expected day; P90 = "safe" plan that covers 9 in 10 hours. */
  quantile: Quantile;
  /** erlangC = exact M/M/c search; squareRoot = Halfin-Whitt N = R + beta*sqrt(R). */
  frontMethod: FrontMethod;
  /** Share of transactions ordered at a self-service kiosk. ASSUMPTION (see docs). */
  kioskShare: number;
  /** Share of transactions from delivery apps (Wolt, Foodora) and web. ASSUMPTION. */
  deliveryShare: number;
  /** Mean counter order-taking + payment time per order, seconds. ASSUMPTION anchored on a 34.9 s measured cash time (Curin et al. 2005). */
  counterAhtSec: number;
  /** Service target: share of counter customers who start ordering within targetWaitSec. ASSUMPTION (the 80/20 call-centre convention). */
  targetSL: number;
  targetWaitSec: number;
  /** Target P{Wait>0} for the squareRoot method (Gans et al. 2003 eq. 14-15). ASSUMPTION. */
  sqrtTargetPWait: number;
  /** Cap on cashier occupancy so nobody is busy 100 % of the hour. ASSUMPTION. */
  maxOccupancy: number;
  /** Transactions one kitchen worker can produce per hour. ASSUMPTION (no public standard found). */
  kitchenTxPerWorkerHour: number;
  minFront: number;
  minKitchen: number;
  managersPerHour: number;
  preOpenHours: number;
  closeDownHours: number;
  /** Crew (excluding the manager) in pre-open and close-down hours. ASSUMPTION. */
  prepCrew: number;
  /** Opening hours per weekday, 0 = Monday. ASSUMPTION: 10:00-01:00, Fri/Sat 10:00-03:00. */
  openingHours: OpeningHours[];
};

const SUN_THU: OpeningHours = { open: 10, close: 25 };
const FRI_SAT: OpeningHours = { open: 10, close: 27 };

export const DEFAULT_STAFFING: StaffingParams = {
  quantile: "p50",
  frontMethod: "erlangC",
  kioskShare: 0.35,
  deliveryShare: 0.15,
  counterAhtSec: 60,
  targetSL: 0.8,
  targetWaitSec: 60,
  sqrtTargetPWait: 0.2,
  maxOccupancy: 0.85,
  kitchenTxPerWorkerHour: 30,
  minFront: 1,
  minKitchen: 2,
  managersPerHour: 1,
  preOpenHours: 1,
  closeDownHours: 1,
  prepCrew: 2,
  openingHours: [SUN_THU, SUN_THU, SUN_THU, SUN_THU, FRI_SAT, FRI_SAT, SUN_THU],
};

export type Phase = "preopen" | "open" | "close";

export type StaffRequirementDetail = StaffRequirement & {
  manager: number;
  phase: Phase;
  businessDate: string;
  weekday: number;      // 0 = Monday
  hour: number;         // business hour 0..29 (25 = 01:00 next day)
  quantile: Quantile;
  counterArrivals: number;  // lambda, orders per hour at the counter
  load: number;             // A = lambda * AHT / 3600, Erlangs
  pWait: number;            // P{Wait > 0}
  asaSec: number;
  occupancy: number;
};

export function staffRequirements(
  forecast: ForecastHour[],
  params: Partial<StaffingParams> = {},
): StaffRequirementDetail[] {
  const p: StaffingParams = { ...DEFAULT_STAFFING, ...params };
  if (p.kioskShare + p.deliveryShare > 1) throw new Error("kioskShare + deliveryShare must be <= 1");
  const counterShare = 1 - p.kioskShare - p.deliveryShare;

  // Group forecast hours by business day.
  type Row = { iso: string; ms: number; tx: number; date: string; weekday: number; hour: number };
  const byDay = new Map<string, Row[]>();
  for (const f of forecast) {
    const lh = toLocalHour(f.time);
    const tx = Math.max(0, f[p.quantile]);
    const row: Row = { iso: f.time, ms: Date.parse(f.time), tx, date: lh.businessDate, weekday: lh.weekday, hour: lh.hour };
    if (!byDay.has(row.date)) byDay.set(row.date, []);
    byDay.get(row.date)!.push(row);
  }

  const out: StaffRequirementDetail[] = [];
  const dates = [...byDay.keys()].sort();
  for (const date of dates) {
    const rows = byDay.get(date)!.sort((a, b) => a.hour - b.hour);
    const weekday = rows[0].weekday;
    const oh = p.openingHours[weekday];
    const anchor = rows[0];
    const isoAt = (hour: number) => {
      const r = rows.find((x) => x.hour === hour);
      return r ? r.iso : new Date(anchor.ms + (hour - anchor.hour) * 3_600_000).toISOString();
    };
    const first = oh.open - p.preOpenHours;
    const last = oh.close + p.closeDownHours - 1;
    for (let hour = first; hour <= last; hour++) {
      const time = isoAt(hour);
      const base = { businessDate: date, weekday, hour, quantile: p.quantile, time } as const;
      if (hour < oh.open || hour >= oh.close) {
        const phase: Phase = hour < oh.open ? "preopen" : "close";
        out.push({
          ...base, phase, transactions: 0, front: 0, kitchen: p.prepCrew, manager: p.managersPerHour,
          total: p.prepCrew + p.managersPerHour, serviceLevel: 1,
          counterArrivals: 0, load: 0, pWait: 0, asaSec: 0, occupancy: 0,
        });
        continue;
      }
      const tx = rows.find((x) => x.hour === hour)?.tx ?? 0;
      const lambda = tx * counterShare;
      let er = agentsForServiceLevel(lambda, p.counterAhtSec, p.targetWaitSec, p.targetSL, p.maxOccupancy);
      if (p.frontMethod === "squareRoot" && lambda > 0) {
        // Halfin-Whitt: choose beta so P{Wait>0} ~= sqrtTargetPWait, then N = R + beta*sqrt(R).
        const A = offeredLoad(lambda, p.counterAhtSec);
        const beta = betaForPWait(p.sqrtTargetPWait);
        er = erlangSummary(Math.max(squareRootStaffing(A, beta), Math.floor(A) + 1), lambda, p.counterAhtSec, p.targetWaitSec);
      }
      const front = Math.max(p.minFront, er.servers);
      const fin = front === er.servers ? er : erlangSummary(front, lambda, p.counterAhtSec, p.targetWaitSec);
      const kitchen = Math.max(p.minKitchen, Math.ceil(tx / p.kitchenTxPerWorkerHour));
      out.push({
        ...base, phase: "open", transactions: round2(tx), front, kitchen, manager: p.managersPerHour,
        total: front + kitchen + p.managersPerHour,
        serviceLevel: round4(fin.serviceLevel),
        counterArrivals: round2(lambda), load: round4(fin.load), pWait: round4(fin.pWait),
        asaSec: round2(fin.asaSec), occupancy: round4(fin.occupancy),
      });
    }
  }
  return out;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const round4 = (x: number) => Math.round(x * 10_000) / 10_000;
