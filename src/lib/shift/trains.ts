// One reading of "how are the trains right now", shared by the Shift screen and the Trains page.
import type { TransitDeparture, TransitSituation } from "../types";

export type Level = "green" | "yellow" | "red";
export const LATE_MIN = 5;

export type TrainNow = {
  level: Level;
  total: number;          // departures in the next hour from the three stops beside the store
  late: number;           // more than 5 minutes late
  cancelled: number;
  headline: string;       // one short line for a status dot
  action: string;         // what the crew should do
  buckets: { label: string; onTime: number; late: number; cancelled: number }[]; // next hour in 10-minute slots
  notices: { id: string; text: string; lines: string; from?: string; to?: string; startsLater: boolean }[];
};

const hm = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });

export function trainsNow(departures: TransitDeparture[], situations: TransitSituation[], now: number): TrainNow {
  const near = departures.filter((d) => { const t = Date.parse(d.time); return t >= now - 5 * 60_000 && t < now + 3600_000; });
  const cancelled = near.filter((d) => d.cancelled).length;
  const late = near.filter((d) => !d.cancelled && d.delayMin > LATE_MIN).length;
  const share = near.length ? (late + cancelled) / near.length : 0;

  // Entur repeats one notice per line ("metro 1", "metro 3", ...): merge notices with the same text.
  const endOfDay = now + 18 * 3600_000;
  const merged = new Map<string, TrainNow["notices"][number] & { all: string[] }>();
  for (const s of situations) {
    if ((s.validTo && Date.parse(s.validTo) <= now) || (s.validFrom && Date.parse(s.validFrom) >= endOfDay)) continue;
    const key = s.summary.trim();
    const prev = merged.get(key);
    if (prev) { for (const a of s.affects ?? []) if (!prev.all.includes(a)) prev.all.push(a); continue; }
    merged.set(key, { id: s.id, text: key, lines: "", all: [...(s.affects ?? [])],
      from: s.validFrom ? hm(Date.parse(s.validFrom)) : undefined, to: s.validTo && Date.parse(s.validTo) < endOfDay ? hm(Date.parse(s.validTo)) : undefined,
      startsLater: !!s.validFrom && Date.parse(s.validFrom) > now });
  }
  const notices = [...merged.values()].map(({ all, ...n }) => ({ ...n, lines: all.length > 4 ? `${all.slice(0, 4).join(", ")} and ${all.length - 4} more` : all.join(", ") }));

  const level: Level = share >= 0.15 || cancelled >= 3 ? "red" : share > 0.05 ? "yellow" : "green";
  const headline = level === "red" ? `${late} late and ${cancelled} cancelled in the next hour`
    : level === "yellow" ? `${late + cancelled} of ${near.length} departures late`
    : near.length ? `${near.length} departures next hour, on time` : "No departures in the next hour";
  const action = level === "red" ? "People get stuck by the store. Expect more walk-ins in the next hour. Keep the till and fries ready."
    : level === "yellow" ? "A few trains are late. Maybe a few extra walk-ins. Nothing to change yet."
    : "Nothing to do.";

  const buckets = Array.from({ length: 6 }, (_, i) => {
    const a = now + i * 600_000, b = a + 600_000;
    const xs = near.filter((d) => { const t = Date.parse(d.time); return t >= a && t < b; });
    const c = xs.filter((d) => d.cancelled).length, l = xs.filter((d) => !d.cancelled && d.delayMin > LATE_MIN).length;
    return { label: hm(a), onTime: xs.length - c - l, late: l, cancelled: c };
  });
  return { level, total: near.length, late, cancelled, headline, action, buckets, notices };
}
