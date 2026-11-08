import "server-only";
import { readData } from "./data";

// Summaries of Entur's historic stop calls at Nationaltheatret (rail and metro), in plain units:
// "late trains out of 100" = share of calls more than 5 minutes late, times 100.
type Row = { t: string; stop?: string; mode: string; calls: number; meanDelay: number; late5Share: number; cancelled: number };
type Episode = { stop: string; mode: string; start: string; hours: number; calls: number; cancelled: number; maxMedianDelay: number; meanCancelShare: number; score: number };

let rowsCache: Row[] | null = null;
function rows(): Row[] {
  if (!rowsCache) {
    const raw = readData<Row[] | { rows: Row[] }>("transit-history.json", []);
    rowsCache = (Array.isArray(raw) ? raw : raw.rows ?? []).filter((r) => (r.stop ?? "NT") === "NT" && r.calls > 0);
  }
  return rowsCache;
}

/** Late or cancelled calls in one hour row, never more than the calls themselves. */
const bad = (r: Row) => Math.min(r.calls, r.late5Share * r.calls + r.cancelled);
const dowOf = (date: string) => new Date(date + "T12:00:00Z").getUTCDay(); // 0 = Sunday

/** Late trains out of 100, per hour of the day, for one weekday, over the last `weeks` weeks of data. */
export function typicalDay(dow: number, weeks = 26) {
  const rs = rows();
  if (!rs.length) return [];
  const last = rs[rs.length - 1].t.slice(0, 10);
  const from = new Date(Date.parse(last + "T00:00:00Z") - weeks * 7 * 86400_000).toISOString().slice(0, 10);
  const acc = new Map<number, { calls: number; bad: number }>();
  for (const r of rs) {
    const d = r.t.slice(0, 10);
    if (d < from || dowOf(d) !== dow) continue;
    const h = Number(r.t.slice(11, 13));
    const a = acc.get(h) ?? { calls: 0, bad: 0 };
    a.calls += r.calls; a.bad += bad(r);
    acc.set(h, a);
  }
  return [...acc.entries()].sort((a, b) => a[0] - b[0])
    .map(([h, a]) => ({ hour: h, label: String(h).padStart(2, "0"), late: Math.round((100 * a.bad) / a.calls) }));
}

/** Weekly late trains out of 100 for rail and metro, oldest first. */
export function weekly() {
  const acc = new Map<string, Record<string, { calls: number; bad: number }>>();
  for (const r of rows()) {
    const d = r.t.slice(0, 10);
    const monday = new Date(Date.parse(d + "T12:00:00Z") - ((dowOf(d) + 6) % 7) * 86400_000).toISOString().slice(0, 10);
    const m = acc.get(monday) ?? {};
    const x = m[r.mode] ?? { calls: 0, bad: 0 };
    x.calls += r.calls; x.bad += bad(r);
    m[r.mode] = x; acc.set(monday, m);
  }
  return [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, m]) => ({
    week,
    rail: m.rail?.calls ? Math.round((100 * m.rail.bad) / m.rail.calls) : null,
    metro: m.metro?.calls ? Math.round((100 * m.metro.bad) / m.metro.calls) : null,
  }));
}

/** The worst single days for trains (rail) at Nationaltheatret. */
export function worstDays(n = 5) {
  const acc = new Map<string, { calls: number; bad: number }>();
  for (const r of rows()) {
    if (r.mode !== "rail") continue;
    const d = r.t.slice(0, 10);
    const a = acc.get(d) ?? { calls: 0, bad: 0 };
    a.calls += r.calls; a.bad += bad(r);
    acc.set(d, a);
  }
  return [...acc.entries()].filter(([, a]) => a.calls >= 100)
    .map(([day, a]) => ({ day, late: Math.round((100 * a.bad) / a.calls) }))
    .sort((a, b) => b.late - a.late).slice(0, n);
}

/** The biggest cancellation episodes Entur's archive shows, in plain words. */
export function biggestDisruptions(n = 5) {
  const STOPS: Record<string, string> = { NT: "Nationaltheatret", OSL: "Oslo S" };
  return readData<Episode[]>("transit-episodes.json", []).sort((a, b) => b.score - a.score).slice(0, n).map((e) => ({
    when: e.start,
    text: `${STOPS[e.stop] ?? e.stop} ${e.mode === "rail" ? "trains" : e.mode}: ${Math.max(1, Math.round(e.meanCancelShare * 10))} in 10 cancelled for ${e.hours} hours`,
  }));
}

export const historyRange = () => {
  const rs = rows();
  return rs.length ? { from: rs[0].t.slice(0, 10), to: rs[rs.length - 1].t.slice(0, 10) } : null;
};
