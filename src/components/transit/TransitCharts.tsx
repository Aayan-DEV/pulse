"use client";

import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { axis, grid, tip } from "../chartTheme";

const BAR_TIP = { ...tip, cursor: { fill: "var(--od-hover)" } };

/** The next hour in 10-minute slots: on time, late, cancelled. */
export function NextHourChart({ data }: { data: { label: string; onTime: number; late: number; cancelled: number }[] }) {
  return (
    <div className="ak-chart" style={{ height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} allowDecimals={false} />
          <Tooltip {...BAR_TIP} />
          <Bar dataKey="onTime" name="On time" stackId="a" fill="var(--od-ring)" isAnimationActive={false} />
          <Bar dataKey="late" name="Late (5+ min)" stackId="a" fill="var(--od-warn)" isAnimationActive={false} />
          <Bar dataKey="cancelled" name="Cancelled" stackId="a" fill="var(--od-neg)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A normal day for this weekday: late trains out of 100 per hour, with the current hour marked. */
export function TypicalDayChart({ data, nowHour }: { data: { hour: number; label: string; late: number }[]; nowHour: number }) {
  return (
    <div className="ak-chart" style={{ height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="label" {...axis} interval={1} />
          <YAxis {...axis} allowDecimals={false} />
          <Tooltip {...BAR_TIP} formatter={(v) => [`${v} of 100 late`, "Usually"]} labelFormatter={(l) => `${l}:00`} />
          <Bar dataKey="late" isAnimationActive={false}>
            {data.map((d) => <Cell key={d.hour} fill={d.hour === nowHour ? "var(--od-data)" : "var(--od-ring)"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Weekly late trains out of 100, rail and metro. */
export function WeeklyChart({ data }: { data: { week: string; rail: number | null; metro: number | null }[] }) {
  return (
    <div className="ak-chart" style={{ height: 220 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="week" {...axis} minTickGap={64} tickFormatter={(w: string) => w.slice(0, 7)} />
          <YAxis {...axis} allowDecimals={false} />
          <Tooltip {...tip} labelFormatter={(l) => `Week of ${l}`} formatter={(v, n) => [`${v} of 100 late`, n]} />
          <Line dataKey="rail" name="Trains" stroke="var(--od-data)" dot={false} strokeWidth={1.6} isAnimationActive={false} connectNulls />
          <Line dataKey="metro" name="Metro" stroke="var(--od-ink)" dot={false} strokeWidth={1.2} isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
