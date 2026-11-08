import "server-only";
import type { CityEvent, CruiseCall, ForecastHour, TransitSituation, WeatherHour } from "./types";
import { STORE } from "./types";
import { readData } from "./data";
import { forecastHour } from "./model/predict";
import { isOpen, transitStatsFromDepartures, type TransitStats } from "./model/features";
import { staffRequirements } from "./staffing/requirements";
import type { ForecastPayload } from "./forecastPayload";

const UA = "pulse-demo/0.1 github.com/panlytics";

type MetTs = { time: string; data: { instant: { details: { air_temperature: number; wind_speed: number } };
  next_1_hours?: { summary: { symbol_code: string }; details: { precipitation_amount: number } };
  next_6_hours?: { summary: { symbol_code: string }; details: { precipitation_amount: number } } } };

let weatherCache: { at: number; hours: WeatherHour[] } | null = null;

// met.no Locationforecast 2.0 (CC BY 4.0): hourly for ~2.5 days, then 6-hourly up to 9 days.
// 6-hourly steps are held for each hour, with rain spread evenly over the 6 hours.
export async function metWeather(): Promise<WeatherHour[]> {
  if (weatherCache && Date.now() - weatherCache.at < 10 * 60_000) return weatherCache.hours;
  const r = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${STORE.lat.toFixed(4)}&lon=${STORE.lon.toFixed(4)}`,
    { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`met.no answered ${r.status}`);
  const j = (await r.json()) as { properties: { timeseries: MetTs[] } };
  const out: WeatherHour[] = [];
  const ts = j.properties.timeseries;
  for (let i = 0; i < ts.length; i++) {
    const s = ts[i];
    const t0 = new Date(s.time).getTime();
    const next = ts[i + 1] ? new Date(ts[i + 1].time).getTime() : t0 + 3600_000;
    const steps = Math.max(1, Math.round((next - t0) / 3600_000));
    const p1 = s.data.next_1_hours?.details.precipitation_amount;
    const p6 = s.data.next_6_hours?.details.precipitation_amount;
    const precip = p1 ?? (p6 != null ? p6 / 6 : 0);
    for (let k = 0; k < steps; k++) {
      out.push({ time: new Date(t0 + k * 3600_000).toISOString(), tempC: s.data.instant.details.air_temperature,
        precipMm: +precip.toFixed(2), windMs: s.data.instant.details.wind_speed,
        symbol: s.data.next_1_hours?.summary.symbol_code ?? s.data.next_6_hours?.summary.symbol_code });
    }
  }
  weatherCache = { at: Date.now(), hours: out };
  return out;
}

let transitCache: { at: number; situations: TransitSituation[]; stats: TransitStats } | null = null;

// Entur Journey Planner v3 (NLOD): live situations and delays at Nationaltheatret.
async function enturNow(): Promise<{ situations: TransitSituation[]; stats: TransitStats }> {
  if (transitCache && Date.now() - transitCache.at < 60_000) return transitCache;
  const query = `{ stopPlace(id:"${STORE.nearestStopPlaceId}") {
    situations { id summary { value } description { value } severity validityPeriod { startTime endTime } }
    estimatedCalls(numberOfDepartures: 60, timeRange: 3600) { aimedDepartureTime expectedDepartureTime cancellation
      destinationDisplay { frontText } quay { publicCode } serviceJourney { line { publicCode transportMode
        situations { id summary { value } description { value } severity } } } } } }`;
  const r = await fetch("https://api.entur.io/journey-planner/v3/graphql", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", "ET-Client-Name": "panlytics-pulse" }, body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`Entur answered ${r.status}`);
  type Sit = { id: string; summary: { value: string }[]; description: { value: string }[]; severity?: string; validityPeriod?: { startTime?: string; endTime?: string } };
  type Call = { aimedDepartureTime: string; expectedDepartureTime: string; cancellation: boolean; destinationDisplay: { frontText: string }; quay?: { publicCode?: string };
    serviceJourney: { line: { publicCode: string; transportMode: string; situations: Sit[] } } };
  const j = (await r.json()) as { data: { stopPlace: { situations: Sit[]; estimatedCalls: Call[] } } };
  const sp = j.data.stopPlace;
  const sits = new Map<string, TransitSituation>();
  const add = (s: Sit, line?: string) => {
    const ex = sits.get(s.id);
    if (ex) { if (line && !ex.affects?.includes(line)) ex.affects?.push(line); return; }
    sits.set(s.id, { id: s.id, summary: s.summary[0]?.value ?? "Disruption", description: s.description[0]?.value, severity: s.severity,
      validFrom: s.validityPeriod?.startTime, validTo: s.validityPeriod?.endTime, affects: line ? [line] : [] });
  };
  sp.situations.forEach((s) => add(s));
  sp.estimatedCalls.forEach((c) => c.serviceJourney.line.situations.forEach((s) => add(s, c.serviceJourney.line.publicCode)));
  const departures = sp.estimatedCalls.map((c) => ({
    time: c.aimedDepartureTime, expected: c.expectedDepartureTime, line: c.serviceJourney.line.publicCode,
    mode: c.serviceJourney.line.transportMode, destination: c.destinationDisplay.frontText,
    delayMin: Math.round((new Date(c.expectedDepartureTime).getTime() - new Date(c.aimedDepartureTime).getTime()) / 60000),
    cancelled: c.cancellation, quay: c.quay?.publicCode,
  }));
  const hourStart = new Date(Math.floor(Date.now() / 3600_000) * 3600_000);
  const stats = transitStatsFromDepartures(departures, hourStart);
  transitCache = { at: Date.now(), situations: [...sits.values()], stats };
  return transitCache;
}

const osloDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });

export async function getForecast(days = 2): Promise<ForecastPayload> {
  const errors: string[] = [];
  const now = new Date();
  const start = new Date(Math.floor(now.getTime() / 3600_000) * 3600_000);
  // Hours start at 06:00 local on the current business day, so "today" is complete
  // and staffing sees whole business days (the store closes after midnight).
  const localHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", hour12: false }).format(start)) % 24;
  const back = (localHour - 6 + 24) % 24;
  const from = new Date(start.getTime() - back * 3600_000);
  const hoursN = days * 24;

  let weather: WeatherHour[] = [];
  try { weather = await metWeather(); } catch (e) { errors.push(e instanceof Error ? e.message : "met.no failed"); }
  let transit: { situations: TransitSituation[]; stats: TransitStats } = { situations: [], stats: {} };
  try { transit = await enturNow(); } catch (e) { errors.push(e instanceof Error ? e.message : "Entur failed"); }

  const events = [...readData<CityEvent[]>("events-upcoming.json", []), ...readData<CityEvent[]>("events-history.json", []), ...readData<CityEvent[]>("events-calendar.json", [])];
  const winStart = from.getTime() - 6 * 3600_000, winEnd = from.getTime() + (hoursN + 6) * 3600_000;
  const seen = new Set<string>();
  const evWin = events.filter((e) => {
    if (seen.has(e.id)) return false; seen.add(e.id);
    return new Date(e.end).getTime() >= winStart && new Date(e.start).getTime() <= winEnd;
  });
  const cruise = [...readData<CruiseCall[]>("cruise-upcoming.json", []), ...readData<CruiseCall[]>("cruise-history.json", [])]
    .filter((c) => new Date(c.departure).getTime() >= winStart && new Date(c.arrival).getTime() <= winEnd);

  const wAt = (t: Date) => {
    const iso = t.toISOString();
    const w = weather.find((x) => x.time === iso) ?? weather.reduce<WeatherHour | undefined>((best, x) =>
      !best || Math.abs(new Date(x.time).getTime() - t.getTime()) < Math.abs(new Date(best.time).getTime() - t.getTime()) ? x : best, undefined);
    return w ?? { time: iso, tempC: 5, precipMm: 0, windMs: 3 };
  };

  const st = transit.stats;
  const disrupted = (st.railLate5Share ?? 0) >= 0.15 || (st.railCancelledShare ?? 0) >= 0.05 || (st.metroLate5Share ?? 0) >= 0.15;
  const hours: ForecastPayload["hours"] = [];
  for (let i = 0; i < hoursN; i++) {
    const t = new Date(from.getTime() + i * 3600_000);
    const w = wAt(t);
    // Live disruption and delay stats apply to the next 3 hours only; beyond that we can't know.
    const near = t.getTime() - start.getTime() < 3 * 3600_000 && t.getTime() >= start.getTime();
    // A notice only counts when trains are actually late or cancelled right now:
    // lift faults and planned works otherwise read as a disruption.
    const f: ForecastHour = forecastHour(t, w, evWin, near && disrupted ? transit.situations : [], cruise, near ? transit.stats : undefined);
    hours.push({ ...f, weather: w, open: isOpen(t) });
  }

  const staffing = staffRequirements(hours).map((s) => ({
    time: s.time, transactions: s.transactions, front: s.front, kitchen: s.kitchen, total: s.total, serviceLevel: s.serviceLevel,
  }));

  const todayKey = osloDate(from);
  const today = hours.slice(0, 24);
  const sum = (k: "p10" | "p50" | "p90") => today.reduce((s, h) => s + h[k], 0);
  const grp = new Map<string, number>();
  for (const h of today) for (const d of h.drivers) grp.set(d.group, (grp.get(d.group) ?? 0) + d.value);
  const typical = grp.get("Baseline/time") ?? 0;
  const bench = readData<{ models?: { wape: number }[]; coverage?: { calibrated: number } }>("model/benchmark.json", {});
  const meta = readData<{ generatedAt?: string }>("model/meta.json", {});

  return {
    generatedAt: now.toISOString(),
    hours,
    staffing,
    today: { date: todayKey, p10: sum("p10"), p50: sum("p50"), p90: sum("p90"), typical },
    driversToday: [...grp.entries()].filter(([g]) => g !== "Baseline/time").map(([group, value]) => ({ group, value })),
    inputs: { events: evWin.length, situations: disrupted ? transit.situations.length : 0, weatherSource: weather.length ? "met.no Locationforecast" : "a default (met.no unreachable)",
      transitLate5Share: transit.stats.railLate5Share ?? null },
    model: { trainedAt: meta.generatedAt, coverage: bench.coverage?.calibrated, wape: bench.models?.[0]?.wape },
    errors,
  };
}
