"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, RotateCw } from "lucide-react";
import type { LiveSnapshot } from "@/lib/types";
import type { ForecastPayload } from "@/lib/forecastPayload";
import ForecastChart from "./ForecastChart";

const hh = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
const osloDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))}`;

export default function Overview() {
  const [f, setF] = useState<ForecastPayload | null>(null);
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [a, b] = await Promise.all([fetch("/api/forecast", { cache: "no-store" }), fetch("/api/live", { cache: "no-store" })]);
      if (a.ok) setF(await a.json()); else setErr("The forecast is not ready yet. The model is still being trained.");
      if (b.ok) setLive(await b.json());
      if (a.ok) setErr(null);
      setAt(new Date());
    } catch {
      setErr("Could not reach the server.");
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 120_000); return () => clearInterval(t); }, [load]);

  const now = new Date();
  const cur = f?.hours.find((h) => new Date(h.time).getTime() <= now.getTime() && now.getTime() - new Date(h.time).getTime() < 3600_000) ?? f?.hours[0];
  const staffNow = cur ? f?.staffing.find((s) => s.time === cur.time) : undefined;
  const todayKey = osloDate(now.toISOString());
  const todayHours = f?.hours.filter((h) => osloDate(h.time) === todayKey) ?? [];
  const vsTypical = f && f.today.typical ? (100 * (f.today.p50 - f.today.typical)) / f.today.typical : null;
  const drivers = (f?.driversToday ?? []).filter((d) => Math.abs(d.value) >= 1).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const top = drivers[0];
  const late = live?.transit.departures.filter((d) => d.cancelled || d.delayMin >= 5).length ?? 0;

  return (
    <>
      <div className="ak-head" style={{ marginTop: -8 }}>
        <p className="ak-finding" style={{ margin: 0 }}>
          {f ? <>Expect <b>{Math.round(f.today.p50).toLocaleString("en")} orders today</b> (likely range {Math.round(f.today.p10).toLocaleString("en")} to {Math.round(f.today.p90).toLocaleString("en")}){vsTypical != null && <>, <b>{vsTypical >= 0 ? "+" : ""}{vsTypical.toFixed(0)}%</b> against a typical {new Date().toLocaleDateString("en-GB", { weekday: "long", timeZone: "Europe/Oslo" })}</>}.{top && <> The biggest reason is <b>{top.group.toLowerCase()}</b> ({signed(top.value)} orders).</>}</>
            : err ?? "Loading the forecast"}
        </p>
        <div className="ak-head-tools">
          <span className="ak-stamp">{at ? `Updated ${hh(at.toISOString())}` : ""}</span>
          <button className="ak-icon-btn" onClick={load} aria-label="Refresh" disabled={busy}><RotateCw style={busy ? { animation: "spin 1s linear infinite" } : undefined} /></button>
        </div>
      </div>

      <section className="ak-panel">
        <div className="ak-kpis">
          <div className="ak-kpi">
            <div className="ak-kpi-label">This hour</div>
            {cur && !cur.open ? (() => {
              const nxt = f?.hours.find((h) => h.open && new Date(h.time).getTime() > now.getTime());
              return <><div className="ak-kpi-value is-na">Closed</div><div className="ak-kpi-sub">{nxt ? `Opens ${hh(nxt.time)}, ${Math.round(nxt.p50)} orders in the first hour` : "Closed"}</div></>;
            })() : <>
              <div className="ak-kpi-value">{cur ? Math.round(cur.p50) : "–"}<small>orders</small></div>
              <div className="ak-kpi-sub">{cur ? `${Math.round(cur.p10)} to ${Math.round(cur.p90)} likely` : "Waiting for the model"}</div>
            </>}
          </div>
          <div className="ak-kpi">
            <div className="ak-kpi-label">Staff needed now</div>
            <div className="ak-kpi-value">{staffNow ? staffNow.total : "–"}{cur && !cur.open && <small>prep</small>}</div>
            <div className="ak-kpi-sub">{staffNow ? `${staffNow.front} front, ${staffNow.kitchen} kitchen, ${(staffNow.serviceLevel * 100).toFixed(0)}% served fast` : "Erlang C on the forecast"}</div>
          </div>
          <div className="ak-kpi">
            <div className="ak-kpi-label">Weather</div>
            <div className="ak-kpi-value">{live?.weather.now ? `${Math.round(live.weather.now.tempC)}°C` : "–"}</div>
            <div className="ak-kpi-sub">{live?.weather.now ? `${live.weather.now.precipMm} mm rain, wind ${live.weather.now.windMs} m/s` : "met.no"}</div>
          </div>
          <div className="ak-kpi">
            <div className="ak-kpi-label">Trains and trams</div>
            <div className={`ak-kpi-value${late ? " is-bad" : ""}`}>{live ? (late ? `${late} late` : "On time") : "–"}</div>
            <div className="ak-kpi-sub">{live ? `${live.transit.situations.length} disruption notices nearby` : "Entur live"}</div>
          </div>
          <div className="ak-kpi">
            <div className="ak-kpi-label">Events, next 7 days</div>
            <div className="ak-kpi-value">{live ? live.events.length : "–"}</div>
            <div className="ak-kpi-sub">{live?.events[0] ? `Next: ${live.events[0].title.slice(0, 34)}` : "Venue calendars"}</div>
          </div>
          <div className="ak-kpi">
            <div className="ak-kpi-label">Model check</div>
            <div className="ak-kpi-value">{f?.model.coverage != null ? `${(f.model.coverage * 100).toFixed(0)}%` : "–"}</div>
            <div className="ak-kpi-sub">{f?.model.wape != null ? `of hours inside the range; error ${(f.model.wape * 100).toFixed(1)}%` : "Backtest on held-out months"}</div>
          </div>
        </div>
      </section>

      <div className="ak-grid" style={{ marginTop: 16 }}>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">What moves sales today</h2><p className="ak-note">Orders added or removed by each reason, against a plain day. Open one to see the hours.</p></div></div>
          {drivers.length === 0 && <div className="ak-empty">{f ? "Nothing unusual today: weather, events and trains are all normal." : "Waiting for the model."}</div>}
          {drivers.map((d) => (
            <Link key={d.group} href="/forecast" className="ak-row" style={{ gridTemplateColumns: "minmax(0,1fr) 120px auto 16px" }}>
              <div className="ak-row-title">{d.group}</div>
              <div className="ak-bar-track"><div className={`ak-bar-fill${d.value < 0 ? " neg" : ""}`} style={{ width: `${Math.min(100, (100 * Math.abs(d.value)) / Math.max(1, Math.abs(top?.value ?? 1)))}%` }} /></div>
              <div className={`ak-row-n ${d.value < 0 ? "is-bad" : ""}`}>{signed(d.value)}</div>
              <ChevronRight style={{ width: 14, height: 14, color: "var(--od-faint)" }} />
            </Link>
          ))}
          {f && <p className="ak-panel-foot">Inputs right now: {f.inputs.events} events, {f.inputs.situations ? `${f.inputs.situations} transit notices with real delays` : "no real train delays"}, weather from {f.inputs.weatherSource}.</p>}
        </section>

        <section className="ak-panel">
          <div className="ak-panel-head">
            <div><h2 className="ak-h">Live around the store</h2><p className="ak-note">Disruptions, departures and events, newest first.</p></div>
            <Link href="/map" className="ak-btn">Open the map</Link>
          </div>
          {!live && <div className="ak-empty">Loading live data</div>}
          {live?.transit.situations.slice(0, 3).map((s) => (
            <div className="ak-row" key={s.id}><div><div className="ak-row-title is-bad">{s.summary}</div><div className="ak-row-why">Entur disruption notice</div></div></div>
          ))}
          {live?.events.slice(0, 4).map((e) => (
            <div className="ak-row" key={e.id}>
              <div><div className="ak-row-title">{e.title}</div><div className="ak-row-why">{e.venue ?? e.category} · {new Date(e.start).toLocaleString("en-GB", { timeZone: "Europe/Oslo", weekday: "short", hour: "2-digit", minute: "2-digit" })}</div></div>
              <div className="ak-row-n" style={{ fontSize: 13 }}>{e.expectedAttendance ? e.expectedAttendance.toLocaleString("en") : ""}</div>
            </div>
          ))}
          {live?.transit.departures.slice(0, 4).map((d, i) => (
            <div className="ak-row" key={i}>
              <div><div className="ak-row-title">{d.mode} {d.line} to {d.destination}</div><div className="ak-row-why">Nationaltheatret</div></div>
              <div className={`ak-row-n ${d.cancelled ? "is-bad" : d.delayMin >= 3 ? "is-warn" : ""}`} style={{ fontSize: 13 }}>{d.cancelled ? "Cancelled" : hh(d.expected)}</div>
            </div>
          ))}
        </section>
      </div>

      <section className="ak-panel" style={{ marginTop: 16 }}>
        <div className="ak-panel-head">
          <div><h2 className="ak-h">Orders per hour, today</h2><p className="ak-note">Likely line with the P10 to P90 range. Green steps are the staff needed.</p></div>
          <div className="ak-key"><span><i />Likely</span><span><i className="band" />Range</span><span><i style={{ background: "var(--od-pos)" }} />Staff</span></div>
        </div>
        <div className="ak-panel-body">
          {todayHours.length ? (
            <ForecastChart showStaff nowLabel={cur ? hh(cur.time) : undefined}
              data={todayHours.map((h) => ({ label: hh(h.time), p10: h.p10, p50: h.p50, p90: h.p90, staff: f?.staffing.find((s) => s.time === h.time)?.total }))} />
          ) : <div className="ak-empty">{err ?? "Loading"}</div>}
        </div>
      </section>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
