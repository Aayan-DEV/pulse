import { TrainFront } from "lucide-react";
import PageHead from "@/components/PageHead";
import { NextHourChart, TypicalDayChart, WeeklyChart } from "@/components/transit/TransitCharts";
import { getTransit } from "@/lib/live";
import { trainsNow, type TrainNow } from "@/lib/shift/trains";
import { getForecast } from "@/lib/forecast";
import { typicalDay, weekly, worstDays, biggestDisruptions, historyRange } from "@/lib/transitHistory";
import { osloParts } from "@/lib/model/features";
import { getView } from "@/lib/view";

export const dynamic = "force-dynamic";

const TITLE = { green: "Trains are on time", yellow: "Some trains are late", red: "Many trains are late or cancelled" } as const;
const dayName = (dow: number) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dow];
const date = (d: string) => new Date(d.length > 10 ? d : d + "T12:00:00Z").toLocaleDateString("en-GB", { timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short", year: "numeric" });

export default async function TransitPage() {
  const view = await getView();
  const now = Date.now();
  const { hour, dow: mon0 } = osloParts(new Date(now));
  const dow = (mon0 + 1) % 7; // Sunday = 0, like Date.getDay()

  let t: TrainNow | null = null;
  try { const live = await getTransit(); t = trainsNow(live.departures, live.situations, now); } catch { /* feed down: say so below */ }

  // What the model adds to this hour's orders because of the trains right now.
  let effect: number | null = null;
  try {
    const f = await getForecast(1);
    const h = f.hours.find((x) => Date.parse(x.time) <= now && now < Date.parse(x.time) + 3600_000);
    if (h?.open) effect = Math.round(h.drivers.find((d) => d.group === "Transit disruption")?.value ?? 0);
  } catch { /* leave unknown */ }

  const usual = typicalDay(dow);
  const usualNow = usual.find((u) => u.hour === hour)?.late;
  const nowPer100 = t && t.total ? Math.round((100 * (t.late + t.cancelled)) / t.total) : null;

  return (
    <main className="adm-content">
      <PageHead crumb="Today / Trains and trams" title="Trains and trams" icon={TrainFront}
        finding={<>The three stops next to the store. When trains are late, people wait nearby, and some come in to eat.</>} />

      {t ? (
        <section className={`tr-hero tr-hero--${t.level}`}>
          <span className={`sh-dot sh-dot--${t.level}`} aria-hidden />
          <div><h2>{TITLE[t.level]}</h2><p>{t.action}</p></div>
        </section>
      ) : (
        <section className="tr-hero tr-hero--yellow"><span className="sh-dot sh-dot--yellow" aria-hidden /><div><h2>No live train data</h2><p>Entur did not answer. Try again in a minute.</p></div></section>
      )}

      {t && (
        <section className="ak-panel" style={{ marginTop: 12 }}>
          <div className="ak-kpis">
            <div className="ak-kpi"><div className="ak-kpi-label">Departures next hour</div><div className="ak-kpi-value">{t.total}</div></div>
            <div className="ak-kpi"><div className="ak-kpi-label">Late, 5+ min</div><div className={`ak-kpi-value${t.late ? " is-warn" : ""}`}>{t.late}</div></div>
            <div className="ak-kpi"><div className="ak-kpi-label">Cancelled</div><div className={`ak-kpi-value${t.cancelled ? " is-bad" : ""}`}>{t.cancelled}</div></div>
            <div className="ak-kpi"><div className="ak-kpi-label">Extra orders this hour</div>
              <div className="ak-kpi-value">{effect == null ? <span className="is-na">Closed</span> : effect > 0 ? `+${effect}` : effect < 0 ? `${effect}` : "0"}</div>
              <div className="ak-kpi-sub">from the trains, by the forecast</div></div>
          </div>
        </section>
      )}

      <div className="ak-grid" style={{ marginTop: 12 }}>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Next hour</h2><p className="ak-note">Departures every 10 minutes. Grey is on time, yellow is late, red is cancelled.</p></div></div>
          <div className="ak-panel-body">{t ? <NextHourChart data={t.buckets} /> : <div className="ak-empty">No live data.</div>}</div>
        </section>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Warnings today</h2><p className="ak-note">Notices from Entur for these stops and lines.</p></div></div>
          {!t?.notices.length && <div className="ak-empty">No warnings.</div>}
          {t?.notices.slice(0, view === "employer" ? 12 : 5).map((n) => (
            <div className="ak-row" key={n.id}>
              <div><div className="ak-row-title">{n.text}</div>
                <div className="ak-row-why">{[n.startsLater ? `From ${n.from}` : "", n.to ? `until ${n.to}` : "", n.lines].filter(Boolean).join(" · ")}</div></div>
            </div>
          ))}
        </section>
      </div>

      {usual.length > 0 && (
        <section className="ak-panel" style={{ marginTop: 12 }}>
          <div className="ak-panel-head"><div>
            <h2 className="ak-h">A normal {dayName(dow)}</h2>
            <p className="ak-note">Late trains out of every 100, hour by hour.{usualNow != null && nowPer100 != null
              ? <> Now: <b>{nowPer100}</b>, usually <b>{usualNow}</b> at this hour.</> : null}</p>
          </div></div>
          <div className="ak-panel-body"><TypicalDayChart data={usual} nowHour={hour} /></div>
        </section>
      )}

      {view === "employer" && <History />}
    </main>
  );
}

function History() {
  const range = historyRange();
  if (!range) return null;
  const worst = worstDays(), eps = biggestDisruptions();
  return (
    <>
      <h2 className="tr-section">History</h2>
      <section className="ak-panel">
        <div className="ak-panel-head"><div><h2 className="ak-h">Late trains out of 100, by week</h2>
          <p className="ak-note">Nationaltheatret, {date(range.from)} to {date(range.to)}. Late means 5+ minutes or cancelled. Orange is trains, black is metro.</p></div></div>
        <div className="ak-panel-body"><WeeklyChart data={weekly()} /></div>
      </section>
      <div className="ak-grid" style={{ marginTop: 12 }}>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Worst days</h2><p className="ak-note">Trains late out of 100</p></div></div>
          {worst.map((d) => (
            <div className="ak-row" key={d.day}><div className="ak-row-title">{date(d.day)}</div><div className="ak-row-n is-bad">{d.late} of 100</div></div>
          ))}
        </section>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Biggest shutdowns</h2><p className="ak-note">Longest runs of cancellations</p></div></div>
          {eps.map((e, k) => (
            <div className="ak-row" key={k}><div><div className="ak-row-title">{e.text}</div><div className="ak-row-why">{date(e.when)}</div></div></div>
          ))}
        </section>
      </div>
    </>
  );
}
