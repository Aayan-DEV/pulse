// Event scout: Gemini + Google Search grounding finds events near the store in the next 14 days.
// Every kept event has a source URL, is deduped against the library and is marked "agent-found, unreviewed".
import "server-only";
import { readData } from "@/lib/data";
import { STORE, type CityEvent, type EventCategory } from "@/lib/types";
import { haversineKm } from "@/lib/model/features";
import { generate, parseJson } from "./gemini";
import { readExtra, writeExtra } from "./store";

export type FoundEvent = CityEvent & { agentStatus: "agent-found, unreviewed"; foundAt: string; distanceKm: number };
type Raw = { title?: string; category?: string; venue?: string; lat?: number; lon?: number; start?: string; end?: string; expectedAttendance?: number | null; sourceUrl?: string };

const CATS: EventCategory[] = ["concert", "sports", "festival", "market", "ceremony", "protest", "celebrity", "cinema", "conference", "cruise", "school", "transit", "holiday", "other"];
const words = (s: string) => new Set(s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9æøå ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
const STOP = new Set(["the", "and", "med", "live", "tour", "world", "konsert", "concert", "oslo", "2026", "2027", "festival"]);
function similar(a: string, b: string) {
  const A = words(a), B = words(b); if (!A.size || !B.size) return false;
  let n = 0; A.forEach((w) => { if (B.has(w)) n++; });
  if (n / Math.min(A.size, B.size) >= 0.6) return true;
  // Same headliner: the first meaningful word of the found title appears in the library title.
  const head = [...A].find((w) => !STOP.has(w));
  return !!head && head.length >= 4 && B.has(head);
}
/** The library event runs on that local day (multi-day items such as the Christmas market count every day). */
const onDay = (x: { start: string; end: string }, day: string) => x.start.slice(0, 10) <= day && x.end.slice(0, 10) >= day;

export async function runEventScout() {
  const now = new Date(); const until = new Date(now.getTime() + 14 * 86400_000);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const prompt = `Find public events in Oslo, Norway between ${d(now)} and ${d(until)} that could bring extra customers to a fast-food restaurant at Klingenberggata 5 (next to Nationaltheatret station, lat ${STORE.lat}, lon ${STORE.lon}).
Look for concerts, sports, festivals, markets, demonstrations, ceremonies, conferences, film premieres, celebrity visits and planned public transport closures within about 3 km, plus big crowds at Ullevaal, Holmenkollen, Unity Arena (Fornebu), Bislett and Ekeberg.
Return ONLY a JSON array (no prose). Each item: {"title": string, "category": one of ${CATS.join("|")}, "venue": string, "lat": number, "lon": number, "start": ISO 8601 with +01:00 offset, "end": ISO 8601 with offset, "expectedAttendance": number or null, "sourceUrl": the exact web page that lists this event}.
Only include events you found on a real web page. Never invent a URL. Up to 25 items.`;
  const r = await generate({ parts: [{ text: prompt }], search: true, timeoutMs: 120_000 });
  let raw: Raw[] = [];
  try { raw = parseJson<Raw[]>(r.text); } catch { raw = []; }

  const library = [...readData<CityEvent[]>("events-upcoming.json", []), ...readData<CityEvent[]>("events-history.json", []), ...readData<CityEvent[]>("events-calendar.json", [])];
  const prev = readExtra<FoundEvent[]>("events-found", []);
  const rejected: { title: string; why: string }[] = [];
  const fresh: FoundEvent[] = [];
  for (const e of raw) {
    const title = (e.title ?? "").trim();
    const why = !title ? "no title"
      : !e.sourceUrl || !/^https?:\/\//.test(e.sourceUrl) ? "no source URL"
      : !e.start || isNaN(Date.parse(e.start)) ? "no valid start"
      : Date.parse(e.start) > until.getTime() || Date.parse(e.end ?? e.start) < now.getTime() - 86400_000 ? "outside the 14-day window"
      : typeof e.lat !== "number" || typeof e.lon !== "number" ? "no coordinates" : null;
    if (why) { rejected.push({ title: title || "(untitled)", why }); continue; }
    const day = e.start!.slice(0, 10);
    const dup = [...library, ...prev, ...fresh].some((x) => onDay(x, day) && similar(title, x.title));
    if (dup) { rejected.push({ title, why: "already in the library" }); continue; }
    const start = e.start!; const end = e.end && !isNaN(Date.parse(e.end)) ? e.end : new Date(Date.parse(start) + 3 * 3600_000).toISOString();
    fresh.push({
      id: `agent-${day}-${[...words(title)].slice(0, 4).join("-")}`, title, category: (CATS.includes(e.category as EventCategory) ? e.category : "other") as EventCategory,
      venue: e.venue, lat: e.lat!, lon: e.lon!, start, end,
      ...(e.expectedAttendance ? { expectedAttendance: e.expectedAttendance, attendanceIsEstimate: true } : {}),
      sources: [{ label: "Found by the event scout (Gemini + Google Search)", url: e.sourceUrl! }],
      agentStatus: "agent-found, unreviewed", foundAt: now.toISOString(),
      distanceKm: Math.round(haversineKm(STORE.lat, STORE.lon, e.lat!, e.lon!) * 100) / 100,
    });
  }
  writeExtra("events-found", [...fresh, ...prev].filter((x) => Date.parse(x.end) > now.getTime() - 86400_000));
  return { result: { found: fresh, rejected, returned: raw.length, groundingSources: r.sources.length }, model: r.model };
}
