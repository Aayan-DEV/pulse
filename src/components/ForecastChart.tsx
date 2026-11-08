"use client";

import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { axis, grid, tip } from "./chartTheme";

export type BandPoint = { label: string; p10: number; p50: number; p90: number; actual?: number; staff?: number };

// P10-P90 band as a stacked area (base + width), P50 as the line, actuals in ink.
export default function ForecastChart({ data, nowLabel, height = 260, showStaff = false }: {
  data: BandPoint[]; nowLabel?: string; height?: number; showStaff?: boolean;
}) {
  const rows = data.map((d) => ({ ...d, base: d.p10, band: Math.max(0, d.p90 - d.p10) }));
  return (
    <div className="ak-chart" style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="label" {...axis} minTickGap={28} />
          <YAxis {...axis} />
          {showStaff && <YAxis yAxisId="staff" orientation="right" {...axis} />}
          <Tooltip {...tip} formatter={(v: number, n: string) => {
            if (n === "base") return [null, null] as unknown as [string, string];
            const names: Record<string, string> = { band: "P10 to P90 width", p50: "Likely (P50)", actual: "Actual", staff: "Staff needed" };
            return [Math.round(v).toString(), names[n] ?? n];
          }} />
          <Area dataKey="base" stackId="b" stroke="none" fill="transparent" isAnimationActive={false} />
          <Area dataKey="band" stackId="b" stroke="none" fill="var(--od-data-soft)" isAnimationActive={false} />
          <Line dataKey="p50" stroke="var(--od-data)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
          {rows.some((r) => r.actual != null) && <Line dataKey="actual" stroke="var(--od-ink)" strokeWidth={1.2} dot={false} isAnimationActive={false} />}
          {showStaff && <Line yAxisId="staff" type="stepAfter" dataKey="staff" stroke="var(--od-pos)" strokeWidth={1.4} dot={false} isAnimationActive={false} />}
          {nowLabel && <ReferenceLine x={nowLabel} stroke="var(--od-ink)" strokeDasharray="3 3" label={{ value: "Now", fill: "var(--od-muted)", fontSize: 11, position: "insideTopRight" }} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
