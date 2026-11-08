// What-if engine: reruns the real model with a scenario's inputs (an added event, weather, transit, cruise,
// payday or Christmas-market overrides) and compares it with the normal forecast on the same inputs.
import "server-only";
import { metWeather } from "./forecast";
import { readData } from "./data";
import type { CityEvent, CruiseCall, EventCategory, ForecastHour, WeatherHour } from "./types";
import { STORE } from "./types";
import { buildFeatures, FEATURE_NAMES, haversineKm, isOpen } from "./model/features";
import { drivers, predictQuantiles } from "./model/predict";
import { staffRequirements } from "./staffing/requirements";
import { MIN_WAGE_NOK } from "./staffing/cost";

export type ScenarioEvent = { title: string; category: EventCategory; lat: number; lon: number; attendance: number; startHour: number; durationH: number };
export type Scenario = {
  day: number;                       // 0 = today's business day (06:00 to 06:00)
  event?: ScenarioEvent | null;
  tbaneClosed?: boolean; heavySnow?: boolean; cruiseDay?: boolean; payday?: boolean; xmasMarket?: boolean;
};
type Pt = { time: string; p10: number; p50: number; p90: number };
export type WhatIfResult = {
  dayLabel: string; days: string[];
  hourly: { label: string; base: number; p10: number; p50: number; p90: number }[];
  daily: { label: string; base: number; p10: number; p50: number; p90: number }[];
  weekly: { label: string; base: number; p10: number; p50: number; p90: number }[];
  month: { label: string; base: number; p10: number; p50: number; p90: number }[];
  kpis: { orders: [number, number]; peakStaff: [number, number]; wageNok: [number, number]; busiest: [string, string] };
  perHour: { label: string; dFront: number; dKitchen: number; dOrders: number }[];
  shifts: { add: number; personHours: number };
  stock: { item: string; unit: string; delta: number }[];
  why: { group: string; delta: number; text: string }[];
  xmasInBaseline: boolean;
  notes: string[];
};

const IDX = (n: string) => (FEATURE_NAMES as readonly string[]).indexOf(n);
const hh = (t: Date) => t.toLocaleTimeString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
const dlab = (t: Date) => t.toLocaleDateString("en-GB", { timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short" });
const PER_ORDER = [ // ASSUMPTION: simple per-order ratios for a burger restaurant, not BK data
  { item: "Beef patties", unit: "pcs", r: 1.15 }, { item: "Fries", unit: "portions", r: 0.85 },
  { item: "Buns", unit: "pcs", r: 1.1 }, { item: "Drinks", unit: "cups", r: 0.9 },
];

function businessStart(now: Date): Date {
  const start = new Date(Math.floor(now.getTime() / 3600_000) * 3600_000);
  const localHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", hour12: false }).format(start)) % 24;
  return new Date(start.getTime() - ((localHour - 6 + 24) % 24) * 3600_000);
}

export async function runWhatIf(sc: Scenario): Promise<WhatIfResult> {
  const notes: string[] = [];
  const from = businessStart(new Date());
  const DAYS = 28, N = DAYS * 24;
  let weather: WeatherHour[] = [];
  try { weather = await metWeather(); } catch { notes.push("met.no is offline, so weather uses 5°C, dry, 3 m/s."); }
  const lastW = weather[weather.length - 1];
  const wAt = (t: Date): WeatherHour => {
    const ms = t.getTime();
    const hit = weather.find((x) => Math.abs(Date.parse(x.time) - ms) < 3.5 * 3600_000);
    if (hit) return hit;
    // Beyond met.no's range: repeat the same clock hour of the last forecast day.
    const same = lastW ? weather.filter((x) => new Date(x.time).getUTCHours() === t.getUTCHours()).pop() : undefined;
    return same ?? { time: t.toISOString(), tempC: 5, precipMm: 0, windMs: 3 };
  };
  const lib = [...readData<CityEvent[]>("events-upcoming.json", []), ...readData<CityEvent[]>("events-history.json", []), ...readData<CityEvent[]>("events-calendar.json", [])];
  const end = from.getTime() + (N + 6) * 3600_000;
  const seen = new Set<string>();
  const events = lib.filter((e) => !seen.has(e.id) && (seen.add(e.id), Date.parse(e.end) >= from.getTime() - 6 * 3600_000 && Date.parse(e.start) <= end));
  const cruise = [...readData<CruiseCall[]>("cruise-upcoming.json", []), ...readData<CruiseCall[]>("cruise-history.json", [])]
    .filter((c) => Date.parse(c.departure) >= from.getTime() && Date.parse(c.arrival) <= end);

  const day = Math.max(0, Math.min(6, sc.day));
  const d0 = from.getTime() + day * 86400_000, d1 = d0 + 86400_000;
  const dayStart = new Date(d0);
  const at = (h: number) => new Date(d0 + (h - 6) * 3600_000); // local clock hour on that business day (h may be > 24)

  // Scenario inputs, all through the model's own inputs.
  const sEvents = [...events]; const sCruise = [...cruise];
  if (sc.event) {
    const s = at(sc.event.startHour), e = new Date(s.getTime() + sc.event.durationH * 3600_000);
    sEvents.push({ id: "what-if-event", title: sc.event.title, category: sc.event.category, lat: sc.event.lat, lon: sc.event.lon,
      start: s.toISOString(), end: e.toISOString(), expectedAttendance: sc.event.attendance, sources: [{ label: "What-if scenario", url: "/what-if" }] });
  }
  if (sc.tbaneClosed) sEvents.push({ id: "what-if-tbane", title: "T-bane closed through Nationaltheatret", category: "transit", lat: 59.9146, lon: 10.7317,
    start: at(6).toISOString(), end: at(30).toISOString(), sources: [{ label: "What-if scenario", url: "/what-if" }] });
  if (sc.cruiseDay) for (let k = 0; k < 4; k++) sCruise.push({ ship: `What-if ship ${k + 1}`, arrival: at(8).toISOString(), departure: at(17).toISOString(), passengers: 3000, sources: [{ label: "What-if scenario", url: "/what-if" }] });

  const xmasI = IDX("xmas_market"), payI = IDX("payday_window");
  let xmasInBaseline = false;
  const base: (Pt & { x: number[]; open: boolean })[] = [], scen: (Pt & { x: number[] })[] = [];
  for (let i = 0; i < N; i++) {
    const t = new Date(from.getTime() + i * 3600_000);
    const open = isOpen(t);
    const w = wAt(t);
    const inDay = t.getTime() >= d0 && t.getTime() < d1;
    const x0 = buildFeatures(t, w, events, [], cruise);
    if (inDay && x0[xmasI] === 1) xmasInBaseline = true;
    const ws = inDay && sc.heavySnow ? { tempC: -6, precipMm: 2.5, windMs: 9 } : w;
    const touched = inDay || (sc.event && Math.abs(t.getTime() - d0) < 2 * 86400_000);
    const x1 = touched ? buildFeatures(t, ws, sEvents, [], sCruise) : x0.slice();
    if (inDay && sc.payday) x1[payI] = 1;
    if (inDay && sc.xmasMarket) x1[xmasI] = x0[xmasI] === 1 ? 0 : 1;
    const q0 = open ? predictQuantiles(x0) : { p10: 0, p50: 0, p90: 0 };
    const q1 = open ? (touched ? predictQuantiles(x1) : q0) : { p10: 0, p50: 0, p90: 0 };
    base.push({ time: t.toISOString(), p10: q0.p10, p50: q0.p50, p90: q0.p90, x: x0, open });
    scen.push({ time: t.toISOString(), p10: q1.p10, p50: q1.p50, p90: q1.p90, x: x1 });
  }

  const di = (a: { time: string }) => Date.parse(a.time) >= d0 && Date.parse(a.time) < d1;
  const B = base.filter(di), S = scen.filter(di);
  const asFc = (xs: Pt[]): ForecastHour[] => xs.map((p) => ({ time: p.time, p10: p.p10, p50: p.p50, p90: p.p90, drivers: [] }));
  const rB = staffRequirements(asFc(B)).filter((r) => r.phase === "open");
  const rS = staffRequirements(asFc(S)).filter((r) => r.phase === "open");
  const tot = (xs: Pt[]) => xs.reduce((s, h) => s + h.p50, 0);
  const pk = (xs: Pt[]) => { const m = xs.reduce((a, b) => (b.p50 > a.p50 ? b : a), xs[0]); return m && m.p50 > 0 ? hh(new Date(m.time)) : "closed"; };
  const staffH = (rs: typeof rB) => rs.reduce((s, r) => s + r.total, 0);

  // Why: per driver group, the change summed over the day and the hour where it peaks.
  const groupDelta = new Map<string, { sum: number; peak: number; at: string }>();
  for (let i = 0; i < B.length; i++) {
    if (!B[i].open) continue;
    const g0 = drivers(B[i].x), g1 = drivers(S[i].x);
    g1.forEach((g, k) => {
      const d = g.value - g0[k].value;
      const cur = groupDelta.get(g.group) ?? { sum: 0, peak: 0, at: "" };
      cur.sum += d; if (Math.abs(d) > Math.abs(cur.peak)) { cur.peak = d; cur.at = hh(new Date(B[i].time)); }
      groupDelta.set(g.group, cur);
    });
  }
  const evName = sc.event ? `${sc.event.title} crowd` : "event crowds";
  const label: Record<string, string> = {
    "Events": evName, "Crowds via Nationaltheatret": `${evName} passing Nationaltheatret`, "Weather": sc.heavySnow ? "heavy snow" : "weather",
    "Transit disruption": sc.tbaneClosed ? "the T-bane closure (stranded travellers)" : "transit", "Cruise": sc.cruiseDay ? "cruise passengers" : "cruise",
    "Calendar & holidays": sc.payday ? "payday" : "the calendar", "Christmas market": "the Christmas market", "Baseline/time": "other model terms",
  };
  const why = [...groupDelta.entries()].filter(([, v]) => Math.abs(v.sum) >= 1).sort((a, b) => Math.abs(b[1].sum) - Math.abs(a[1].sum))
    .map(([g, v]) => ({ group: g, delta: v.sum, text: `${v.sum >= 0 ? "+" : "−"}${Math.abs(Math.round(v.sum))} orders from ${label[g] ?? g}, biggest at ${v.at} (${v.peak >= 0 ? "+" : "−"}${Math.abs(Math.round(v.peak))}).` }));

  const perHour = B.map((b, i) => {
    const r0 = rB.find((r) => r.time === b.time), r1 = rS.find((r) => r.time === b.time);
    return { label: hh(new Date(b.time)), dFront: (r1?.front ?? 0) - (r0?.front ?? 0), dKitchen: (r1?.kitchen ?? 0) - (r0?.kitchen ?? 0), dOrders: S[i].p50 - b.p50 };
  }).filter((x) => x.dFront || x.dKitchen);
  const dPersonH = staffH(rS) - staffH(rB);
  const dOrders = tot(S) - tot(B);

  const bucket = (n: number, size: number, lab: (t: Date) => string) => Array.from({ length: n }, (_, k) => {
    const a = from.getTime() + k * size * 3600_000, b = a + size * 3600_000;
    const sel = <T extends Pt>(xs: T[]) => xs.filter((p) => Date.parse(p.time) >= a && Date.parse(p.time) < b);
    const s = sel(scen), bb = sel(base);
    return { label: lab(new Date(a)), base: tot(bb), p10: s.reduce((x, h) => x + h.p10, 0), p50: tot(s), p90: s.reduce((x, h) => x + h.p90, 0) };
  });
  if (!weather.length || from.getTime() + N * 3600_000 > Date.parse(lastW?.time ?? "0")) notes.push("Past met.no's 9-day range, weather repeats the last forecast day.");
  notes.push("Day, Week and Month add up the hourly forecast. Summed P10 and P90 are wider than a true range for the total.");

  return {
    dayLabel: dlab(dayStart), days: Array.from({ length: 7 }, (_, k) => dlab(new Date(from.getTime() + k * 86400_000 + 12 * 3600_000))),
    hourly: B.map((b, i) => ({ label: hh(new Date(b.time)), base: b.p50, p10: S[i].p10, p50: S[i].p50, p90: S[i].p90 })),
    daily: bucket(7, 24, dlab), month: bucket(28, 24, dlab), weekly: bucket(4, 24 * 7, (t) => `Week of ${dlab(t)}`),
    kpis: {
      orders: [tot(B), tot(S)],
      peakStaff: [Math.max(0, ...rB.map((r) => r.total)), Math.max(0, ...rS.map((r) => r.total))],
      wageNok: [staffH(rB) * MIN_WAGE_NOK.adult, staffH(rS) * MIN_WAGE_NOK.adult],
      busiest: [pk(B), pk(S)],
    },
    perHour, shifts: { add: dPersonH > 0 ? Math.ceil(dPersonH / 6) : Math.floor(dPersonH / 6), personHours: dPersonH },
    stock: PER_ORDER.map((p) => ({ item: p.item, unit: p.unit, delta: Math.round(dOrders * p.r) })),
    why, xmasInBaseline, notes,
  };
}

export const VENUES = [
  { key: "spektrum", name: "Oslo Spektrum", lat: 59.9129, lon: 10.7547 },
  { key: "radhus", name: "Rådhusplassen", lat: 59.9117, lon: 10.7339 },
  { key: "karljohan", name: "Karl Johans gate", lat: 59.9138, lon: 10.7385 },
  { key: "konserthus", name: "Oslo Konserthus", lat: 59.9125, lon: 10.7310 },
  { key: "nt", name: "Nationaltheatret", lat: 59.9146, lon: 10.7317 },
  { key: "ullevaal", name: "Ullevaal Stadion", lat: 59.9488, lon: 10.7346 },
  { key: "unity", name: "Unity Arena, Fornebu", lat: 59.8955, lon: 10.6235 },
  { key: "holmenkollen", name: "Holmenkollen", lat: 59.9637, lon: 10.6676 },
  { key: "bislett", name: "Bislett Stadion", lat: 59.925, lon: 10.733 },
].map((v) => ({ ...v, km: Math.round(haversineKm(STORE.lat, STORE.lon, v.lat, v.lon) * 10) / 10 }));
