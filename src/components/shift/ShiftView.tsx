"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Users, Package, Zap, CalendarPlus, Search, X, CheckCircle2, CircleHelp, CircleDot, LoaderCircle, Bot, UserRound, Cpu, Map as MapIcon } from "lucide-react";
import { STORE } from "@/lib/types";
import type { SpikeCard } from "@/lib/shift/spikes";
import type { Stock } from "@/lib/shift/inventory";

const MiniMap = dynamic(() => import("./MiniMap"), { ssr: false, loading: () => <div className="mini-map" /> });

type Level = "green" | "yellow" | "red";
export type ShiftData = {
  updated: string; demoClock: string | null;
  status: { key: string; label: string; level: Level; text: string }[];
  alarms: { kind: "spike" | "staff" | "stock"; text: string; href?: string }[];
  inventory: Stock[]; pace: number; cards: SpikeCard[];
  current: { label: string; soFar: number; projected: number; p50: number; p90: number; open: boolean } | null;
};
type Venue = { key: string; name: string; lat: number; lon: number; km: number };
const hh = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
const ICON = { spike: Zap, staff: Users, stock: Package };

function LogEvent({ venues, onClose }: { venues: Venue[]; onClose: () => void }) {
  const here = { key: "store", name: "Outside the store", lat: STORE.lat, lon: STORE.lon, km: 0 };
  const places = [here, ...venues.filter((v) => v.km <= 3)];
  const [title, setTitle] = useState(""); const [place, setPlace] = useState("store");
  const [people, setPeople] = useState(50); const [startsIn, setStartsIn] = useState(0); const [lasts, setLasts] = useState(2);
  const [msg, setMsg] = useState<string | null>(null); const router = useRouter();
  return (
    <div className="sh-modal" role="dialog" aria-modal="true">
      <div className="sh-modal-box">
        <div className="sh-modal-head"><h2>Log an event</h2><button className="sh-icon-btn" onClick={onClose} aria-label="Close"><X /></button></div>
        <label className="wi-field"><span className="wi-label">What is happening</span><input className="sh-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="School trip of 40, bus broke down outside…" /></label>
        <div className="wi-field"><span className="wi-label">Where</span><div className="wi-chips">{places.map((p) => <button key={p.key} className="wi-chip" aria-pressed={place === p.key} onClick={() => setPlace(p.key)}>{p.name}</button>)}</div></div>
        <div className="wi-sliders">
          <label className="wi-field"><span className="wi-label">About <b>{people}</b> people</span><input className="wi-range" type="range" min={5} max={5000} step={5} value={people} onChange={(e) => setPeople(+e.target.value)} /></label>
          <label className="wi-field"><span className="wi-label">Starts <b>{startsIn === 0 ? "now" : `in ${startsIn} h`}</b></span><input className="wi-range" type="range" min={0} max={12} step={1} value={startsIn} onChange={(e) => setStartsIn(+e.target.value)} /></label>
          <label className="wi-field"><span className="wi-label">Lasts <b>{lasts} h</b></span><input className="wi-range" type="range" min={1} max={8} step={1} value={lasts} onChange={(e) => setLasts(+e.target.value)} /></label>
        </div>
        {msg && <p className="ak-note">{msg}</p>}
        <button className="sh-btn sh-btn--primary" disabled={!title.trim()} onClick={async () => {
          const p = places.find((x) => x.key === place)!;
          const r = await fetch("/api/employee-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, venue: p.name, lat: p.lat, lon: p.lon, people, startsInH: startsIn, lastsH: lasts }) });
          if (r.ok) { onClose(); router.refresh(); } else setMsg((await r.json()).error ?? "Could not save");
        }}><CalendarPlus />Save event</button>
        <p className="ak-note">Saved as employee-reported. The forecast and the What if page use it from now on.</p>
      </div>
    </div>
  );
}

function Card({ c }: { c: SpikeCard }) {
  const [text, setText] = useState(""); const [sending, setSending] = useState(false); const router = useRouter();
  const r = c.research[0];
  const V = r?.verdict === "confirmed" ? CheckCircle2 : r?.verdict === "partly confirmed" ? CircleDot : CircleHelp;
  return (
    <section className="ak-panel sh-card">
      <div className="sh-card-head"><Zap /><div><h3>{c.manual ? "Explain" : "Spike"}: {c.label}</h3>
        <p>{Math.round(c.actual)} orders against a likely {Math.round(c.p50)} (top {Math.round(c.p90)}){c.manual ? ", opened by hand" : ""}.</p></div></div>
      <div className="sh-answers">
        <div className="sh-answer"><div className="sh-answer-label"><Cpu />Model answer</div>
          <p><b>{Math.round(c.model.explainedShare * 100)}%</b> of the jump above a normal hour is explained by what the model sees.</p>
          <ul>{c.model.drivers.length ? c.model.drivers.slice(0, 4).map((d) => <li key={d.group}>{d.group} {d.value > 0 ? "+" : "−"}{Math.abs(d.value).toFixed(0)}</li>) : <li>Nothing special in the model inputs.</li>}</ul></div>
        <div className="sh-answer"><div className="sh-answer-label"><Bot />Researched answer {c.researching && <LoaderCircle className="spin" />}</div>
          {r ? (<>
            <p>{r.guess}</p>
            <p className="sh-tags"><span className={`ak-pill ${r.confidence === "high" ? "ak-pill--pos" : r.confidence === "medium" ? "ak-pill--warn" : ""}`}>Confidence {r.confidence}</span>
              {r.verdict && <span className={`ak-pill ${r.verdict === "confirmed" ? "ak-pill--pos" : r.verdict === "partly confirmed" ? "ak-pill--warn" : "ak-pill--neg"}`}><V style={{ width: 12, height: 12 }} /> {r.verdict}</span>}</p>
            {r.sources.length > 0 && <p className="sh-src">{r.sources.slice(0, 3).map((s, i) => <a key={i} className="ak-link" href={s.url} target="_blank" rel="noreferrer">{(s.title ?? new URL(s.url).hostname).slice(0, 40)}</a>)}</p>}
            {r.error && <p className="ak-note">{r.error.slice(0, 120)}</p>}
          </>) : <p className="faint">{c.researching ? "Searching the web…" : "Not researched yet."}</p>}</div>
        <div className="sh-answer"><div className="sh-answer-label"><UserRound />Employee answer</div>
          {c.notes.map((n, i) => <p key={i}>&ldquo;{n.text}&rdquo; <span className="faint">{hh(n.at)}</span></p>)}
          <textarea className="sh-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened? e.g. school trip of 40" />
          <button className="sh-btn" disabled={!text.trim() || sending} onClick={async () => {
            setSending(true); await fetch(`/api/spikes/${encodeURIComponent(c.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
            setText(""); setSending(false); router.refresh();
          }}>Send and check it</button></div>
      </div>
    </section>
  );
}

export default function ShiftView({ data, venues }: { data: ShiftData; venues: Venue[] }) {
  const router = useRouter();
  const [logOpen, setLogOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const researching = data.cards.some((c) => c.researching);
  useEffect(() => { const t = setInterval(() => router.refresh(), researching ? 8_000 : 30_000); return () => clearInterval(t); }, [router, researching]);
  const c = data.current;
  return (
    <>
      {data.demoClock && <div className="ak-error" style={{ marginBottom: 12 }}>Demo clock is on: the screen acts as if it is {data.demoClock}. <button className="ak-btn" style={{ marginLeft: 8 }} onClick={async () => { await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset: true }) }); router.refresh(); }}>Back to real time</button></div>}
      <div className="sh-status">
        {data.status.map((s) => <div key={s.key} className="sh-stat"><span className={`sh-dot sh-dot--${s.level}`} /><div><b>{s.label}</b><span>{s.text}</span></div></div>)}
      </div>

      {data.alarms.length > 0 && (
        <section className="sh-alarms">
          {data.alarms.map((a, i) => { const I = ICON[a.kind]; return <div key={i} className="sh-alarm"><I /><span>{a.text}</span>{a.href && <a href={a.href} className="sh-alarm-link">See spike</a>}</div>; })}
        </section>
      )}

      <div className="sh-actions">
        <button className="sh-btn sh-btn--primary" onClick={() => setLogOpen(true)}><CalendarPlus />Log an event</button>
        <button className="sh-btn" disabled={busy === "explain"} onClick={async () => { setBusy("explain"); await fetch("/api/spikes", { method: "POST" }); setBusy(null); router.refresh(); location.hash = "spikes"; }}>
          {busy === "explain" ? <LoaderCircle className="spin" /> : <Search />}Explain this spike</button>
        <button className="sh-btn sh-btn--ghost" disabled={busy === "rush"} title="Demo: make this hour of the simulated sales stream a rush" onClick={async () => { setBusy("rush"); await fetch("/api/sales", { method: "POST" }); setBusy(null); router.refresh(); }}>
          <Zap />Simulate a rush (demo)</button>
        <span className="faint sh-updated">Updated {data.updated}</span>
      </div>

      <div className="sh-grid">
        <section className="ak-panel sh-now">
          <h2 className="sh-h"><AlertTriangle style={{ visibility: "hidden", width: 0 }} />This hour {c ? `(${c.label})` : ""}</h2>
          {c && c.open ? (<>
            <div className="sh-big">{c.soFar}<small> orders so far</small></div>
            <p>On pace for <b>{c.projected}</b>. Likely {Math.round(c.p50)}, top {Math.round(c.p90)}.</p>
            <div className="sh-meter"><div style={{ width: `${Math.min(100, (c.projected / Math.max(1, c.p90 * 1.3)) * 100)}%` }} className={c.projected > c.p90 ? "red" : c.projected > c.p50 * 1.1 ? "yellow" : "green"} /><i style={{ left: `${(c.p90 / (c.p90 * 1.3)) * 100}%` }} /></div>
          </>) : <p className="sh-big" style={{ fontSize: 22 }}>Closed now</p>}
        </section>
        <section className="ak-panel">
          <h2 className="sh-h"><Package />Stock</h2>
          {data.inventory.map((s) => (
            <div key={s.key} className="sh-stock">
              <div className="sh-stock-top"><b>{s.label}</b><span>{s.left} {s.unit}{s.hoursLeft != null ? ` · about ${s.hoursLeft >= 10 ? Math.round(s.hoursLeft) : s.hoursLeft.toFixed(1)} h left at this pace` : ""}</span></div>
              <div className="sh-bar"><div className={s.level} style={{ width: `${Math.max(2, s.share * 100)}%` }} /></div>
            </div>
          ))}
          <p className="ak-note" style={{ padding: "0 16px 12px" }}>Assumed opening stock and per-order use (1.15 patties, 0.85 fries, 1.1 buns, 0.9 drinks). Not BK data.</p>
        </section>
        <section className="ak-panel">
          <h2 className="sh-h"><MapIcon />Around the store <Link href="/map" className="ak-link" style={{ marginLeft: "auto", fontSize: 14 }}>Full map</Link></h2>
          <MiniMap />
        </section>
      </div>

      <h2 className="sh-h" id="spikes" style={{ marginTop: 24, padding: 0 }}><Zap />Spikes</h2>
      {data.cards.length ? data.cards.slice(0, 6).map((k) => <Card key={k.id} c={k} />) : <div className="ak-empty">No spikes today. A card opens by itself when an hour goes above the forecast top.</div>}

      {logOpen && <LogEvent venues={venues} onClose={() => setLogOpen(false)} />}
    </>
  );
}
