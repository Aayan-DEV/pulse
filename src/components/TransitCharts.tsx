"use client";

import { useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { axis, grid, tip } from "./chartTheme";

export type DayRow = { day: string } & Record<string, number | string>;

const COLORS = ["var(--od-data)", "var(--od-ink)", "var(--od-warn)", "var(--od-pos)"];

export default function TransitCharts({ days, modes }: { days: DayRow[]; modes: string[] }) {
  const [metric, setMetric] = useState<"late" | "canc" | "delay">("late");
  const label = { late: "Share more than 5 min late (%)", canc: "Cancelled (%)", delay: "Mean delay (min)" }[metric];
  return (
    <section className="ak-panel">
      <div className="ak-panel-head">
        <div><h2 className="ak-h">Daily punctuality near the store</h2><p className="ak-note">{label}, real data</p></div>
        <div className="ak-seg">
          {(["late", "canc", "delay"] as const).map((m) => (
            <button key={m} aria-pressed={metric === m} onClick={() => setMetric(m)}>{{ late: "Late share", canc: "Cancelled", delay: "Mean delay" }[m]}</button>
          ))}
        </div>
      </div>
      <div className="ak-panel-body">
        <div className="ak-key" style={{ marginBottom: 8 }}>{modes.map((m, i) => <span key={m}><i style={{ background: COLORS[i % 4] }} />{m}</span>)}</div>
        <div className="ak-chart">
          <ResponsiveContainer>
            <LineChart data={days} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="day" {...axis} minTickGap={48} />
              <YAxis {...axis} />
              <Tooltip {...tip} />
              {modes.map((m, i) => <Line key={m} dataKey={`${m}_${metric}`} name={m} stroke={COLORS[i % 4]} dot={false} strokeWidth={1.4} isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
