import Link from "next/link";
import { Users } from "lucide-react";
import PageHead from "@/components/PageHead";
import { getForecast } from "@/lib/forecast";
import { staffRequirements, type Quantile, type FrontMethod, DEFAULT_STAFFING } from "@/lib/staffing/requirements";
import { buildSchedule } from "@/lib/staffing/schedule";
import { syntheticRoster } from "@/lib/staffing/rules";
import StaffingCharts from "@/components/StaffingCharts";

export const dynamic = "force-dynamic";

// The week's ILP takes several seconds; inputs change hourly, so cache per hour and setting.
type Hit = { req: ReturnType<typeof staffRequirements>; sched: ReturnType<typeof buildSchedule> };
const g = globalThis as unknown as { __pulseStaffCache?: Map<string, Hit> };
const cache = (g.__pulseStaffCache ??= new Map<string, Hit>());

const fmtDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const clock = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;

export default async function StaffingPage({ searchParams }: { searchParams: Promise<{ q?: string; m?: string; day?: string }> }) {
  const sp = await searchParams;
  const quantile: Quantile = sp.q === "p90" ? "p90" : "p50";
  const method: FrontMethod = sp.m === "squareRoot" ? "squareRoot" : "erlangC";
  let fc;
  try { fc = await getForecast(7); } catch (e) {
    return (
      <main className="adm-content">
        <PageHead crumb="People / Staffing" title="Staffing" icon={Users} />
        <div className="ak-error">The forecast is not ready: {e instanceof Error ? e.message : "unknown error"}.</div>
      </main>
    );
  }
  const roster = syntheticRoster();
  const key = `${quantile}|${method}|${fc.hours[0]?.time}|${new Date().toISOString().slice(0, 13)}`;
  let hit = cache.get(key);
  if (!hit) {
    const req0 = staffRequirements(fc.hours, { quantile, frontMethod: method });
    hit = { req: req0, sched: buildSchedule(req0, roster) };
    if (cache.size > 8) cache.clear();
    cache.set(key, hit);
  }
  const { req, sched } = hit;
  const dates = [...new Set(req.map((r) => r.businessDate))].sort();
  const day = sp.day && dates.includes(sp.day) ? sp.day : dates[0];
  const dayReq = req.filter((r) => r.businessDate === day);
  const dayCov = sched.coverage.filter((c) => c.businessDate === day);
  const dayShifts = sched.shifts.filter((s) => s.businessDate === day).sort((a, b) => a.start - b.start || b.length - a.length);
  const peak = req.filter((r) => r.phase === "open").sort((a, b) => b.transactions - a.transactions)[0];
  const minH = Math.min(...dayShifts.map((s) => s.start), ...dayReq.map((r) => r.hour));
  const maxH = Math.max(...dayShifts.map((s) => s.start + s.length), ...dayReq.map((r) => r.hour + 1));
  const span = Math.max(1, maxH - minH);
  const eff = sched.cost.requiredPersonHours / Math.max(1, sched.cost.plannedPaidHours);
  const q = (k: string, v: string) => {
    const p = new URLSearchParams({ q: quantile, m: method, day: day ?? "" }); p.set(k, v); return `/staffing?${p}`;
  };

  return (
    <main className="adm-content">
      <PageHead crumb="People / Staffing" title="Staffing" icon={Users}
        finding={<>The next 7 days need <b>{Math.round(sched.cost.plannedPaidHours)} paid hours</b> in {sched.cost.shiftCount} shifts for {roster.length} people.
          {sched.violations.length === 0 ? <> Every shift follows the Working Environment Act.</> : <> <b className="is-bad">{sched.violations.length} rule problems</b> are listed below.</>}
          {sched.cost.unfilledShifts > 0 && <> {sched.cost.unfilledShifts} shifts have nobody legal to fill them.</>}</>}
        tools={<Link className="ak-btn" href="/method">How it is calculated</Link>} />

      <div className="ak-bar">
        <span className="ak-bar-label">Staff to</span>
        <div className="ak-seg">
          <Link href={q("q", "p50")}><button aria-pressed={quantile === "p50"}>Likely day (P50)</button></Link>
          <Link href={q("q", "p90")}><button aria-pressed={quantile === "p90"}>Busy day (P90)</button></Link>
        </div>
        <span className="ak-bar-label" style={{ marginLeft: 8 }}>Counter method</span>
        <div className="ak-seg">
          <Link href={q("m", "erlangC")}><button aria-pressed={method === "erlangC"}>Erlang C</button></Link>
          <Link href={q("m", "squareRoot")}><button aria-pressed={method === "squareRoot"}>Square-root rule</button></Link>
        </div>
      </div>

      <section className="ak-panel">
        <div className="ak-kpis">
          <div className="ak-kpi"><div className="ak-kpi-label">Paid hours, 7 days</div><div className="ak-kpi-value">{Math.round(sched.cost.plannedPaidHours)}</div><div className="ak-kpi-sub">Least possible from the shift plan</div></div>
          <div className="ak-kpi"><div className="ak-kpi-label">Hours actually needed</div><div className="ak-kpi-value">{Math.round(sched.cost.requiredPersonHours)}</div><div className="ak-kpi-sub">Sum of hourly needs, the lower bound</div></div>
          <div className="ak-kpi"><div className="ak-kpi-label">Fit</div><div className="ak-kpi-value">{(eff * 100).toFixed(0)}%</div><div className="ak-kpi-sub">Needed ÷ paid. Shifts can&apos;t be cut by the minute</div></div>
          <div className="ak-kpi"><div className="ak-kpi-label">Shifts</div><div className="ak-kpi-value">{sched.cost.shiftCount}</div><div className="ak-kpi-sub">{sched.cost.unfilledShifts ? <span className="is-bad">{sched.cost.unfilledShifts} not filled</span> : "All filled by name"}</div></div>
          <div className="ak-kpi"><div className="ak-kpi-label">Rule problems</div><div className={`ak-kpi-value${sched.violations.length ? " is-bad" : ""}`}>{sched.violations.length}</div><div className="ak-kpi-sub">Rest, breaks, youth limits</div></div>
        </div>
      </section>

      {peak && (
        <section className="ak-panel" style={{ marginTop: 16 }}>
          <div className="ak-panel-head"><div><h2 className="ak-h">Worked example: the busiest hour of the week</h2><p className="ak-note">{fmtDay(peak.businessDate)} {clock(peak.hour)}. Every step with its number, so it can be checked by hand.</p></div></div>
          <div className="ak-panel-body ak-prose" style={{ maxWidth: "none" }}>
            <ol>
              <li>Forecast ({quantile.toUpperCase()}): <b>{Math.round(peak.transactions)} orders</b> in the hour.</li>
              <li>Counter share = 1 − kiosk {DEFAULT_STAFFING.kioskShare} − delivery {DEFAULT_STAFFING.deliveryShare} = {(1 - DEFAULT_STAFFING.kioskShare - DEFAULT_STAFFING.deliveryShare).toFixed(2)}, so λ (arrivals at the counter) = <b>{peak.counterArrivals.toFixed(1)} per hour</b>.</li>
              <li>Traffic A = λ × AHT (average handling time) ÷ 3600 = {peak.counterArrivals.toFixed(1)} × {DEFAULT_STAFFING.counterAhtSec} ÷ 3600 = <b>{peak.load.toFixed(2)} Erlangs</b> (the average number of cashiers busy at once).</li>
              <li>Cashiers c = <b>{peak.front}</b>, the smallest number where {(DEFAULT_STAFFING.targetSL * 100).toFixed(0)}% of customers start ordering within {DEFAULT_STAFFING.targetWaitSec} s and occupancy stays at or under {(DEFAULT_STAFFING.maxOccupancy * 100).toFixed(0)}%.</li>
              <li>Erlang C P(wait) = <b>{(peak.pWait * 100).toFixed(1)}%</b>; service level = 1 − P(wait) × e^(−(c − A) × t ÷ AHT) = <b>{(peak.serviceLevel * 100).toFixed(1)}%</b>; average wait {peak.asaSec.toFixed(1)} s; occupancy A ÷ c = {(peak.occupancy * 100).toFixed(0)}%.</li>
              <li>Kitchen = ceil(orders ÷ {DEFAULT_STAFFING.kitchenTxPerWorkerHour} per worker-hour) = ceil({Math.round(peak.transactions)} ÷ {DEFAULT_STAFFING.kitchenTxPerWorkerHour}) = <b>{peak.kitchen}</b> (min {DEFAULT_STAFFING.minKitchen}).</li>
              <li>Total on the floor = {peak.front} front + {peak.kitchen} kitchen + {peak.manager} manager = <b>{peak.total + (peak.total === peak.front + peak.kitchen ? peak.manager : 0)}</b>.</li>
            </ol>
            <p className="muted">Assumptions (kiosk share, handling time, kitchen rate) are labelled as such in the method notes. The shift plan is a set-covering integer program (Dantzig 1954), solved per day.</p>
          </div>
        </section>
      )}

      <div className="ak-bar" style={{ marginTop: 16 }}>
        <span className="ak-bar-label">Day</span>
        <div className="ak-seg" style={{ flexWrap: "wrap", height: "auto" }}>
          {dates.map((d) => <Link key={d} href={q("day", d)}><button aria-pressed={d === day}>{fmtDay(d)}</button></Link>)}
        </div>
      </div>

      <StaffingCharts rows={dayReq.map((r) => {
        const c = dayCov.find((x) => x.hour === r.hour);
        return { label: clock(r.hour), orders: Math.round(r.transactions), front: r.front, kitchen: r.kitchen, required: (c?.crewRequired ?? r.front + r.kitchen), planned: c?.crewAssigned ?? 0 };
      })} />

      <section className="ak-panel" style={{ marginTop: 16 }}>
        <div className="ak-panel-head"><div><h2 className="ak-h">Shifts on {day ? fmtDay(day) : ""}</h2><p className="ak-note">{dayShifts.length} shifts. The dark notch is the 30 minute break.</p></div></div>
        <div style={{ padding: "8px 20px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 70px", gap: 8, fontSize: 12, color: "var(--od-faint)", marginBottom: 6 }}>
            <span>Person</span>
            <span style={{ display: "flex", justifyContent: "space-between" }}>{Array.from({ length: span + 1 }, (_, i) => i % 2 === 0 ? <span key={i}>{clock(minH + i)}</span> : null)}</span>
            <span style={{ textAlign: "right" }}>Paid</span>
          </div>
          {dayShifts.map((s) => (
            <div key={s.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr 70px", gap: 8, alignItems: "center", height: 26 }}>
              <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className={s.employeeName ? "" : "is-bad"}>
                {s.employeeName ?? "Not filled"}{s.role === "manager" && <span className="faint"> · mgr</span>}
              </span>
              <span style={{ position: "relative", height: 14, background: "var(--od-track)", borderRadius: 3 }}>
                <span style={{ position: "absolute", top: 0, bottom: 0, left: `${(100 * (s.start - minH)) / span}%`, width: `${(100 * s.length) / span}%`, background: s.role === "manager" ? "var(--od-ink)" : "var(--od-data)", borderRadius: 3 }} />
                {s.breakHour != null && <span style={{ position: "absolute", top: 0, bottom: 0, left: `${(100 * (s.breakHour - minH)) / span}%`, width: `${50 / span}%`, background: "var(--od-on-ink)", opacity: 0.8 }} />}
              </span>
              <span className="num" style={{ textAlign: "right", fontSize: 13 }}>{s.paidHours.toFixed(1)} h</span>
            </div>
          ))}
        </div>
      </section>

      <section className="ak-panel" style={{ marginTop: 16 }}>
        <div className="ak-panel-head"><div><h2 className="ak-h">Rule checks</h2><p className="ak-note">Checked for every person over the whole week</p></div></div>
        {sched.violations.length === 0 ? <div className="ak-empty">No problems: 11 hours daily rest, 35 hours weekly rest, the 9 hour day, breaks after 5.5 hours and the youth limits all hold.</div> :
          sched.violations.slice(0, 30).map((v, i) => (
            <div className="ak-row" key={i}><div><div className="ak-row-title is-bad">{(v as { message?: string }).message ?? JSON.stringify(v)}</div></div></div>
          ))}
      </section>

      <section className="ak-panel" style={{ marginTop: 16 }}>
        <div className="ak-panel-head"><div><h2 className="ak-h">Hours per person</h2><p className="ak-note">Synthetic roster of 45, sized from brreg. The mix of full-time, part-time and under-18 staff is an assumption.</p></div></div>
        <div className="ak-table-wrap" style={{ maxHeight: 420, overflowY: "auto" }}>
          <table className="ak-table">
            <thead><tr><th>Person</th><th>Group</th><th className="num">Contract</th><th className="num">Shifts</th><th className="num">Paid hours</th></tr></thead>
            <tbody>
              {sched.hoursByEmployee.map((h) => (
                <tr key={h.employeeId}><td>{h.name}</td><td><span className="ak-pill">{h.ageGroup}</span></td><td className="num">{h.contractHours} h</td><td className="num">{h.shifts}</td>
                  <td className="num">{h.paidHours.toFixed(1)} h</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
