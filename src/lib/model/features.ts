// Live feature builder. MUST match model/features.py exactly (scripts/model/parity.ts checks it).
import Holidays from "date-holidays";
import type { CityEvent, CruiseCall, TransitDeparture, TransitSituation, WeatherHour } from "../types";
import { STORE } from "../types";

export const FEATURE_NAMES = [
  "hour", "dow", "month", "years_since_2023",
  "is_holiday", "school_holiday", "payday_window", "days_to_christmas",
  "temp_c", "precip_mm", "wind_ms",
  "ev_active", "ev_pre", "ev_post", "ev_near_count",
  "transit_disruption", "rail_late5_share", "rail_cancelled_share", "metro_late5_share",
  "cruise_pax",
  "xmas_market",
] as const;

/** Hourly Entur delay stats. Leave a field undefined (or NaN) when unknown. */
export type TransitStats = {
  railLate5Share?: number | null;
  railCancelledShare?: number | null;
  metroLate5Share?: number | null;
};

const EPOCH_2023 = 1672531200; // 2023-01-01T00:00Z
const YEAR_S = 365.25 * 86400;
const DAY_MS = 86400000;

const hd = new Holidays("NO");
const holidayCache = new Map<number, Set<string>>();
function publicHolidays(year: number): Set<string> {
  let s = holidayCache.get(year);
  if (!s) {
    s = new Set(hd.getHolidays(year).filter((h) => h.type === "public").map((h) => h.date.slice(0, 10)));
    holidayCache.set(year, s);
  }
  return s;
}

/** Calendar date as a UTC-midnight Date (only the y/m/d matter). */
function ymd(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function isHoliday(d: Date): boolean {
  return publicHolidays(d.getUTCFullYear()).has(iso(d));
}
function weekdayMon0(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

function isoWeek(d: Date): number {
  const thu = new Date(d.getTime() + (3 - weekdayMon0(d)) * DAY_MS); // Thursday of this ISO week
  return 1 + Math.floor(daysBetween(thu, ymd(thu.getUTCFullYear(), 1, 1)) / 7);
}

function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}

function isSchoolHoliday(d: Date): number {
  const wk = isoWeek(d);
  if (wk === 8 || wk === 40) return 1;
  const e = easter(d.getUTCFullYear());
  const diff = daysBetween(d, e);
  if (diff >= -7 && diff <= 1) return 1;
  const md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  if (md >= 621 && md <= 817) return 1;
  if (md >= 1221 || md <= 102) return 1;
  return 0;
}

function payday(y: number, m: number): Date {
  const d = ymd(y, m, 20);
  while (weekdayMon0(d) >= 5 || isHoliday(d)) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
});

/** Local Europe/Oslo parts of an instant. */
export function osloParts(time: Date): { y: number; m: number; d: number; hour: number; dow: number } {
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(time)) p[x.type] = x.value;
  const y = +p.year, m = +p.month, d = +p.day, hour = +p.hour % 24;
  return { y, m, d, hour, dow: weekdayMon0(ymd(y, m, d)) };
}

/** Assumed opening hours: daily 10:00-01:00, Fri/Sat nights until 03:00. */
export function isOpen(time: Date): boolean {
  const { hour, dow } = osloParts(time);
  return hour >= 10 || hour === 0 || ((hour === 1 || hour === 2) && (dow === 5 || dow === 6));
}

function toRad(x: number): number {
  return x * (Math.PI / 180);
}
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0;
  const p1 = toRad(lat1), p2 = toRad(lat2), dp = toRad(lat2 - lat1), dl = toRad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const sec = (s: string) => Date.parse(s) / 1000;
const num = (v: number | null | undefined) => (v === null || v === undefined ? NaN : v);

/**
 * Build the model feature vector for the hour starting at `time`.
 * `situations` are Entur situations (severity slight/noImpact are ignored).
 * `transitStats` are optional hourly delay shares; see transitStatsFromDepartures.
 */
export function buildFeatures(
  time: Date,
  weather: Pick<WeatherHour, "tempC" | "precipMm" | "windMs">,
  events: CityEvent[],
  situations: TransitSituation[],
  cruise: CruiseCall[],
  transitStats?: TransitStats,
): number[] {
  const t = time.getTime() / 1000;
  const { y, m, d, hour, dow } = osloParts(time);
  const date = ymd(y, m, d);
  const p = payday(y, m);
  const sincePay = daysBetween(date, p);
  const dtx = daysBetween(ymd(y, 12, 24), date);
  const md = m * 100 + d;

  let evActive = 0, evPre = 0, evPost = 0, evNear = 0, transit = 0;
  for (const e of events) {
    const s = sec(e.start), en = sec(e.end);
    const dist = haversineKm(STORE.lat, STORE.lon, e.lat, e.lon);
    const active = t >= s && t < en;
    if (e.category === "transit") {
      if (dist <= 10 && active) transit = 1;
      continue;
    }
    if (e.category === "cruise" || dist > 3) continue;
    const A = e.expectedAttendance || 500;
    const w = A * Math.exp(-dist / 0.8);
    const durH = (en - s) / 3600.0;
    evActive += active ? w / Math.max(3.0, durH) / 100.0 : 0.0;
    if (durH <= 12) {
      evPre += s > t && s <= t + 3 * 3600 ? w / 1000.0 : 0.0;
      evPost += en <= t && en > t - 2 * 3600 ? w / 1000.0 : 0.0;
    }
    if (dist <= 1) evNear += active ? 1 : 0;
  }
  for (const s of situations) {
    if (s.severity === "slight" || s.severity === "noImpact") continue;
    const a = s.validFrom ? sec(s.validFrom) : -Infinity;
    const b = s.validTo ? sec(s.validTo) : Infinity;
    if (t >= a && t < b) transit = 1;
  }
  let cpax = 0;
  for (const c of cruise) {
    const a = sec(c.arrival), b = sec(c.departure);
    cpax += t >= a && t < b ? (c.passengers || 2500) / 1000.0 : 0.0;
  }

  return [
    hour, dow, m, (t - EPOCH_2023) / YEAR_S,
    isHoliday(date) ? 1 : 0, isSchoolHoliday(date), sincePay >= 0 && sincePay <= 2 ? 1 : 0, Math.min(60, Math.max(-7, dtx)),
    weather.tempC, weather.precipMm, weather.windMs,
    evActive, evPre, evPost, evNear,
    // No transitStats at all -> a typical hour (same as Python NEUTRAL); a null/NaN field -> unknown.
    transit,
    transitStats ? num(transitStats.railLate5Share) : 0.05,
    transitStats ? num(transitStats.railCancelledShare) : 0.0,
    transitStats ? num(transitStats.metroLate5Share) : 0.05,
    cpax,
    (md >= 1107 || md <= 103) && md !== 1224 ? 1 : 0, // Jul i Vinterland: 7 Nov..3 Jan, closed 24 Dec
  ];
}

/** Derive hourly delay shares from live Entur departures in [hourStart, hourStart + 1h). */
export function transitStatsFromDepartures(departures: TransitDeparture[], hourStart: Date): TransitStats {
  const a = hourStart.getTime(), b = a + 3600000;
  const inHour = departures.filter((x) => {
    const tt = Date.parse(x.time);
    return tt >= a && tt < b;
  });
  const share = (mode: string, f: (x: TransitDeparture) => boolean) => {
    const xs = inHour.filter((x) => x.mode.toLowerCase() === mode);
    return xs.length ? xs.filter(f).length / xs.length : NaN;
  };
  return {
    railLate5Share: share("rail", (x) => x.delayMin > 5),
    railCancelledShare: share("rail", (x) => x.cancelled),
    metroLate5Share: share("metro", (x) => x.delayMin > 5),
  };
}
