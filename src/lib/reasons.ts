// Plain names for the model's reason groups, and helpers to add them up over a set of hours.
import type { ForecastHour } from "./types";

export const PLAIN: Record<string, string> = {
  "Calendar & holidays": "Holidays and paydays",
  "Weather": "Weather",
  "Events": "Events nearby",
  "Transit disruption": "Late trains",
  "Cruise": "Cruise ships in port",
  "Christmas market": "Christmas market",
  "Crowds via Nationaltheatret": "Crowds through the station",
};
export const plain = (group: string) => PLAIN[group] ?? group;

type H = Pick<ForecastHour, "p10" | "p50" | "p90" | "drivers"> & { open?: boolean };

/** Orders for a set of hours, the "normal day" part, and the reasons on top, biggest first (|value| >= 1). */
export function sumDay(hours: H[]) {
  const open = hours.filter((h) => h.open !== false);
  const by = new Map<string, number>();
  for (const h of open) for (const d of h.drivers) by.set(d.group, (by.get(d.group) ?? 0) + d.value);
  const normal = by.get("Baseline/time") ?? 0;
  const reasons = [...by.entries()].filter(([g, v]) => g !== "Baseline/time" && Math.abs(v) >= 1)
    .map(([group, value]) => ({ group, label: plain(group), value: Math.round(value) }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const p50 = open.reduce((s, h) => s + h.p50, 0);
  return { p50, p10: open.reduce((s, h) => s + h.p10, 0), p90: open.reduce((s, h) => s + h.p90, 0), normal, reasons,
    vsNormal: normal > 0 ? Math.round((100 * (p50 - normal)) / normal) : null, openHours: open.length };
}

export const vsText = (pct: number | null, dayName: string) =>
  pct == null ? "" : Math.abs(pct) < 3 ? `About a normal ${dayName}` : `${Math.abs(pct)}% ${pct > 0 ? "busier" : "quieter"} than a normal ${dayName}`;
