"use client";

import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { axis, grid, tip } from "./chartTheme";

type Row = { label: string; orders: number; front: number; kitchen: number; required: number; planned: number };

export default function StaffingCharts({ rows }: { rows: Row[] }) {
  return (
    <section className="ak-panel">
      <div className="ak-panel-head">
        <div><h2 className="ak-h">Crew needed vs planned</h2></div>
        <div className="ak-key"><span><i style={{ background: "var(--od-data)" }} />Counter</span><span><i style={{ background: "var(--od-ring)" }} />Kitchen</span><span><i className="ink" />Planned</span></div>
      </div>
      <div className="ak-panel-body">
        <div className="ak-chart">
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 6, right: 0, bottom: 0, left: -14 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip {...tip} />
              <Bar dataKey="front" name="Counter" stackId="s" fill="var(--od-data)" isAnimationActive={false} />
              <Bar dataKey="kitchen" name="Kitchen" stackId="s" fill="var(--od-ring)" isAnimationActive={false} />
              <Line type="stepAfter" dataKey="planned" name="Planned crew" stroke="var(--od-ink)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
