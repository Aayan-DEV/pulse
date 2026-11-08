// Events today and the next 7 days: scraped listings cached in src/data/events-upcoming.json
// (built by scripts/data/scrape-upcoming.ts) merged with dated events from events-history.json.
import type { CityEvent } from "../types";
import { readDataFile } from "./files";

export function windowBounds(days = 7) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return { from: start.getTime(), to: start.getTime() + (days + 1) * 86400_000 };
}

export async function getUpcomingEvents(): Promise<CityEvent[]> {
  const { from, to } = windowBounds();
  const upcoming = readDataFile<CityEvent[]>("events-upcoming.json", []);
  const history = readDataFile<CityEvent[]>("events-history.json", []);
  const calendar = readDataFile<CityEvent[]>("events-calendar.json", []);
  const seen = new Set<string>();
  const out: CityEvent[] = [];
  for (const e of [...upcoming, ...history, ...calendar]) {
    const s = new Date(e.start).getTime();
    const en = new Date(e.end).getTime();
    if (en < from || s > to || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
