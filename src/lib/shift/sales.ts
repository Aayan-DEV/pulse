// SIMULATED live sales stream for the demo (no POS feed): each hour's orders = forecast P50 x a seeded random factor
// (lognormal, sd 12 %), with about 1 hour in 12 a rush (x1.5 to x1.9). The current hour fills in as the clock runs.
// "Simulate a rush" forces x2.1 on the current hour.
import "server-only";
import { getForecast } from "@/lib/forecast";
import type { ForecastPayload } from "@/lib/forecastPayload";

const g = globalThis as unknown as { __pulseForced?: Record<string, number> };
const forced = (g.__pulseForced ??= {});

function seeded(s: string) {
  let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hourFactor(iso: string): number {
  if (forced[iso]) return forced[iso];
  const r = seeded(iso); const u1 = Math.max(r(), 1e-9), u2 = r();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(0.12 * z) * (r() < 0.08 ? 1.5 + 0.4 * r() : 1);
}
export function forceRush(iso: string) { forced[iso] = 2.1; }
export const isForced = (iso: string) => !!forced[iso];

export type SalesHour = ForecastPayload["hours"][number] & { actual?: number; soFar?: number; projected?: number; current: boolean; done: boolean };

export async function liveSales(): Promise<{ hours: SalesHour[]; now: number; fc: ForecastPayload }> {
  const fc = await getForecast(1);
  const now = Date.now();
  const hours = fc.hours.map((h) => {
    const s = Date.parse(h.time), e = s + 3600_000;
    const total = h.p50 * hourFactor(h.time);
    if (e <= now) return { ...h, actual: Math.round(total), current: false, done: true };
    if (s <= now) { const f = (now - s) / 3600_000; return { ...h, soFar: Math.round(total * f), projected: Math.round(total), current: true, done: false }; }
    return { ...h, current: false, done: false };
  });
  return { hours, now, fc };
}
