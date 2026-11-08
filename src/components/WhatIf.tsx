"use client";

import { useEffect, useRef, useState } from "react";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import {
  TrainFront, Snowflake, Ship, Wallet, TreePine, CalendarPlus, ShoppingBag, Users, Clock, Banknote,
  ChefHat, CalendarClock, Package, ArrowRight, LoaderCircle, Music, Trophy, PartyPopper, Megaphone, Presentation,
} from "lucide-react";
import { axis, grid, tip } from "./chartTheme";
import type { WhatIfResult } from "@/lib/whatif";

type Venue = { key: string; name: string; lat: number; lon: number; km: number };
const TYPES = [
  { k: "concert", label: "Concert", icon: Music }, { k: "sports", label: "Sports", icon: Trophy },
  { k: "festival", label: "Festival", icon: PartyPopper }, { k: "protest", label: "Demonstration", icon: Megaphone },
  { k: "conference", label: "Conference", icon: Presentation },
] as const;
const SCEN = [
  { k: "tbaneClosed", label: "T-bane closed", icon: TrainFront },
  { k: "heavySnow", label: "Heavy snow", icon: Snowflake },
  { k: "cruiseDay", label: "Cruise day", sub: "4 ships, 12 000 passengers", icon: Ship },
  { k: "payday", label: "Payday", icon: Wallet },
  { k: "xmasMarket", label: "Christmas market", icon: TreePine },
] as const;
type Flags = Record<(typeof SCEN)[number]["k"], boolean>;
const ZOOM = ["Hour", "Day", "Week", "Month"] as const;

const n0 = (v: number) => Math.round(v).toLocaleString("en").replace(/,/g, " ");
const sign = (v: number) => `${v >= 0 ? "+" : "−"}${n0(Math.abs(v))}`;

function Big({ icon: Icon, label, before, after, fmt, delta }: { icon: typeof Users; label: string; before: string; after: string; fmt?: string; delta: string | null }) {
  return (
    <div className="wi-card">
      <div className="wi-card-label"><Icon />{label}</div>
      <div className="wi-card-vals"><span className="faint">{before}</span><ArrowRight /><b>{after}</b>{fmt && <small>{fmt}</small>}</div>
      <div className={`wi-card-delta${delta && delta.startsWith("−") ? " neg" : ""}`}>{delta ?? "No change"}</div>
    </div>
  );
}

export default function WhatIf({ venues }: { venues: Venue[] }) {
  const [day, setDay] = useState(0);
  const [flags, setFlags] = useState<Flags>({ tbaneClosed: false, heavySnow: false, cruiseDay: false, payday: false, xmasMarket: false });
  const [evOn, setEvOn] = useState(true);
  const [type, setType] = useState<(typeof TYPES)[number]["k"]>("concert");
  const [venue, setVenue] = useState(venues[0].key);
  const [att, setAtt] = useState(11000);
  const [start, setStart] = useState(19);
  const [dur, setDur] = useState(3);
  const [zoom, setZoom] = useState<(typeof ZOOM)[number]>("Hour");
  const [res, setRes] = useState<WhatIfResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const v = venues.find((x) => x.key === venue)!;
    const body = { day, ...flags, event: evOn ? { title: `${TYPES.find((t) => t.k === type)!.label} at ${v.name}`, category: type, lat: v.lat, lon: v.lon, attendance: att, startHour: start, durationH: dur } : null };
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch("/api/what-if", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json();
        if (id === seq.current) { if (j.error) setErr(j.error); else { setRes(j); setErr(null); } }
      } catch { if (id === seq.current) setErr("Could not reach the server"); }
      if (id === seq.current) setBusy(false);
    }, 300);
    return () => clearTimeout(t);
  }, [day, flags, evOn, type, venue, att, start, dur, venues]);

  const rows = !res ? [] : zoom === "Hour" ? res.hourly : zoom === "Day" ? res.daily : zoom === "Week" ? res.weekly : res.month;
  const chart = rows.map((r) => ({ ...r, lo: r.p10, band: Math.max(0, r.p90 - r.p10) }));
  const k = res?.kpis;
  const v = venues.find((x) => x.key === venue)!;

  return (
    <>
      {/* Day */}
      <div className="ak-bar">
        <span className="ak-bar-label">Day</span>
        <div className="ak-seg" style={{ flexWrap: "wrap", height: "auto" }}>
          {(res?.days ?? Array.from({ length: 7 }, (_, i) => (i === 0 ? "Today" : `+${i}`))).map((d, i) => (
            <button key={i} aria-pressed={i === day} onClick={() => setDay(i)}>{d}</button>
          ))}
        </div>
        {busy && <LoaderCircle className="spin" style={{ width: 16, height: 16, marginLeft: 8 }} />}
      </div>

      {/* Scenarios */}
      <div className="wi-scen">
        {SCEN.map((s) => {
          const on = flags[s.k];
          const sub = s.k === "xmasMarket" ? (res?.xmasInBaseline ? "Open that day; tap to close it" : "Closed that day; tap to open it") : "sub" in s ? s.sub : "That whole day";
          return (
            <button key={s.k} className="wi-tile" aria-pressed={on} onClick={() => setFlags({ ...flags, [s.k]: !on })}>
              <s.icon /><span><b>{s.label}</b><small>{sub}</small></span>
            </button>
          );
        })}
        <button className="wi-tile" aria-pressed={evOn} onClick={() => setEvOn(!evOn)}>
          <CalendarPlus /><span><b>Add an event</b><small>{evOn ? `${n0(att)} people at ${v.name}` : "Off"}</small></span>
        </button>
      </div>

      {evOn && (
        <section className="ak-panel wi-event">
          <div className="wi-field"><span className="wi-label">Type</span>
            <div className="wi-chips">{TYPES.map((t) => <button key={t.k} className="wi-chip" aria-pressed={type === t.k} onClick={() => setType(t.k)}><t.icon />{t.label}</button>)}</div></div>
          <div className="wi-field"><span className="wi-label">Place</span>
            <div className="wi-chips">{venues.map((x) => <button key={x.key} className="wi-chip" aria-pressed={venue === x.key} onClick={() => setVenue(x.key)}>{x.name}<small>{x.km} km</small></button>)}</div></div>
          <div className="wi-sliders">
            <label className="wi-field"><span className="wi-label">People <b>{n0(att)}</b></span><input className="wi-range" type="range" min={500} max={60000} step={500} value={att} onChange={(e) => setAtt(+e.target.value)} /></label>
            <label className="wi-field"><span className="wi-label">Starts <b>{String(start % 24).padStart(2, "0")}:00</b></span><input className="wi-range" type="range" min={8} max={26} step={1} value={start} onChange={(e) => setStart(+e.target.value)} /></label>
            <label className="wi-field"><span className="wi-label">Lasts <b>{dur} h</b></span><input className="wi-range" type="range" min={1} max={10} step={1} value={dur} onChange={(e) => setDur(+e.target.value)} /></label>
          </div>
        </section>
      )}

      {err && <div className="ak-error" style={{ marginTop: 16 }}>{err}</div>}

      {k && res && (<>
        <div className="wi-cards">
          <Big icon={ShoppingBag} label={`Orders, ${res.dayLabel}`} before={n0(k.orders[0])} after={n0(k.orders[1])} delta={Math.round(k.orders[1] - k.orders[0]) ? `${sign(k.orders[1] - k.orders[0])} orders (${sign(((k.orders[1] - k.orders[0]) / Math.max(1, k.orders[0])) * 100)}%)` : null} />
          <Big icon={Users} label="Staff needed at peak" before={String(k.peakStaff[0])} after={String(k.peakStaff[1])} delta={k.peakStaff[1] - k.peakStaff[0] ? `${sign(k.peakStaff[1] - k.peakStaff[0])} people` : null} />
          <Big icon={Banknote} label="Wage cost of the day" before={`${n0(k.wageNok[0] / 1000)}k`} after={`${n0(k.wageNok[1] / 1000)}k`} fmt="NOK" delta={Math.round(k.wageNok[1] - k.wageNok[0]) ? `${sign(k.wageNok[1] - k.wageNok[0])} NOK` : null} />
          <Big icon={Clock} label="Busiest hour" before={k.busiest[0]} after={k.busiest[1]} delta={k.busiest[0] !== k.busiest[1] ? "Moves" : null} />
        </div>

        <div className="ak-grid ak-grid--2-1" style={{ marginTop: 16 }}>
          <section className="ak-panel">
            <div className="ak-panel-head">
              <div><h2 className="ak-h">Forecast: normal vs this scenario</h2>
                <p className="ak-note">{zoom === "Hour" ? `Each hour of ${res.dayLabel}, straight from the model.` : zoom === "Day" ? "Each of the next 7 days, adding up the hourly forecast." : zoom === "Week" ? "Next 4 weeks, adding up the hourly forecast." : "Each of the next 28 days, adding up the hourly forecast."}</p></div>
              <div className="ak-seg">{ZOOM.map((z) => <button key={z} aria-pressed={zoom === z} onClick={() => setZoom(z)}>{z}</button>)}</div>
            </div>
            <div className="ak-panel-body">
              <div className="ak-key" style={{ marginBottom: 8 }}><span><i className="ink" style={{ height: 1 }} />Normal</span><span><i />Scenario</span><span><i className="band" />P10 to P90</span></div>
              <div className="ak-chart" style={{ height: 300 }}>
                <ResponsiveContainer>
                  <ComposedChart data={chart} margin={{ top: 6, right: 8, bottom: 0, left: -10 }}>
                    <CartesianGrid {...grid} />
                    <XAxis dataKey="label" {...axis} minTickGap={24} />
                    <YAxis {...axis} />
                    <Tooltip {...tip} formatter={(val: number, name: string, item: { payload?: { p10: number; p90: number } }) => {
                      if (name === "lo") return [null, null] as unknown as [string, string];
                      if (name === "band" && item.payload) return [`${n0(item.payload.p10)} to ${n0(item.payload.p90)}`, "Range"];
                      return [n0(val), name === "base" ? "Normal" : "Scenario"];
                    }} />
                    <Area dataKey="lo" stackId="b" stroke="none" fill="transparent" isAnimationActive={false} />
                    <Area dataKey="band" stackId="b" stroke="none" fill="var(--od-data-soft)" isAnimationActive={false} />
                    <Line dataKey="base" stroke="var(--od-ink)" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                    <Line dataKey="p50" stroke="var(--od-data)" strokeWidth={2.6} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {res.notes.map((x) => <p key={x} className="ak-note" style={{ marginTop: 6 }}>{x}</p>)}
            </div>
          </section>

          <section className="ak-panel">
            <div className="ak-panel-head"><div><h2 className="ak-h">Why it changes</h2><p className="ak-note">Model drivers, scenario minus normal, over the day</p></div></div>
            {res.why.length ? res.why.map((w) => (
              <div key={w.group} className="wi-why"><b className={w.delta < 0 ? "is-bad" : ""}>{sign(w.delta)}</b><span>{w.text.replace(/^[+−]\d[\d ]* orders /, "orders ")}</span></div>
            )) : <div className="ak-empty">No change from the normal forecast.</div>}
          </section>
        </div>

        <section className="ak-panel" style={{ marginTop: 16 }}>
          <div className="ak-panel-head"><div><h2 className="ak-h">What needs to change</h2><p className="ak-note">For {res.dayLabel}, compared with the normal plan</p></div></div>
          <div className="wi-todo">
            <div className="wi-todo-row"><Users /><div><b>Cashiers</b>
              <span>{res.perHour.filter((p) => p.dFront).length ? res.perHour.filter((p) => p.dFront).map((p) => `${p.label} ${sign(p.dFront)}`).join(" · ") : "No change"}</span></div></div>
            <div className="wi-todo-row"><ChefHat /><div><b>Kitchen</b>
              <span>{res.perHour.filter((p) => p.dKitchen).length ? res.perHour.filter((p) => p.dKitchen).map((p) => `${p.label} ${sign(p.dKitchen)}`).join(" · ") : "No change"}</span></div></div>
            <div className="wi-todo-row"><CalendarClock /><div><b>Shifts</b>
              <span>{Math.round(res.shifts.personHours) === 0 ? "No change" : res.shifts.personHours > 0 ? `Add about ${res.shifts.add} shift${res.shifts.add === 1 ? "" : "s"} of 6 h (${n0(res.shifts.personHours)} staff-hours)` : `About ${n0(-res.shifts.personHours)} staff-hours fewer: shorten or move ${Math.abs(res.shifts.add)} shift${Math.abs(res.shifts.add) === 1 ? "" : "s"}`}</span></div></div>
            <div className="wi-todo-row"><Package /><div><b>Stock to order</b>
              <span>{res.stock.every((s) => s.delta === 0) ? "No change" : res.stock.map((s) => `${s.item} ${sign(s.delta)} ${s.unit}`).join(" · ")}</span>
              <small>Assumed per order: 1.15 patties, 0.85 fries, 1.1 buns, 0.9 drinks. Not BK recipe data.</small></div></div>
          </div>
          <p className="ak-panel-foot">Staff from the same Erlang C rules as the Staffing page; wage cost = staff-hours × NOK 215.29 adult minimum wage.</p>
        </section>
      </>)}
      {!res && !err && <div className="ak-empty" style={{ marginTop: 16 }}>Running the model…</div>}
    </>
  );
}
