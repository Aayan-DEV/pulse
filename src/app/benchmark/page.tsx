import { Gauge } from "lucide-react";
import PageHead from "@/components/PageHead";
import { readData } from "@/lib/data";
import DailyBacktest from "@/components/DailyBacktest";

export const dynamic = "force-dynamic";

type Bench = {
  testRange: [string, string];
  models: { name: string; wape: number; mae: number; pinball: Record<string, number>; note?: string }[];
  coverage: { target: number; raw: number; calibrated: number; belowP10Calibrated: number; aboveP90Calibrated: number };
  conformal: { calibration: string; scale: string };
  effectRecovery: { group: string; activeHours: number; trueMeanUplift: number | null; modelMeanUplift: number | null; corr?: number | null; note?: string }[];
  spikeFinder: { spikeDaysEvaluated: number; definition: string; top1: number; top3: number; byTruth: Record<string, { days: number; top1: number; top3: number }> };
  ablation: { dropped: string; wape: number; delta: number }[];
};
type Hist = { daily: { date: string; actual: number; p10: number; p50: number; p90: number }[]; note: string };

const pct = (v: number | null | undefined, d = 1) => (v == null ? "n/a" : `${(v * 100).toFixed(d)}%`);
const d10 = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Oslo" });

export default function BenchmarkPage() {
  const b = readData<Bench | null>("model/benchmark.json", null);
  const h = readData<Hist | null>("model/history.json", null);
  const meta = readData<Record<string, unknown> | null>("model/meta.json", null);
  if (!b) return <main className="adm-content"><PageHead crumb="Model / Benchmark" title="Benchmark" icon={Gauge} /><div className="ak-empty">The model is still training.</div></main>;
  const ours = b.models[0];
  const best = b.models.slice(1).sort((x, y) => x.wape - y.wape)[0];
  const gain = best ? (best.wape - ours.wape) / best.wape : 0;
  return (
    <main className="adm-content">
      <PageHead crumb="Model / Benchmark" title="Benchmark" icon={Gauge}
        finding={<>On {d10(b.testRange[0])} to {d10(b.testRange[1])}, held out from training, the model&apos;s error is <b>{pct(ours.wape)}</b> against <b>{pct(best?.wape)}</b> for the best simple method, <b>{(gain * 100).toFixed(0)}% lower</b>. Its 80% range really catches <b>{pct(b.coverage.calibrated)}</b> of hours. Sales here are simulated on real inputs, so this proves the method, not real effect sizes.</>} />

      <section className="ak-panel">
        <div className="ak-kpis">
          <div className="ak-kpi"><div className="ak-kpi-label">Error (WAPE)</div><div className="ak-kpi-value">{pct(ours.wape)}</div><div className="ak-kpi-sub">Total miss ÷ total sales</div></div>
          <div className="ak-kpi"><div className="ak-kpi-label">vs best baseline</div><div className="ak-kpi-value is-good">−{(gain * 100).toFixed(0)}%</div><div className="ak-kpi-sub">{best?.name}</div></div>
          <div className="ak-kpi"><div className="ak-kpi-label">Range hit rate</div><div className="ak-kpi-value">{pct(b.coverage.calibrated)}</div><div className="ak-kpi-sub">Target {pct(b.coverage.target, 0)}; before calibration {pct(b.coverage.raw)}</div></div>
          <div className="ak-kpi"><div className="ak-kpi-label">Spike cause found</div><div className="ak-kpi-value">{pct(b.spikeFinder.top1, 0)}</div><div className="ak-kpi-sub">Top 1; top 3 {pct(b.spikeFinder.top3, 0)} of {b.spikeFinder.spikeDaysEvaluated} days</div></div>
        </div>
      </section>

      {h && <DailyBacktest rows={h.daily} note={h.note} />}

      <div className="ak-grid" style={{ marginTop: 16 }}>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Model against baselines</h2><p className="ak-note">Lower is better. Pinball loss scores a quantile forecast (P10, P50, P90).</p></div></div>
          <table className="ak-table">
            <thead><tr><th>Method</th><th className="num">WAPE</th><th className="num">MAE</th><th className="num">Pinball P50</th></tr></thead>
            <tbody>{b.models.map((m, i) => (
              <tr key={m.name}><td style={{ whiteSpace: "normal" }}>{i === 0 ? <b>{m.name}</b> : m.name}{m.note && <span className="sub">{m.note}</span>}</td>
                <td className="num">{pct(m.wape)}</td><td className="num">{m.mae.toFixed(1)}</td><td className="num">{m.pinball.p50?.toFixed(2)}</td></tr>
            ))}</tbody>
          </table>
          <p className="ak-panel-foot">The range is calibrated with split conformal prediction on {b.conformal.calibration}. Below P10: {pct(b.coverage.belowP10Calibrated)}, above P90: {pct(b.coverage.aboveP90Calibrated)} (each should be about 10%).</p>
        </section>

        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Does it find the true effects?</h2><p className="ak-note">Mean orders per hour each reason adds, when active. True is what the simulator injected.</p></div></div>
          <table className="ak-table">
            <thead><tr><th>Reason</th><th className="num">Hours active</th><th className="num">True</th><th className="num">Model</th><th className="num">Match</th></tr></thead>
            <tbody>{b.effectRecovery.map((e) => (
              <tr key={e.group}><td style={{ whiteSpace: "normal" }}>{e.group}{e.note && <span className="sub">{e.note}</span>}</td>
                <td className="num">{e.activeHours.toLocaleString("en")}</td>
                <td className="num">{e.trueMeanUplift == null ? "n/a" : e.trueMeanUplift.toFixed(1)}</td>
                <td className="num">{e.modelMeanUplift == null ? "n/a" : e.modelMeanUplift.toFixed(1)}</td>
                <td className="num">{e.corr == null ? <span className="faint">n/a</span> : e.corr.toFixed(2)}</td></tr>
            ))}</tbody>
          </table>
          <p className="ak-panel-foot">Match is the correlation between the model&apos;s hourly estimate and the true hourly effect. Few active hours means too little to learn from; pooling many stores fixes that.</p>
        </section>
      </div>

      <div className="ak-grid" style={{ marginTop: 16 }}>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">What each signal is worth</h2><p className="ak-note">Error after removing one group of inputs and retraining. A bigger rise means the signal matters more.</p></div></div>
          {b.ablation.filter((a) => a.dropped !== "none").sort((x, y) => y.delta - x.delta).map((a) => (
            <div key={a.dropped} className="ak-row" style={{ gridTemplateColumns: "minmax(0,1fr) 140px 70px" }}>
              <div className="ak-row-title">{a.dropped}</div>
              <div className="ak-bar-track"><div className="ak-bar-fill" style={{ width: `${Math.min(100, Math.max(0, a.delta) * 600)}%` }} /></div>
              <div className="ak-row-n" style={{ fontSize: 13 }}>{a.delta >= 0 ? "+" : ""}{(a.delta * 100).toFixed(2)} pt</div>
            </div>
          ))}
        </section>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Spike finder by true cause</h2><p className="ak-note">{b.spikeFinder.definition}</p></div></div>
          <table className="ak-table">
            <thead><tr><th>True cause</th><th className="num">Days</th><th className="num">Top 1</th><th className="num">Top 3</th></tr></thead>
            <tbody>{Object.entries(b.spikeFinder.byTruth).map(([k, v]) => (
              <tr key={k}><td>{k}</td><td className="num">{v.days}</td><td className="num">{pct(v.top1, 0)}</td><td className="num">{pct(v.top3, 0)}</td></tr>
            ))}</tbody>
          </table>
        </section>
      </div>
      {meta && <p className="ak-stamp" style={{ marginTop: 16 }}>Trained {String(meta.generatedAt ?? "")}</p>}
    </main>
  );
}
