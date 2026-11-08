"use client";

import { useMemo, useState } from "react";
import type { CityEvent } from "@/lib/types";

type Row = CityEvent & { distanceM: number };
const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Oslo", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function EventsTable({ events }: { events: Row[] }) {
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [when, setWhen] = useState<"all" | "upcoming" | "past">("all");
  const cats = useMemo(() => ["all", ...Array.from(new Set(events.map((e) => e.category))).sort()], [events]);
  const now = new Date().toISOString();
  const rows = events.filter((e) =>
    (cat === "all" || e.category === cat) &&
    (when === "all" || (when === "upcoming" ? e.end >= now : e.end < now)) &&
    (!q || `${e.title} ${e.venue ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <section className="ak-panel" style={{ marginTop: 16 }}>
      <div className="ak-panel-head" style={{ flexWrap: "wrap" }}>
        <div><h2 className="ak-h">Event library</h2><p className="ak-note">{rows.length} shown. Distance is in a straight line from the store.</p></div>
        <div className="ak-bar" style={{ margin: 0 }}>
          <div className="ak-seg">
            {(["all", "upcoming", "past"] as const).map((w) => (
              <button key={w} aria-pressed={when === w} onClick={() => setWhen(w)}>{w[0].toUpperCase() + w.slice(1)}</button>
            ))}
          </div>
          <select className="ak-input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            {cats.map((c) => <option key={c} value={c}>{c === "all" ? "All kinds" : c}</option>)}
          </select>
          <input className="ak-input" placeholder="Find an event" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="ak-table-wrap" style={{ maxHeight: 640, overflowY: "auto" }}>
        <table className="ak-table">
          <thead><tr><th>Event</th><th>Kind</th><th>When</th><th className="num">Distance</th><th className="num">People</th><th>Source</th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: "normal", minWidth: 260 }}>{e.title}<span className="sub">{e.venue}{e.recurring ? ` · ${e.recurring}` : ""}</span></td>
                <td><span className={`ak-pill ${e.category === "transit" || e.category === "protest" ? "ak-pill--neg" : e.category === "celebrity" ? "ak-pill--data" : ""}`}>{e.category}</span></td>
                <td className="num">{fmt(e.start)}</td>
                <td className="num">{e.distanceM < 1000 ? `${e.distanceM} m` : `${(e.distanceM / 1000).toFixed(1)} km`}</td>
                <td className="num">{e.expectedAttendance ? `${e.attendanceIsEstimate ? "~" : ""}${e.expectedAttendance.toLocaleString("en")}` : <span className="faint">n/a</span>}</td>
                <td>{e.sources.slice(0, 2).map((s, i) => <a key={i} className="ak-link" href={s.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{s.label.slice(0, 28)}</a>)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6}><div className="ak-empty">No events match.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
