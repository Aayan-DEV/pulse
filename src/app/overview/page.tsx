import Link from "next/link";
import { LayoutGrid, AlertTriangle, Users, Package, ChevronRight } from "lucide-react";
import PageHead from "@/components/PageHead";
import ForecastChart from "@/components/ForecastChart";
import Reasons from "@/components/Reasons";
import { today, hh } from "@/lib/shift/today";
import { getForecast } from "@/lib/forecast";
import { sumDay, vsText } from "@/lib/reasons";

export const dynamic = "force-dynamic";

const weekday = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/Oslo", weekday: "long" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short" });
const n = (v: number) => Math.round(v).toLocaleString("en");
const ICON = { spike: AlertTriangle, staff: Users, stock: Package };

export default async function OverviewPage() {
  const t = await today();
  const day = sumDay(t.hours);
  const name = t.hours[0] ? weekday(t.hours[0].time) : "day";

  // The next three business days (the forecast starts at 06:00 today, 24 hours per day).
  let next: { label: string; p50: number; vs: number | null; top?: string }[] = [];
  try {
    const f = await getForecast(4);
    next = [1, 2, 3].map((i) => f.hours.slice(i * 24, i * 24 + 24)).filter((h) => h.length).map((h) => {
      const s = sumDay(h);
      return { label: dayLabel(h[0].time), p50: s.p50, vs: s.vsNormal, top: s.reasons[0] ? `${s.reasons[0].label} ${s.reasons[0].value > 0 ? "+" : "−"}${Math.abs(s.reasons[0].value)}` : undefined };
    });
  } catch { /* leave empty */ }

  const worst = t.alarms.length ? "red" : t.status.some((s) => s.level === "red") ? "red" : t.status.some((s) => s.level === "yellow") ? "yellow" : "green";
  const soFar = t.expected > 0 ? `${n(t.sold)} sold so far.` : "Not open yet.";

  return (
    <main className="adm-content">
      <PageHead crumb="Today / Overview" title="Today" icon={LayoutGrid} />
      {t.demoClock && <div className="ak-error" style={{ marginBottom: 12 }}>Demo clock: {t.demoClock}</div>}

      <section className={`tr-hero tr-hero--${worst}`}>
        <span className={`sh-dot sh-dot--${worst}`} aria-hidden />
        <div>
          <h2>About {n(day.p50)} orders today</h2>
          <p>{vsText(day.vsNormal, name)}. {soFar}</p>
        </div>
      </section>

      {t.alarms.length > 0 ? (
        <section className="sh-alarms">
          {t.alarms.map((a, i) => { const I = ICON[a.kind]; return <div key={i} className="sh-alarm"><I /><span>{a.text}</span></div>; })}
        </section>
      ) : null}

      <div className="sh-status" style={{ marginTop: 12 }}>
        {t.status.map((s) => <div key={s.key} className="sh-stat"><span className={`sh-dot sh-dot--${s.level}`} /><div><b>{s.label}</b><span>{s.text}</span></div></div>)}
      </div>

      <section className="ak-panel" style={{ marginTop: 12 }}>
        <div className="ak-panel-head">
          <div><h2 className="ak-h">Orders per hour</h2></div>
          <div className="ak-key"><span><i />Expected</span><span><i className="band" />Likely range</span><span><i className="ink" />Sold</span></div>
        </div>
        <div className="ak-panel-body">
          <ForecastChart nowLabel={t.cur ? hh(t.cur.time) : undefined}
            data={t.hours.filter((h) => h.open).map((h) => ({ label: hh(h.time), p10: h.p10, p50: h.p50, p90: h.p90, actual: h.actual }))} />
        </div>
      </section>

      <div className="ak-grid" style={{ marginTop: 12 }}>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Why today is different</h2></div></div>
          <Reasons reasons={day.reasons} />
        </section>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Next 3 days</h2></div>
            <Link href="/forecast" className="ak-btn">Forecast</Link></div>
          {next.length === 0 && <div className="ak-empty">Forecast not ready.</div>}
          {next.map((d) => (
            <Link key={d.label} href="/forecast" className="ak-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto 16px" }}>
              <div><div className="ak-row-title">{d.label}</div><div className="ak-row-why">{d.vs == null ? "" : Math.abs(d.vs) < 3 ? "Normal" : `${d.vs > 0 ? "+" : "−"}${Math.abs(d.vs)}% vs normal`}{d.top ? ` · ${d.top}` : ""}</div></div>
              <div className="ak-row-n">{n(d.p50)}</div>
              <ChevronRight style={{ width: 14, height: 14, color: "var(--od-faint)" }} />
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
