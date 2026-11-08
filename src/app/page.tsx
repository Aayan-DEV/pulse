import { Clock3 } from "lucide-react";
import PageHead from "@/components/PageHead";
import ShiftView, { type ShiftData } from "@/components/shift/ShiftView";
import { liveSales } from "@/lib/shift/sales";
import { detectSpikes } from "@/lib/shift/spikes";
import { inventory } from "@/lib/shift/inventory";
import { employeeEvents } from "@/lib/shift/employeeEvents";
import { getTransit, getWeather, getUpcomingEvents } from "@/lib/live";
import { staffRequirements } from "@/lib/staffing/requirements";
import { buildSchedule } from "@/lib/staffing/schedule";
import { syntheticRoster } from "@/lib/staffing/rules";
import { haversineKm } from "@/lib/model/features";
import { STORE } from "@/lib/types";
import { VENUES } from "@/lib/whatif";

export const dynamic = "force-dynamic";
const hh = (iso: string | number) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });

export default async function ShiftPage() {
  const { hours, now } = await liveSales();
  const cards = detectSpikes(hours, now);
  const inv = inventory(hours);

  // Busyness: orders so far today vs the forecast up to now.
  const sold = hours.reduce((s, h) => s + (h.actual ?? h.soFar ?? 0), 0);
  const expect = hours.reduce((s, h) => s + (h.done ? h.p50 : h.current ? h.p50 * ((now - Date.parse(h.time)) / 3600_000) : 0), 0);
  const cur = hours.find((h) => h.current);
  const ratio = expect > 0 ? sold / expect : 1;
  const curOver = cur && cur.open && (cur.projected ?? 0) > cur.p90;

  // Staff: plan from the forecast vs need at the pace we see now (next 2 hours).
  const roster = syntheticRoster();
  const plan = buildSchedule(staffRequirements(hours), roster);
  const live = hours.map((h) => (h.current && h.projected != null ? { ...h, p50: Math.max(h.p50, h.projected) } : h));
  const need = staffRequirements(live);
  const short = need.filter((r) => { const t = Date.parse(r.time); return t + 3600_000 > now && t < now + 2 * 3600_000 && r.phase === "open"; })
    .map((r) => { const c = plan.coverage.find((x) => x.time === r.time); return { time: hh(r.time), need: r.front + r.kitchen, have: c?.crewAssigned ?? 0 }; })
    .filter((x) => x.have < x.need);

  // Live signals.
  let trains = { level: "green" as "green" | "yellow" | "red", text: "Trains and trams running normally" };
  try {
    const t = await getTransit();
    const near = t.departures.filter((d) => Date.parse(d.time) < now + 3600_000);
    const late = near.filter((d) => d.delayMin > 5).length, canc = near.filter((d) => d.cancelled).length;
    const share = near.length ? (late + canc) / near.length : 0;
    trains = share >= 0.15 || canc >= 3 ? { level: "red", text: `${late} late and ${canc} cancelled in the next hour` }
      : share > 0.05 || t.situations.length ? { level: "yellow", text: t.situations[0]?.summary ?? `${late} departures late` }
      : { level: "green", text: `${near.length} departures next hour, on time` };
  } catch { trains = { level: "yellow", text: "Train feed unavailable" }; }
  let weather = { level: "green" as "green" | "yellow" | "red", text: "Weather unknown" };
  try {
    const w = (await getWeather()).now;
    if (w) weather = { level: w.precipMm >= 2 || w.tempC <= -10 || w.windMs >= 15 ? "red" : w.precipMm >= 0.2 || w.tempC < 0 || w.windMs > 8 ? "yellow" : "green",
      text: `${Math.round(w.tempC)}°C, ${w.precipMm} mm, wind ${Math.round(w.windMs)} m/s` };
  } catch { /* keep unknown */ }
  let evList: { title: string; start: string; end: string; lat: number; lon: number; expectedAttendance?: number; employee?: boolean }[] = [];
  try { evList = await getUpcomingEvents(); } catch { /* none */ }
  const emp = employeeEvents();
  const soon = [...emp.map((e) => ({ ...e, employee: true })), ...evList]
    .filter((e) => Date.parse(e.end) > now && Date.parse(e.start) < now + 4 * 3600_000 && haversineKm(STORE.lat, STORE.lon, e.lat, e.lon) <= 1.5)
    .sort((a, b) => a.start.localeCompare(b.start));
  const nowEv = soon.filter((e) => Date.parse(e.start) <= now);
  const events = { level: (nowEv.some((e) => (e.expectedAttendance ?? 0) >= 5000) ? "red" : soon.length ? "yellow" : "green") as "green" | "yellow" | "red",
    text: soon.length ? soon.slice(0, 2).map((e) => `${e.title.slice(0, 40)} (${Date.parse(e.start) <= now ? "now" : hh(e.start)})`).join(" · ") : "No events nearby in the next 4 hours" };
  const busy = { level: (curOver || ratio > 1.2 ? "red" : ratio > 1.05 ? "yellow" : "green") as "green" | "yellow" | "red",
    text: expect > 0 ? `${Math.round(sold)} orders so far, ${ratio >= 1 ? "+" : "−"}${Math.abs(Math.round((ratio - 1) * 100))}% vs forecast` : "Not open yet" };

  const alarms: ShiftData["alarms"] = [];
  const liveSpike = cards.find((c) => cur && c.id === cur.time) ?? (curOver && cur ? undefined : undefined);
  if (curOver && cur) alarms.push({ kind: "spike", text: `Rush now: on pace for ${cur.projected} orders this hour, the forecast top was ${Math.round(cur.p90)}.`, href: liveSpike ? "#spikes" : undefined });
  for (const s of short) alarms.push({ kind: "staff", text: `${s.time}: ${s.need} crew needed at this pace, ${s.have} planned. Call someone in or move a break.` });
  for (const it of inv.items.filter((i) => i.level === "red")) alarms.push({ kind: "stock", text: `${it.label} running low: ${it.left} ${it.unit} left${it.hoursLeft != null ? `, about ${it.hoursLeft.toFixed(1)} h at this pace` : ""}.` });

  const data: ShiftData = {
    updated: hh(now), status: [{ key: "trains", label: "Trains and trams", ...trains }, { key: "weather", label: "Weather", ...weather }, { key: "events", label: "Events now and next", ...events }, { key: "busy", label: "Busyness", ...busy }],
    alarms, inventory: inv.items, pace: inv.pacePerHour, cards,
    current: cur ? { label: hh(cur.time), soFar: cur.soFar ?? 0, projected: cur.projected ?? 0, p50: cur.p50, p90: cur.p90, open: cur.open } : null,
  };
  return (
    <main className="adm-content shift">
      <PageHead crumb="Shift" title="Shift" icon={Clock3} finding={<>What you need right now. Sales here are a <b>simulated live stream</b> (no till connected yet); stock levels use assumed per-order ratios.</>} />
      <ShiftView data={data} venues={VENUES} />
    </main>
  );
}
