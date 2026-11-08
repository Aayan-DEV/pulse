// Scrapes upcoming event listings near the store with the context.dev scrape API and writes
// src/data/events-upcoming.json (CityEvent[]). The live route merges this file with events-history.json.
// Parsed sources: Oslo Spektrum, Oslo Konserthus program, Nobel Peace Center events.
// Usage: npx tsx scripts/data/scrape-upcoming.ts      (needs CONTEXT_DEV_API_KEY in .env.local)
import fs from "node:fs";
import path from "node:path";
import type { CityEvent } from "../../src/lib/types";

const root = path.resolve(__dirname, "..", "..");
try { process.loadEnvFile(path.join(root, ".env.local")); } catch {}
const KEY = process.env.CONTEXT_DEV_API_KEY;
if (!KEY) throw new Error("CONTEXT_DEV_API_KEY missing");

async function scrape(url: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://api.context.dev/v1/web/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: { markdown: true } }),
    });
    const json = (await res.json()) as { markdown?: { data?: string }; error_code?: string };
    if (json.error_code === "RATE_LIMITED") { await new Promise((r) => setTimeout(r, 1500)); continue; }
    if (!json.markdown?.data) throw new Error(`scrape failed ${url}: ${json.error_code ?? res.status}`);
    return json.markdown.data;
  }
  throw new Error(`rate limited ${url}`);
}

const MONTHS_NO: Record<string, number> = { januar: 1, februar: 2, mars: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, desember: 12, jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, des: 12 };
const MONTHS_EN: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

// Oslo offset for a local date (CET +01:00 from the last Sunday of October to the last Sunday of March).
function osloIso(y: number, m: number, d: number, hh: number, mm = 0): string {
  const lastSun = (mon: number) => { const x = new Date(Date.UTC(y, mon, 0)); return x.getUTCDate() - x.getUTCDay(); };
  const summer = (m > 3 && m < 10) || (m === 3 && d >= lastSun(3)) || (m === 10 && d < lastSun(10));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(m)}-${p(d)}T${p(hh)}:${p(mm)}:00${summer ? "+02:00" : "+01:00"}`;
}
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);

const SPEKTRUM = { lat: 59.91299, lon: 10.75472 };
const KONSERTHUS = { lat: 59.913091, lon: 10.729785 };
const NOBEL = { lat: 59.911612, lon: 10.7304 };

function parseSpektrum(md: string, url: string): CityEvent[] {
  // e.g. [Konsert\\ \\ **Synne Vo**\\ \\ Fredag 13. og lørdag 14. november 2026](https://oslospektrum.no/arrangementer/synne-vo/ ...)
  const out: CityEvent[] = [];
  const re = /\[(?:[^\]]*?\\\\ \\\\ )?([A-Za-zÆØÅæøå ]+)\\\\ \\\\ \*\*([^*]+)\*\*\\\\ \\\\ ([^\]]+)\]\((https:\/\/oslospektrum\.no\/arrangementer\/[^ )]+)/g;
  for (const m of md.matchAll(re)) {
    const [, kind, title, when, link] = m;
    const year = Number(when.match(/(20\d\d)/)?.[1]);
    const month = MONTHS_NO[(when.match(/(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)/)?.[1]) ?? ""];
    if (!year || !month) continue;
    const days = [...when.matchAll(/(\d{1,2})\./g)].map((x) => Number(x[1]));
    const span = /til/.test(when) && days.length === 2 ? Array.from({ length: days[1] - days[0] + 1 }, (_, i) => days[0] + i) : days;
    for (const d of span) {
      out.push({
        id: `spektrum-${year}-${month}-${d}-${slug(title)}`,
        title: `${title.trim()} (${kind.trim().toLowerCase()}), Oslo Spektrum`,
        category: /håndball|fotball/i.test(kind) ? "sports" : "concert",
        venue: "Oslo Spektrum", ...SPEKTRUM,
        start: osloIso(year, month, d, 19), end: osloIso(year, month, d, 23),
        sources: [{ label: `Oslo Spektrum: ${title.trim()}`, url: link }, { label: "Oslo Spektrum programme", url }],
        ...({ note: `Listed date: ${when.trim()}. Time not on the listing; 19:00-23:00 assumed.` } as object),
      } as CityEvent);
    }
  }
  return out;
}

function parseKonserthus(md: string, url: string, today: Date): CityEvent[] {
  // e.g. 13nov. [Ylvis & Calle\\ \\ et juleshow](https://oslokonserthus.no/program/ylvis-calle)Store sal
  const out: CityEvent[] = [];
  const seen = new Set<string>();
  const re = /^(\d{1,2})([a-zæøå]{3})\. \[([^\]]+)\]\((https:\/\/oslokonserthus\.no\/program\/[^)]+)\)(.*)$/gm;
  for (const m of md.matchAll(re)) {
    const [, d, mon, rawTitle, link, hall] = m;
    const month = MONTHS_NO[mon];
    if (!month) continue;
    let year = today.getFullYear();
    if (month < today.getMonth() + 1 - 1) year += 1; // listing rolls into next year
    const title = rawTitle.split("\\\\")[0].trim();
    const id = `konserthus-${year}-${month}-${d}-${slug(title)}`;
    if (seen.has(id)) continue; // two shows the same day: one event
    seen.add(id);
    out.push({
      id, title: `${title}, Oslo Konserthus${hall.trim() ? ` (${hall.trim()})` : ""}`,
      category: "concert", venue: "Oslo Konserthus", ...KONSERTHUS,
      start: osloIso(year, month, Number(d), 19), end: osloIso(year, month, Number(d), 22),
      sources: [{ label: `Oslo Konserthus: ${title}`, url: link }, { label: "Oslo Konserthus program", url }],
      ...({ note: "Time not on the listing; 19:00-22:00 assumed." } as object),
    } as CityEvent);
  }
  return out;
}

function parseNobel(md: string, url: string): CityEvent[] {
  // e.g. [**Event**\\ \\ **The press under pressure**\\ \\ **18 Nov 2026 12:00-13:00**](https://www.nobelpeacecenter.org/en/events/...)
  const out: CityEvent[] = [];
  const seen = new Set<string>();
  const re = /\[\*\*(Event|Tour)\*\*\\\\ \\\\ \*\*([^*]+)\*\*\\\\ \\\\ \*\*(\d{1,2}) ([A-Z][a-z]{2}) (20\d\d) (\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})\*\*\]\(([^)]+)\)/g;
  for (const m of md.matchAll(re)) {
    const [, kind, title, d, mon, y, h1, m1, h2, m2, link] = m;
    const id = `nobel-center-${y}-${MONTHS_EN[mon]}-${d}-${slug(title)}`;
    if (seen.has(id) || !MONTHS_EN[mon]) continue;
    seen.add(id);
    const big = /torchlight|peace prize celebration/i.test(title);
    out.push({
      id, title: `${title.trim()} (Nobel Peace Center ${kind.toLowerCase()})`,
      category: big ? "ceremony" : "other", venue: "Nobel Peace Center", ...NOBEL,
      start: osloIso(Number(y), MONTHS_EN[mon], Number(d), Number(h1), Number(m1)),
      end: osloIso(Number(y), MONTHS_EN[mon], Number(d), Number(h2), Number(m2)),
      sources: [{ label: `Nobel Peace Center: ${title.trim()}`, url: link }, { label: "Nobel Peace Center events", url }],
    });
  }
  return out;
}

(async () => {
  const today = new Date();
  const jobs: [string, (md: string, url: string) => CityEvent[]][] = [
    ["https://www.oslospektrum.no/", parseSpektrum],
    ["https://oslokonserthus.no/program", (md, u) => parseKonserthus(md, u, today)],
    ["https://www.nobelpeacecenter.org/en/events", parseNobel],
  ];
  const events: CityEvent[] = [];
  const report: Record<string, number | string> = {};
  for (const [url, parse] of jobs) {
    try {
      const md = await scrape(url);
      const evs = parse(md, url);
      events.push(...evs);
      report[url] = evs.length;
    } catch (e) {
      report[url] = (e as Error).message;
    }
  }
  const startOfToday = new Date(today); startOfToday.setHours(0, 0, 0, 0);
  const upcoming = events
    .filter((e) => new Date(e.end) >= startOfToday)
    .sort((a, b) => a.start.localeCompare(b.start));
  fs.writeFileSync(path.join(root, "src", "data", "events-upcoming.json"), JSON.stringify(upcoming, null, 1));
  console.log(JSON.stringify({ written: upcoming.length, report }, null, 1));
})();
