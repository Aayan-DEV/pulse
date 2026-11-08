import { TrainFront } from "lucide-react";
import PageHead from "@/components/PageHead";
import { readData } from "@/lib/data";
import type { CityEvent } from "@/lib/types";
import TransitCharts, { type DayRow } from "@/components/TransitCharts";

export const dynamic = "force-dynamic";

type HourRow = { t: string; stop?: string; mode: string; calls: number; meanDelay: number; p90Delay?: number; late5Share: number; cancelled: number };

export default function TransitPage() {
  const raw = readData<HourRow[] | { rows: HourRow[] }>("transit-history.json", []);
  const STOPS: Record<string, string> = { NT: "Nationaltheatret", OSL: "Oslo S" };
  const hours: HourRow[] = (Array.isArray(raw) ? raw : raw.rows ?? []).map((h) => ({ ...h, mode: `${STOPS[h.stop ?? ""] ?? h.stop ?? ""} ${h.mode}`.trim() }));
  type Ep = { stop: string; mode: string; start: string; end: string; hours: number; calls: number; cancelled: number; maxMedianDelay: number; meanCancelShare: number; score: number };
  const eps = readData<Ep[]>("transit-episodes.json", []).sort((a, b) => b.score - a.score);
  // Daily roll-up per mode, weighted by calls.
  const byDay = new Map<string, Record<string, { calls: number; late: number; canc: number; delay: number }>>();
  for (const h of hours) {
    const d = h.t.slice(0, 10);
    const m = byDay.get(d) ?? {};
    const x = m[h.mode] ?? { calls: 0, late: 0, canc: 0, delay: 0 };
    x.calls += h.calls; x.late += h.late5Share * h.calls; x.canc += h.cancelled; x.delay += h.meanDelay * h.calls;
    m[h.mode] = x; byDay.set(d, m);
  }
  const modes = Array.from(new Set(hours.map((h) => h.mode)));
  const days: DayRow[] = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([d, m]) => {
    const row: DayRow = { day: d };
    for (const k of modes) if (m[k]?.calls) {
      row[`${k}_late`] = +(100 * m[k].late / m[k].calls).toFixed(2);
      row[`${k}_canc`] = +(100 * m[k].canc / m[k].calls).toFixed(2);
      row[`${k}_delay`] = +(m[k].delay / m[k].calls).toFixed(2);
    }
    return row;
  });
  const episodes = readData<CityEvent[]>("events-history.json", []).filter((e) => e.category === "transit")
    .sort((a, b) => b.start.localeCompare(a.start));
  const totalCalls = hours.reduce((s, h) => s + h.calls, 0);
  const range = hours.length ? `${hours[0].t.slice(0, 10)} to ${hours[hours.length - 1].t.slice(0, 10)}` : "";
  const worst = days.slice().sort((a, b) => ((b[`${modes[0]}_late`] as number) ?? 0) - ((a[`${modes[0]}_late`] as number) ?? 0)).slice(0, 8);

  return (
    <main className="adm-content">
      <PageHead crumb="Signals / Trains and trams" title="Trains and trams" icon={TrainFront}
        finding={hours.length
          ? <><b>{totalCalls.toLocaleString("en")} real stop calls</b> from Entur&apos;s SIRI-ET archive ({range}) at the stops beside the store. When trains stop, commuters walk out at Nationaltheatret and buy food.</>
          : <>Real historic delays from Entur&apos;s BigQuery archive are being pulled now. Live departures are on the map.</>} />
      {hours.length > 0 && <TransitCharts days={days} modes={modes} />}
      <div className="ak-grid" style={{ marginTop: 16 }}>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Worst days for {modes[0] ?? "rail"}</h2><p className="ak-note">Share of calls more than 5 minutes late</p></div></div>
          {worst.length === 0 && <div className="ak-empty">No history loaded yet.</div>}
          {worst.map((d) => (
            <div className="ak-row" key={d.day}>
              <div className="ak-row-title">{new Date(d.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
              <div className="ak-row-n is-bad">{(d[`${modes[0]}_late`] as number)?.toFixed(1)}%</div>
            </div>
          ))}
        </section>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Biggest real disruptions</h2><p className="ak-note">{eps.length} episodes found in Entur&apos;s archive, ranked by size. {episodes.length} more come from news sources in the event library.</p></div></div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {eps.length === 0 && <div className="ak-empty">No episodes yet.</div>}
            {eps.slice(0, 40).map((e, k) => (
              <div className="ak-row" key={k}>
                <div><div className="ak-row-title">{STOPS[e.stop] ?? e.stop} {e.mode}: {Math.round(e.meanCancelShare * 100)}% cancelled for {e.hours} h</div>
                  <div className="ak-row-why">{new Date(e.start).toLocaleString("en-GB", { timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {e.cancelled.toLocaleString("en")} of {e.calls.toLocaleString("en")} calls cancelled · worst median delay {e.maxMedianDelay.toFixed(1)} min</div></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
