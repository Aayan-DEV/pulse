// Spike cards: opened automatically when an hour's (simulated live) orders go above P90.
// Three answers: the model's drivers, a researched answer (Gemini + Google Search), and employee notes.
import "server-only";
import { readExtra, writeExtra } from "@/lib/agents/store";
import { generate, parseJson } from "@/lib/agents/gemini";
import { isForced, type SalesHour } from "./sales";

export type Research = { at: string; guess: string; confidence: "high" | "medium" | "low"; verdict?: "confirmed" | "partly confirmed" | "unverified" | null; hint?: string; sources: { title?: string; url: string }[]; error?: string };
export type SpikeCard = {
  id: string; time: string; label: string; openedAt: string; manual?: boolean;
  actual: number; p50: number; p90: number; baseline: number;
  model: { drivers: { group: string; value: number }[]; explainedShare: number };
  research: Research[]; researching?: boolean;
  notes: { text: string; at: string }[];
};

const hh = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
const dl = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const loadCards = () => readExtra<SpikeCard[]>("spike-cards", []);
const save = (c: SpikeCard[]) => writeExtra("spike-cards", c.slice(0, 50));
const g = globalThis as unknown as { __pulseResearch?: Set<string> };
const busy = (g.__pulseResearch ??= new Set());

function cardFor(h: SalesHour, manual = false): SpikeCard {
  const actual = h.actual ?? h.projected ?? 0;
  const baseline = h.drivers.find((d) => d.group === "Baseline/time")?.value ?? 0;
  const drivers = h.drivers.filter((d) => d.group !== "Baseline/time" && Math.abs(d.value) >= 0.5).sort((a, b) => b.value - a.value);
  return {
    id: h.time, time: h.time, label: `${hh(h.time)}, ${dl(h.time)}`, openedAt: new Date().toISOString(), manual,
    actual, p50: h.p50, p90: h.p90, baseline,
    model: { drivers, explainedShare: Math.max(0, Math.min(1, (h.p50 - baseline) / Math.max(1, actual - baseline))) },
    research: [], notes: [],
  };
}

/** Open cards for completed hours above P90, and the current hour once 15 min in and on pace above P90. */
export function detectSpikes(hours: SalesHour[], now: number): SpikeCard[] {
  const cards = loadCards(); const known = new Set(cards.map((c) => c.id)); const fresh: SpikeCard[] = [];
  for (const h of hours) {
    if (!h.open || known.has(h.time)) continue;
    const over = h.done ? (h.actual ?? 0) > h.p90 : h.current && (now - Date.parse(h.time) >= 15 * 60_000 || isForced(h.time)) && (h.projected ?? 0) > h.p90;
    if (over) fresh.push(cardFor(h));
  }
  if (fresh.length) { save([...fresh, ...cards]); fresh.forEach((c) => void research(c.id)); }
  return [...fresh, ...cards];
}
export function openManual(h: SalesHour) {
  const cards = loadCards(); const ex = cards.find((c) => c.id === h.time);
  if (ex) return ex;
  const c = cardFor(h, true); save([c, ...cards]); void research(c.id); return c;
}
export function addNote(id: string, text: string) {
  const cards = loadCards(); const c = cards.find((x) => x.id === id); if (!c) return null;
  c.notes.unshift({ text: text.slice(0, 400), at: new Date().toISOString() }); save(cards); void research(id, text); return c;
}

/** One Gemini call with Google Search grounding. With an employee hint it verifies the hint. Never stacks per card. */
export async function research(id: string, hint?: string) {
  if (busy.has(id)) return; busy.add(id);
  const mark = (fn: (c: SpikeCard) => void) => { const cs = loadCards(); const c = cs.find((x) => x.id === id); if (c) { fn(c); save(cs); } return c; };
  const c = mark((x) => { x.researching = true }); if (!c) { busy.delete(id); return; }
  const prompt = `On ${c.label} (Oslo time), a fast-food restaurant at Klingenberggata 5, Oslo (next to Nationaltheatret station, Karl Johans gate, Aker Brygge) had about ${Math.round(c.actual)} orders in the hour starting at ${hh(c.time)}; the forecast expected ${Math.round(c.p50)} and at most ${Math.round(c.p90)}.
The forecast already knew about: ${c.model.drivers.map((d) => `${d.group} ${d.value > 0 ? "+" : ""}${d.value.toFixed(0)}`).join(", ") || "nothing special"}.
${hint ? `An employee says: "${hint}". Verify this with web sources (news, venue programmes, Ruter or Entur notices, social posts) and find what else might explain it.` : "Search the web for what nearby could explain the extra customers: events, crowds, school trips, transport disruptions, weather, news."}
Return ONLY JSON: {"guess": one or two sentences, "confidence": "high"|"medium"|"low", ${hint ? `"verdict": "confirmed"|"partly confirmed"|"unverified",` : ""} "sources": [{"title": string, "url": exact page URL}]}. Never invent a URL; if nothing is found, say so with low confidence and an empty list.`;
  let r: Research;
  try {
    const out = await generate({ parts: [{ text: prompt }], search: true, timeoutMs: 90_000 });
    const j = parseJson<Omit<Research, "at">>(out.text);
    const src = (j.sources ?? []).filter((s) => /^https?:\/\//.test(s.url));
    const sources = src.length ? src : out.sources.slice(0, 5).map((s) => ({ title: s.title, url: s.uri }));
    r = { at: new Date().toISOString(), guess: j.guess, confidence: sources.length ? j.confidence : "low", verdict: hint ? (sources.length ? j.verdict ?? "unverified" : "unverified") : null, hint, sources };
  } catch (e) {
    r = { at: new Date().toISOString(), guess: "Research failed.", confidence: "low", hint, sources: [], error: e instanceof Error ? e.message : String(e) };
  }
  mark((x) => { x.research.unshift(r); x.researching = false; });
  busy.delete(id);
}
