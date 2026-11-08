import "server-only";
// "What is happening today": one computation shared by the employee Shift screen and the employer Overview.
import { liveSales, demoOffset, type SalesHour } from "./sales";
import { detectSpikes, type SpikeCard } from "./spikes";
import { inventory, type Stock } from "./inventory";
import { employeeEvents } from "./employeeEvents";
import { trainsNow, type Level } from "./trains";
import { getTransit, getWeather, getUpcomingEvents } from "../live";
import { staffRequirements } from "../staffing/requirements";
import { buildSchedule } from "../staffing/schedule";
import { syntheticRoster } from "../staffing/rules";
import { haversineKm } from "../model/features";
import { STORE } from "../types";

export const hh = (iso: string | number) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });

export type Status = { key: string; label: string; level: Level; text: string };
export type Alarm = { kind: "spike" | "staff" | "stock"; text: string; href?: string };

export type Today = {
  now: number;
  demoClock: string | null;
  hours: SalesHour[];
  cur: SalesHour | undefined;
  sold: number;            // orders so far today
  expected: number;        // forecast orders up to now
  ratio: number;           // sold / expected
  dayP50: number; dayP10: number; dayP90: number; // whole business day
  cards: SpikeCard[];
  stock: { items: Stock[]; pacePerHour: number };
  status: Status[];
  alarms: Alarm[];
  crewGaps: { time: string; need: number; have: number }[];
};

export async function today(): Promise<Today> {
  const { hours, now } = await liveSales();
  const cards = detectSpikes(hours, now);
  const inv = inventory(hours);

  // Busyness: orders so far vs the forecast up to now.
  const sold = hours.reduce((s, h) => s + (h.actual ?? h.soFar ?? 0), 0);
  const expected = hours.reduce((s, h) => s + (h.done ? h.p50 : h.current ? h.p50 * ((now - Date.parse(h.time)) / 3600_000) : 0), 0);
  const cur = hours.find((h) => h.current);
  const ratio = expected > 0 ? sold / expected : 1;
  const curOver = !!cur && cur.open && (cur.projected ?? 0) > cur.p90;
  const open = hours.filter((h) => h.open);

  // Crew: the plan from the forecast vs the need at the pace we see now, next 2 hours.
  const roster = syntheticRoster();
  const plan = buildSchedule(staffRequirements(hours), roster);
  const live = hours.map((h) => (h.current && h.projected != null ? { ...h, p50: Math.max(h.p50, h.projected) } : h));
  const crewGaps = staffRequirements(live)
    .filter((r) => { const t = Date.parse(r.time); return t + 3600_000 > now && t < now + 2 * 3600_000 && r.phase === "open"; })
    .map((r) => ({ time: hh(r.time), need: r.front + r.kitchen, have: plan.coverage.find((x) => x.time === r.time)?.crewAssigned ?? 0 }))
    .filter((x) => x.have < x.need);

  // Live signals, each one dot.
  let trains: Omit<Status, "key" | "label"> = { level: "green", text: "Trains and trams running normally" };
  try { const t = await getTransit(); const tn = trainsNow(t.departures, t.situations, Date.now()); trains = { level: tn.level, text: tn.headline }; }
  catch { trains = { level: "yellow", text: "Train feed unavailable" }; }

  let weather: Omit<Status, "key" | "label"> = { level: "green", text: "Weather unknown" };
  try {
    const w = (await getWeather()).now;
    if (w) weather = { level: w.precipMm >= 2 || w.tempC <= -10 || w.windMs >= 15 ? "red" : w.precipMm >= 0.2 || w.tempC < 0 || w.windMs > 8 ? "yellow" : "green",
      text: `${Math.round(w.tempC)}°C, ${w.precipMm} mm, wind ${Math.round(w.windMs)} m/s` };
  } catch { /* keep unknown */ }

  type Ev = { title: string; start: string; end: string; lat: number; lon: number; expectedAttendance?: number };
  let evList: Ev[] = [];
  try { evList = await getUpcomingEvents(); } catch { /* none */ }
  const soon = [...employeeEvents(), ...evList]
    .filter((e) => Date.parse(e.end) > now && Date.parse(e.start) < now + 4 * 3600_000 && haversineKm(STORE.lat, STORE.lon, e.lat, e.lon) <= 1.5)
    .sort((a, b) => a.start.localeCompare(b.start));
  const nowEv = soon.filter((e) => Date.parse(e.start) <= now);
  const events: Omit<Status, "key" | "label"> = {
    level: nowEv.some((e) => (e.expectedAttendance ?? 0) >= 5000) ? "red" : soon.length ? "yellow" : "green",
    text: soon.length ? soon.slice(0, 2).map((e) => `${e.title.slice(0, 40)} (${Date.parse(e.start) <= now ? "now" : hh(e.start)})`).join(" · ") : "No events nearby in the next 4 hours",
  };
  const busy: Omit<Status, "key" | "label"> = {
    level: curOver || ratio > 1.2 ? "red" : ratio > 1.05 ? "yellow" : "green",
    text: expected > 0 ? `${Math.round(sold)} orders so far, ${ratio >= 1 ? "+" : "−"}${Math.abs(Math.round((ratio - 1) * 100))}% vs forecast` : "Not open yet",
  };

  const alarms: Alarm[] = [];
  if (curOver && cur) alarms.push({ kind: "spike", text: `Rush now: on pace for ${cur.projected} orders this hour, the forecast top was ${Math.round(cur.p90)}.`, href: cards.some((c) => c.id === cur.time) ? "#spikes" : undefined });
  for (const s of crewGaps) alarms.push({ kind: "staff", text: `${s.time}: ${s.need} crew needed at this pace, ${s.have} planned. Call someone in or move a break.` });
  for (const it of inv.items.filter((i) => i.level === "red")) alarms.push({ kind: "stock", text: `${it.label} running low: ${it.left} ${it.unit} left${it.hoursLeft != null ? `, about ${it.hoursLeft.toFixed(1)} h at this pace` : ""}.` });

  return {
    now, demoClock: demoOffset() ? hh(now) : null, hours, cur, sold, expected, ratio,
    dayP50: open.reduce((s, h) => s + h.p50, 0), dayP10: open.reduce((s, h) => s + h.p10, 0), dayP90: open.reduce((s, h) => s + h.p90, 0),
    cards, stock: { items: inv.items, pacePerHour: inv.pacePerHour },
    status: [
      { key: "trains", label: "Trains and trams", ...trains }, { key: "weather", label: "Weather", ...weather },
      { key: "events", label: "Events now and next", ...events }, { key: "busy", label: "Busyness", ...busy },
    ],
    alarms, crewGaps,
  };
}
