"use client";

import { useMemo, useState } from "react";
import type { ForecastHour, WeatherHour } from "@/lib/types";
import ForecastChart from "./ForecastChart";

type H = ForecastHour & { weather?: WeatherHour; open: boolean };
const osloDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
const hh = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
const dayLabel = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;

export default function ForecastView({ hours, errors, history, historyNote }: { hours: H[]; errors: string[]; history: ForecastHour[]; historyNote: string }) {
  // Business days: 06:00 to 06:00, keyed by the date the day starts on.
  const days = useMemo(() => {
    const m = new Map<string, H[]>();
    hours.forEach((h, i) => { const key = osloDate(hours[Math.floor(i / 24) * 24].time); m.set(key, [...(m.get(key) ?? []), h]); });
    return [...m.entries()];
  }, [hours]);
  const [di, setDi] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [day, dh] = days[di] ?? ["", []];
  const open = dh.filter((h) => h.open);
  const pick = open.find((h) => h.time === sel) ?? open.slice().sort((a, b) => b.p50 - a.p50)[0];
  const groups = pick?.drivers.filter((d) => d.group !== "Baseline/time") ?? [];
  const base = pick?.drivers.find((d) => d.group === "Baseline/time")?.value ?? 0;
  const tot = (k: "p10" | "p50" | "p90") => open.reduce((s, h) => s + h[k], 0);

  return (
    <>
      {errors.length > 0 && <div className="ak-error" style={{ marginBottom: 16 }}>Partly offline: {errors.join("; ")}. The forecast uses defaults for those inputs.</div>}
      <div className="ak-bar">
        <span className="ak-bar-label">Day</span>
        <div className="ak-seg" style={{ flexWrap: "wrap", height: "auto" }}>
          {days.map(([d, h], i) => (
            <button key={d} aria-pressed={i === di} onClick={() => { setDi(i); setSel(null); }}>
              {dayLabel(d)} <span className="faint">{Math.round(h.reduce((s, x) => s + x.p50, 0)).toLocaleString("en")}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="ak-panel">
        <div className="ak-kpis">
          <div className="ak-kpi"><div className="ak-kpi-label">Orders, {dayLabel(day)}</div><div className="ak-kpi-value">{Math.round(tot("p50")).toLocaleString("en")}</div><div className="ak-kpi-sub">{Math.round(tot("p10")).toLocaleString("en")} to {Math.round(tot("p90")).toLocaleString("en")}, summed hourly ranges</div></div>
          <div className="ak-kpi"><div className="ak-kpi-label">Busiest hour</div><div className="ak-kpi-value">{open.length ? hh(open.slice().sort((a, b) => b.p50 - a.p50)[0].time) : "–"}</div><div className="ak-kpi-sub">{open.length ? `${Math.round(Math.max(...open.map((h) => h.p50)))} orders likely` : ""}</div></div>
          <div className="ak-kpi"><div className="ak-kpi-label">Weather at noon</div><div className="ak-kpi-value">{(() => { const n = dh.find((h) => hh(h.time) === "12:00")?.weather; return n ? `${Math.round(n.tempC)}°C` : "–"; })()}</div><div className="ak-kpi-sub">{(() => { const r = dh.reduce((s, h) => s + (h.weather?.precipMm ?? 0), 0); return `${r.toFixed(1)} mm rain over the day`; })()}</div></div>
          <div className="ak-kpi"><div className="ak-kpi-label">Open hours</div><div className="ak-kpi-value">{open.length}</div><div className="ak-kpi-sub">{open[0] ? `${hh(open[0].time)} to ${hh(new Date(new Date(open[open.length - 1].time).getTime() + 3600_000).toISOString())}` : "Closed"}</div></div>
        </div>
      </section>

      <div className="ak-grid ak-grid--2-1" style={{ marginTop: 16 }}>
        <section className="ak-panel">
          <div className="ak-panel-head">
            <div><h2 className="ak-h">Orders per hour</h2><p className="ak-note">Click an hour in the list to see why.</p></div>
            <div className="ak-key"><span><i />Likely</span><span><i className="band" />P10 to P90</span></div>
          </div>
          <div className="ak-panel-body">
            <ForecastChart data={dh.map((h) => ({ label: hh(h.time), p10: h.p10, p50: h.p50, p90: h.p90 }))} nowLabel={pick ? hh(pick.time) : undefined} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 12 }}>
              {open.map((h) => (
                <button key={h.time} className="ak-btn" style={{ height: 26, padding: "0 8px", fontSize: 12, ...(pick?.time === h.time ? { background: "var(--od-ink)", color: "var(--od-on-ink)", borderColor: "var(--od-ink)" } : {}) }} onClick={() => setSel(h.time)}>{hh(h.time)}</button>
              ))}
            </div>
          </div>
        </section>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Why {pick ? hh(pick.time) : ""} looks like this</h2><p className="ak-note">Orders added or removed by each reason</p></div></div>
          {pick ? (
            <>
              <div className="ak-row"><div className="ak-row-title">Normal for this hour and weekday</div><div className="ak-row-n">{base.toFixed(1)}</div></div>
              {groups.map((g) => (
                <div className="ak-row" key={g.group} style={{ gridTemplateColumns: "minmax(0,1fr) 90px 56px" }}>
                  <div className="ak-row-title">{g.group}</div>
                  <div className="ak-bar-track"><div className={`ak-bar-fill${g.value < 0 ? " neg" : ""}`} style={{ width: `${Math.min(100, (Math.abs(g.value) / Math.max(1, pick.p50)) * 300)}%` }} /></div>
                  <div className={`ak-row-n ${g.value < -0.05 ? "is-bad" : ""}`} style={{ fontSize: 13 }}>{signed(g.value)}</div>
                </div>
              ))}
              <div className="ak-row"><div className="ak-row-title"><b>Likely orders</b> <span className="faint">({Math.round(pick.p10)} to {Math.round(pick.p90)})</span></div><div className="ak-row-n">{pick.p50.toFixed(0)}</div></div>
              <p className="ak-panel-foot">{pick.weather && <>Weather: {pick.weather.tempC.toFixed(1)}°C, {pick.weather.precipMm} mm, wind {pick.weather.windMs} m/s. </>}Reasons are measured by switching each group of inputs to a neutral value and re-running the model.</p>
            </>
          ) : <div className="ak-empty">Closed all day.</div>}
        </section>
      </div>

      {history.length > 0 && (
        <section className="ak-panel" style={{ marginTop: 16 }}>
          <div className="ak-panel-head"><div><h2 className="ak-h">Last two weeks of the backtest, hourly</h2><p className="ak-note">{historyNote}</p></div>
            <div className="ak-key"><span><i className="ink" />Actual</span><span><i />Forecast</span></div></div>
          <div className="ak-panel-body">
            <ForecastChart height={240} data={history.map((h) => ({ label: `${dayLabel(osloDate(h.time))} ${hh(h.time)}`, p10: h.p10, p50: h.p50, p90: h.p90, actual: h.actual }))} />
          </div>
        </section>
      )}
    </>
  );
}
