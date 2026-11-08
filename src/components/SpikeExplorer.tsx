"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import ForecastChart from "./ForecastChart";

export type Spike = {
  date: string; spikeHours: number; excessTransactions: number; actual: number; p90: number;
  hours: { time: string; actual: number; p50: number; p90: number; p10?: number }[];
  candidates: { id: string; kind: string; title: string; category?: string; distanceKm?: number; score: number }[];
  truth?: { group?: string; label?: string; mystery?: boolean } | string | null;
  [k: string]: unknown;
};

const hh = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
const dayLabel = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

function truthText(s: Spike): string | null {
  const t = s.truth ?? (s as Record<string, unknown>).trueCause ?? (s as Record<string, unknown>).truthGroup;
  if (!t) return null;
  if (typeof t === "string") return t;
  if (Array.isArray(t)) return t.map((x) => (typeof x === "string" ? x : (x as { group?: string; label?: string }).label ?? (x as { group?: string }).group)).join(", ");
  const o = t as { group?: string; label?: string; mystery?: boolean };
  return `${o.label ?? o.group ?? ""}${o.mystery ? " (hidden from the model)" : ""}`;
}

export default function SpikeExplorer({ spikes }: { spikes: Spike[] }) {
  const [i, setI] = useState(0);
  const s = spikes[i];
  const max = Math.max(...s.candidates.map((c) => c.score), 1);
  const truth = truthText(s);
  return (
    <div className="ak-grid ak-grid--2-1" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)" }}>
      <section className="ak-panel">
        <div className="ak-panel-head"><div><h2 className="ak-h">Spike days</h2></div></div>
        <div style={{ maxHeight: 640, overflowY: "auto" }}>
          {spikes.map((x, k) => (
            <button key={x.date} onClick={() => setI(k)} className="ak-row"
              style={{ width: "100%", textAlign: "left", font: "inherit", color: "inherit", border: 0, borderTop: k ? "1px solid var(--od-surface-2)" : 0, cursor: "pointer", background: k === i ? "var(--od-nav-active)" : "transparent" }}>
              <div><div className="ak-row-title">{dayLabel(x.date)}</div><div className="ak-row-why">{x.candidates[0]?.title ?? "No candidate"}</div></div>
              <div className="ak-row-n" style={{ fontSize: 13 }}>+{Math.round(x.excessTransactions).toLocaleString("en")}</div>
            </button>
          ))}
        </div>
      </section>
      <div>
        <section className="ak-panel">
          <div className="ak-panel-head">
            <div><h2 className="ak-h">{dayLabel(s.date)}: +{Math.round(s.excessTransactions).toLocaleString("en")} extra orders</h2>
              <p className="ak-note">Most likely: <b>{s.candidates[0]?.title ?? "unknown"}</b></p></div>
            <div className="ak-key"><span><i />Expected</span><span><i className="band" />Likely range</span><span><i className="ink" />Sold</span></div>
          </div>
          <div className="ak-panel-body">
            <ForecastChart height={220} data={s.hours.map((h) => ({ label: hh(h.time), p10: h.p10 ?? h.p50, p50: h.p50, p90: h.p90, actual: h.actual }))} />
          </div>
        </section>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Likely causes</h2></div></div>
          {s.candidates.slice(0, 3).map((c, k) => (
            <div key={c.id} className="ak-row" style={{ gridTemplateColumns: "24px minmax(0,1fr) 140px" }} title={`Score ${c.score.toFixed(1)}: learned impact × closeness × timing`}>
              <div className="faint num">{k + 1}</div>
              <div>
                <div className="ak-row-title">{c.kind === "unexplained" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><HelpCircle style={{ width: 14, height: 14 }} />{c.title}</span> : c.title}</div>
                {c.distanceKm != null && <div className="ak-row-why">{c.distanceKm < 1 ? `${Math.round(c.distanceKm * 1000)} m away` : `${c.distanceKm.toFixed(1)} km away`}</div>}
              </div>
              <div className="ak-bar-track"><div className={`ak-bar-fill${c.kind === "unexplained" ? " neg" : ""}`} style={{ width: `${(100 * c.score) / max}%` }} /></div>
            </div>
          ))}
          {truth && <p className="ak-panel-foot">Real cause (simulator): <b>{truth}</b></p>}
        </section>
      </div>
    </div>
  );
}
