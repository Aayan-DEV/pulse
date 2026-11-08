"use client";

import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList } from "recharts";
import { axis, grid, tip } from "./chartTheme";
import ForecastChart, { type BandPoint } from "./ForecastChart";
import Reasons from "./Reasons";

export type Day = {
  label: string; short: string; p50: number; vs: number | null;
  reasons: { group: string; label: string; value: number }[];
  hours: BandPoint[];
};

const n = (v: number) => Math.round(v).toLocaleString("en");

// Seven bars, one per day. Click a bar to see that day's hours and reasons.
export default function ForecastView({ days }: { days: Day[] }) {
  const [i, setI] = useState(0);
  const d = days[i];
  return (
    <>
      <section className="ak-panel">
        <div className="ak-panel-head"><div><h2 className="ak-h">Orders per day</h2><p className="ak-note">Click a day</p></div></div>
        <div className="ak-panel-body">
          <div className="ak-chart" style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={days} margin={{ top: 22, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="short" {...axis} />
                <YAxis {...axis} />
                <Tooltip {...tip} cursor={{ fill: "var(--od-hover)" }} formatter={(v) => [n(Number(v)), "Orders"]} />
                <Bar dataKey="p50" isAnimationActive={false} onClick={(_, idx) => setI(idx)} style={{ cursor: "pointer" }}>
                  {days.map((x, k) => <Cell key={x.label} fill={k === i ? "var(--od-data)" : "var(--od-ring)"} />)}
                  <LabelList dataKey="p50" position="top" formatter={(v: unknown) => n(Number(v))} style={{ fill: "var(--od-muted)", fontSize: 12 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {d && (
        <div className="ak-grid ak-grid--2-1" style={{ marginTop: 12 }}>
          <section className="ak-panel">
            <div className="ak-panel-head">
              <div><h2 className="ak-h">{d.label}: {n(d.p50)} orders</h2>
                <p className="ak-note">{d.vs == null ? "" : Math.abs(d.vs) < 3 ? "A normal day" : `${Math.abs(d.vs)}% ${d.vs > 0 ? "busier" : "quieter"} than normal`}</p></div>
              <div className="ak-key"><span><i />Expected</span><span><i className="band" />Likely range</span></div>
            </div>
            <div className="ak-panel-body">{d.hours.length ? <ForecastChart data={d.hours} height={240} /> : <div className="ak-empty">Closed.</div>}</div>
          </section>
          <section className="ak-panel">
            <div className="ak-panel-head"><div><h2 className="ak-h">Why</h2></div></div>
            <Reasons reasons={d.reasons.slice(0, 5)} />
          </section>
        </div>
      )}
    </>
  );
}
