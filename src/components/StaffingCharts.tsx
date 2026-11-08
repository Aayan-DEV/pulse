"use client";

import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { axis, grid, tip } from "./chartTheme";

type Row = { label: string; orders: number; front: number; kitchen: number; required: number; planned: number };

export default function StaffingCharts({ rows }: { rows: Row[] }) {
  return (
    <section className="ak-panel">
      <div className="ak-panel-head">
        <div><h2 className="ak-h">Needed vs planned, by hour</h2><p className="ak-note">Bars are crew needed (front and kitchen). The ink line is crew on the plan. Orders on the right axis.</p></div>
        <div className="ak-key"><span><i style={{ background: "var(--od-data)" }} />Front</span><span><i style={{ background: "var(--od-ring)" }} />Kitchen</span><span><i className="ink" />Planned</span><span><i style={{ background: "var(--od-pos)" }} />Orders</span></div>
      </div>
      <div className="ak-panel-body">
        <div className="ak-chart">
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 6, right: 0, bottom: 0, left: -14 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} allowDecimals={false} />
              <YAxis yAxisId="o" orientation="right" {...axis} />
              <Tooltip {...tip} />
              <Bar dataKey="front" name="Front" stackId="s" fill="var(--od-data)" isAnimationActive={false} />
              <Bar dataKey="kitchen" name="Kitchen" stackId="s" fill="var(--od-ring)" isAnimationActive={false} />
              <Line type="stepAfter" dataKey="planned" name="Planned crew" stroke="var(--od-ink)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              <Line yAxisId="o" dataKey="orders" name="Orders" stroke="var(--od-pos)" strokeWidth={1.2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
