// SYNTHETIC forecast for tests and for the UI before the model output exists.
// Shape only (lunch and dinner peaks, busier Fri/Sat nights). Not a prediction.

import type { ForecastHour } from "../types";
import { addDays } from "./time";

const BASE: Record<number, number> = {
  10: 30, 11: 60, 12: 130, 13: 140, 14: 90, 15: 80, 16: 100, 17: 150, 18: 160,
  19: 130, 20: 100, 21: 80, 22: 70, 23: 60, 24: 45, 25: 55, 26: 45, 27: 30,
};
// Real opening hours (owner calendar): Mon-Thu 10-24, Fri-Sat 10-04, Sun 11-24. Same as DEFAULT_STAFFING.
const HOURS: [number, number][] = [[10, 24], [10, 24], [10, 24], [10, 24], [10, 28], [10, 28], [11, 24]];
const DAY_MULT = [0.85, 0.85, 0.9, 1.0, 1.25, 1.3, 1.0]; // Mon..Sun

/** One week of hourly P10/P50/P90 starting on a Monday (YYYY-MM-DD), CET (+01:00). */
export function syntheticWeekForecast(monday = "2026-11-16"): ForecastHour[] {
  const out: ForecastHour[] = [];
  for (let d = 0; d < 7; d++) {
    const date = addDays(monday, d);
    const [openH, close] = HOURS[d];
    for (let h = openH; h < close; h++) {
      const night = (d === 4 || d === 5) && h >= 23 ? 1.6 : 1;
      const p50 = Math.round(BASE[h] * DAY_MULT[d] * night);
      const cal = h >= 24 ? addDays(date, 1) : date;
      const hh = String(h % 24).padStart(2, "0");
      out.push({
        time: `${cal}T${hh}:00:00+01:00`,
        p10: Math.round(p50 * 0.75), p50, p90: Math.round(p50 * 1.3),
        drivers: [],
      });
    }
  }
  return out;
}
