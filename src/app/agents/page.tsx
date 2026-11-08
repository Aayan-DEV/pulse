import { Bot, CalendarSearch, Camera, Users, AlertTriangle, CheckCircle2, ArrowDownCircle } from "lucide-react";
import PageHead from "@/components/PageHead";
import AgentRunButton from "@/components/AgentRunButton";
import { loadRuns, type AgentRun } from "@/lib/agents/store";
import { isRunning } from "@/lib/agents/run";
import { geminiConfig } from "@/lib/agents/gemini";
import type { FoundEvent } from "@/lib/agents/eventScout";
import type { CameraReading } from "@/lib/agents/cameraWatcher";
import type { OverseerFlag } from "@/lib/agents/staffingOverseer";

export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Oslo", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Head({ name, title, icon: Icon, what, runs }: { name: string; title: string; icon: typeof Bot; what: string; runs: AgentRun[] }) {
  const last = runs[0];
  return (
    <div className="ak-panel-head">
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Icon style={{ width: 22, height: 22, marginTop: 2 }} />
        <div><h2 className="ak-h">{title}</h2><p className="ak-note">{what}</p>
          <p className="ak-note">{last ? <>Last run {when(last.at)} · {(last.ms / 1000).toFixed(0)} s · {last.ok ? "ok" : <span className="is-bad">failed: {last.error}</span>}</> : "Not run yet."}</p></div>
      </div>
      <AgentRunButton name={name} running={isRunning(name as never)} />
    </div>
  );
}

export default function AgentsPage() {
  const scout = loadRuns<{ found: FoundEvent[]; rejected: { title: string; why: string }[]; returned: number }>("event-scout");
  const cams = loadRuns<{ readings: CameraReading[]; summary: string; imagesRead: number }>("camera-watcher");
  const boss = loadRuns<{ summary: string; flags: OverseerFlag[] }>("staffing-overseer");
  const cfg = geminiConfig();
  const s = scout.find((r) => r.ok)?.result, c = cams.find((r) => r.ok)?.result, b = boss.find((r) => r.ok)?.result;
  return (
    <main className="adm-content">
      <PageHead crumb="Signals / Agents" title="Agents" icon={Bot}
        finding={<>Three Gemini agents ({cfg.model ?? "model not set"}, Vertex AI {cfg.location}). Each run makes <b>one model call</b>, has a timeout, and a second click while it runs is refused. Results are saved with a timestamp.</>} />

      <section className="ak-panel">
        <Head name="event-scout" title="Event scout" icon={CalendarSearch} runs={scout}
          what="Searches the web (Google Search grounding) for events in the next 14 days. Every event keeps its source link and is deduped against the library." />
        {s ? (<>
          {s.found.length === 0 && <div className="ak-empty">No new events this run ({s.returned} returned, all already known or rejected).</div>}
          {s.found.length > 0 && <table className="ak-table"><thead><tr><th>Event</th><th>When</th><th className="num">Distance</th><th>Status</th><th>Source</th></tr></thead><tbody>
            {s.found.map((e) => <tr key={e.id}><td style={{ whiteSpace: "normal" }}>{e.title}<span className="sub">{e.venue}</span></td><td className="num">{when(e.start)}</td><td className="num">{e.distanceKm} km</td>
              <td><span className="ak-pill ak-pill--warn">{e.agentStatus}</span></td><td><a className="ak-link" href={e.sources[0].url} target="_blank" rel="noreferrer">Open</a></td></tr>)}
          </tbody></table>}
          {s.rejected.length > 0 && <p className="ak-panel-foot">Left out: {s.rejected.slice(0, 12).map((r) => `${r.title} (${r.why})`).join("; ")}.</p>}
        </>) : <div className="ak-empty">Press Run now.</div>}
      </section>

      <section className="ak-panel" style={{ marginTop: 16 }}>
        <Head name="camera-watcher" title="Camera watcher" icon={Camera} runs={cams}
          what="Gemini vision reads the Statens vegvesen road cameras. These are road cameras 1.6 to 9.8 km away, not the store's street: they show road and weather conditions in the area, not the queue." />
        {c ? (<>
          <p className="ak-panel-foot" style={{ borderTop: 0 }}>{c.summary}</p>
          <table className="ak-table"><thead><tr><th>Camera</th><th className="num">Distance</th><th>Traffic</th><th>Road</th><th>Rain or snow</th><th>Visibility</th><th>Incidents</th></tr></thead><tbody>
            {c.readings.map((r) => <tr key={r.id}><td style={{ whiteSpace: "normal" }}>{r.name ?? r.id}<span className="sub">{r.note}</span></td><td className="num">{r.distanceM ? `${(r.distanceM / 1000).toFixed(1)} km` : ""}</td>
              <td>{r.trafficLevel}</td><td>{r.roadSurface}</td><td>{r.precipitation}</td><td>{r.visibility}</td><td>{r.incidents.length ? <span className="is-bad">{r.incidents.join(", ")}</span> : <span className="faint">none</span>}</td></tr>)}
          </tbody></table>
        </>) : <div className="ak-empty">Press Run now.</div>}
      </section>

      <section className="ak-panel" style={{ marginTop: 16 }}>
        <Head name="staffing-overseer" title="Staffing overseer" icon={Users} runs={boss}
          what="Checks the next 6 hours of forecast, weather, transit notices and agent-found events against the planned crew. Advisory only: it never changes the roster." />
        {b ? (<>
          <p className="ak-panel-foot" style={{ borderTop: 0 }}>{b.summary}</p>
          {b.flags.map((f, i) => (
            <div key={i} className="ak-row" style={{ gridTemplateColumns: "28px 64px minmax(0,1fr)" }}>
              {f.status === "UNDER" ? <AlertTriangle className="is-bad" style={{ width: 18, height: 18 }} /> : f.status === "OVER" ? <ArrowDownCircle style={{ width: 18, height: 18, color: "var(--od-warn)" }} /> : <CheckCircle2 style={{ width: 18, height: 18, color: "var(--od-pos)" }} />}
              <div className="num" style={{ fontSize: 15 }}>{f.time}</div>
              <div><div className="ak-row-title">{f.status === "UNDER" ? "Short of crew" : f.status === "OVER" ? "More crew than needed" : "Fine"}: {f.reason}</div><div className="ak-row-why">Suggested: {f.suggestedChange}</div></div>
            </div>
          ))}
        </>) : <div className="ak-empty">Press Run now.</div>}
      </section>
    </main>
  );
}
