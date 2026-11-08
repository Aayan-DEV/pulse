"use client";

import ForecastChart from "./ForecastChart";

export default function DailyBacktest({ rows, note }: { rows: { date: string; actual: number; p10: number; p50: number; p90: number }[]; note: string }) {
  return (
    <section className="ak-panel" style={{ marginTop: 16 }}>
      <div className="ak-panel-head">
        <div><h2 className="ak-h">Every day of the test year</h2><p className="ak-note">{note}</p></div>
        <div className="ak-key"><span><i className="ink" />Actual</span><span><i />Forecast</span><span><i className="band" />Range</span></div>
      </div>
      <div className="ak-panel-body">
        <ForecastChart height={280} data={rows.map((r) => ({ label: r.date, p10: r.p10, p50: r.p50, p90: r.p90, actual: r.actual }))} />
      </div>
    </section>
  );
}
