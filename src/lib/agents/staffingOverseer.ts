// Staffing overseer: next 6 hours of forecast + live signals vs the planned roster. Advisory only: it never edits the roster.
import "server-only";
import { getForecast } from "@/lib/forecast";
import { staffRequirements } from "@/lib/staffing/requirements";
import { buildSchedule } from "@/lib/staffing/schedule";
import { syntheticRoster } from "@/lib/staffing/rules";
import { getTransit } from "@/lib/live";
import { generate, parseJson } from "./gemini";
import { readExtra } from "./store";
import type { FoundEvent } from "./eventScout";

export type OverseerFlag = { time: string; status: "UNDER" | "OVER" | "OK"; reason: string; suggestedChange: string };

const SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    flags: { type: "ARRAY", items: { type: "OBJECT", properties: {
      time: { type: "STRING" }, status: { type: "STRING", enum: ["UNDER", "OVER", "OK"] },
      reason: { type: "STRING" }, suggestedChange: { type: "STRING" },
    }, required: ["time", "status", "reason", "suggestedChange"] } },
  },
  required: ["summary", "flags"],
};
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });

export async function runStaffingOverseer() {
  const fc = await getForecast(2);
  const roster = syntheticRoster();
  const req50 = staffRequirements(fc.hours, { quantile: "p50" });
  const req90 = staffRequirements(fc.hours, { quantile: "p90" });
  const plan = buildSchedule(req50, roster);
  const now = Date.now();
  const next = fc.hours.filter((h) => Date.parse(h.time) + 3600_000 > now).slice(0, 6);
  const rows = next.map((h) => {
    const cov = plan.coverage.find((c) => c.time === h.time);
    const r90 = req90.find((r) => r.time === h.time);
    return {
      time: hhmm(h.time), open: h.open, ordersLikely: Math.round(h.p50), ordersHigh: Math.round(h.p90),
      crewPlanned: cov?.crewAssigned ?? 0, crewNeededLikely: cov?.crewRequired ?? 0, crewNeededHigh: r90 ? r90.front + r90.kitchen : null,
      managers: cov?.managerAssigned ?? 0,
      weather: h.weather ? `${h.weather.tempC.toFixed(0)}°C, ${h.weather.precipMm} mm, wind ${h.weather.windMs} m/s` : "n/a",
      topDrivers: h.drivers.filter((d) => d.group !== "Baseline/time" && Math.abs(d.value) >= 1).map((d) => `${d.group} ${d.value > 0 ? "+" : ""}${d.value.toFixed(0)}`),
    };
  });
  let transit: string[] = [];
  try { transit = (await getTransit()).situations.map((s) => `${s.severity ?? ""}: ${s.summary}`).slice(0, 8); } catch { transit = ["transit feed unavailable"]; }
  const found = readExtra<FoundEvent[]>("events-found", []).filter((e) => Date.parse(e.start) < now + 8 * 3600_000 && Date.parse(e.end) > now)
    .map((e) => `${e.title} (${e.distanceKm} km, ${hhmm(e.start)}, agent-found, unreviewed)`);
  const prompt = `You advise the shift manager of a Burger King at Nationaltheatret, Oslo. Compare the next 6 hours of forecast with the planned crew.
crewPlanned = people on the roster that hour; crewNeededLikely = need at the likely (P50) forecast; crewNeededHigh = need at the high (P90) forecast.
Flag UNDER when planned is below the likely need, or below the high need while a live signal (event, disruption, weather) makes the high case likely. Flag OVER when planned exceeds the high need. Otherwise OK.
For each hour give a short reason naming the signal, and one concrete suggested change (call in, extend, start earlier, send home early, move a break). Never say the roster was changed: you only advise.
Hours: ${JSON.stringify(rows)}
Live transit notices: ${JSON.stringify(transit)}
Agent-found events (unreviewed): ${JSON.stringify(found)}`;
  const r = await generate({ parts: [{ text: prompt }], schema: SCHEMA, timeoutMs: 60_000 });
  const j = parseJson<{ summary: string; flags: OverseerFlag[] }>(r.text);
  return { result: { ...j, hours: rows, transit, foundEvents: found, advisoryOnly: true }, model: r.model };
}
