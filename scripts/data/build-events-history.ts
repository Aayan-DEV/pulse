// Builds src/data/events-history.json (CityEvent[]) from:
//   1. RECURRING below: hand-checked recurring and one-off events, each with sources found via context.dev search
//   2. scripts/data/raw/events-crowds.json: concerts, matches, protests, festivals (researched, sourced)
//   3. scripts/data/raw/events-transit.json: reported train/T-bane outages (news sources)
//   4. src/data/transit-episodes.json: disruption episodes measured in Entur SIRI-ET (BigQuery), top N
// Usage: npx tsx scripts/data/build-events-history.ts
import fs from "node:fs";
import path from "node:path";
import type { CityEvent } from "../../src/lib/types";

const root = path.resolve(__dirname, "..", "..");
type Ev = CityEvent & { note?: string };

const KARL_JOHAN = { lat: 59.91343, lon: 10.73861 };
const CITY_HALL = { lat: 59.91178, lon: 10.73399 };
const SPIKERSUPPA = { lat: 59.91390, lon: 10.73700 };
const UNI_PLASS = { lat: 59.91552, lon: 10.73563 };
const NOBEL_CENTER = { lat: 59.91118, lon: 10.73049 };

const RECURRING: Ev[] = [
  // 17 May: children's parade on Karl Johan to the Palace, from about 10:00.
  {
    id: "holiday-2023-05-17-national-day", title: "17 May national day: children's parade on Karl Johan (110 schools, about 30,000 pupils)",
    category: "holiday", venue: "Karl Johans gate / Slottsplassen", ...KARL_JOHAN,
    start: "2023-05-17T09:00:00+02:00", end: "2023-05-17T20:00:00+02:00", expectedAttendance: 30000, attendanceIsEstimate: false,
    recurring: "yearly 17 May",
    note: "Attendance is the number of pupils in the parade per the Royal House; spectators are many more but not counted.",
    sources: [{ label: "Kongehuset: Hurra for 17. mai! (2023, Princess Ingrid Alexandra's graduating year)", url: "https://www.kongehuset.no/nyheter/hurra-for-17-mai" }],
  },
  {
    id: "holiday-2024-05-17-national-day", title: "17 May national day: children's parade on Karl Johan (about 120 schools)",
    category: "holiday", venue: "Karl Johans gate / Slottsplassen", ...KARL_JOHAN,
    start: "2024-05-17T09:00:00+02:00", end: "2024-05-17T20:00:00+02:00", expectedAttendance: 30000, attendanceIsEstimate: true,
    recurring: "yearly 17 May",
    note: "120 schools is sourced; pupil count is estimated from 2023 (110 schools, 30,000).",
    sources: [
      { label: "Kongehuset: Gratulerer med dagen! 17.05.2024", url: "https://www.kongehuset.no/nyheter/gratulerer-med-dagen-17-05-2024" },
      { label: "Avisa Oslo: Rekkefølgen i barnetoget 17. mai 2024", url: "https://www.ao.no/rekkefolgen-er-klar-se-nar-din-skole-skal-ga-i-barnetoget/s/5-128-770535" },
    ],
  },
  {
    id: "holiday-2025-05-17-national-day", title: "17 May national day: children's parade on Karl Johan (109 schools, more than 26,000 children)",
    category: "holiday", venue: "Karl Johans gate / Slottsplassen", ...KARL_JOHAN,
    start: "2025-05-17T09:00:00+02:00", end: "2025-05-17T20:00:00+02:00", expectedAttendance: 26000, attendanceIsEstimate: false,
    recurring: "yearly 17 May",
    note: "Parade reached Slottsplassen at 10:30. Attendance is pupils only.",
    sources: [{ label: "Kongehuset: Gratulerer med dagen! 17.05.2025", url: "https://www.kongehuset.no/nyheter/gratulerer-med-dagen-17-05-2025" }],
  },
  {
    id: "holiday-2026-05-17-national-day", title: "17 May national day: children's parade on Karl Johan",
    category: "holiday", venue: "Karl Johans gate / Slottsplassen", ...KARL_JOHAN,
    start: "2026-05-17T09:00:00+02:00", end: "2026-05-17T20:00:00+02:00", expectedAttendance: 26000, attendanceIsEstimate: true,
    recurring: "yearly 17 May",
    note: "Date is fixed (Constitution Day). Attendance estimated from 2025. The Royal House page announces the parade at Slottsplassen at 10:30.",
    sources: [{ label: "Kongehuset: 17. mai (barnetoget ventet til Slottsplassen 10:30)", url: "https://www.kongehuset.no/nyheter/17-mai" }],
  },
  // Jul i Vinterland Christmas market at Spikersuppa, 150 m from the store.
  {
    id: "market-2023-jul-i-vinterland", title: "Jul i Vinterland Christmas market at Spikersuppa",
    category: "market", venue: "Spikersuppa, Karl Johans gate", ...SPIKERSUPPA,
    start: "2023-11-11T10:00:00+01:00", end: "2023-12-31T18:00:00+01:00", recurring: "yearly mid-November to New Year",
    note: "Open daily (closed 24 Dec): Mon-Thu 12-20, Fri 12-21, Sat 10-21, Sun 10-20.",
    sources: [
      { label: "AllEvents: Jul i Vinterland 2023, 11 Nov to 31 Dec", url: "https://allevents.in/oslo/jul-i-vinterland-2023/10000730277558837" },
      { label: "Norwegian American: Jul i Vinterland starts Nov. 11", url: "https://www.norwegianamerican.com/jul-i-vinterland/" },
    ],
  },
  {
    id: "market-2024-jul-i-vinterland", title: "Jul i Vinterland Christmas market at Spikersuppa",
    category: "market", venue: "Spikersuppa, Karl Johans gate", ...SPIKERSUPPA,
    start: "2024-11-09T10:00:00+01:00", end: "2024-12-31T18:00:00+01:00", recurring: "yearly mid-November to New Year",
    note: "Opening hours as other years; closed 24 Dec.",
    sources: [{ label: "All Things Nordic: Oslo Christmas Market in Spikersuppa, 9 November-31 December (2024)", url: "https://all-things-nordic.com/2024/10/29/oslo-christmas-market-in-spikersuppa/" }],
  },
  {
    id: "market-2025-jul-i-vinterland", title: "Jul i Vinterland Christmas market at Spikersuppa",
    category: "market", venue: "Spikersuppa, Karl Johans gate", ...SPIKERSUPPA,
    start: "2025-11-08T10:00:00+01:00", end: "2025-12-31T18:00:00+01:00", recurring: "yearly mid-November to New Year",
    note: "Opening 8 Nov 2025 is sourced; the closing date is not in the source and assumed 31 Dec like 2023 and 2024.",
    sources: [
      { label: "Voye Global: Jul i Vinterland opens November 8, 2025", url: "https://voyeglobal.com/jul-i-vinterland-oslo-norway-2025/" },
      { label: "Visit Oslo: Jul i Vinterland", url: "https://www.visitoslo.com/event/jul-i-vinterland-christmas-market-in-spikersuppa" },
    ],
  },
  {
    id: "market-2026-jul-i-vinterland", title: "Jul i Vinterland Christmas market at Spikersuppa",
    category: "market", venue: "Spikersuppa, Karl Johans gate", ...SPIKERSUPPA,
    start: "2026-11-07T10:00:00+01:00", end: "2027-01-03T20:00:00+01:00", recurring: "yearly mid-November to New Year",
    note: "Official: 7 Nov 2026 to 3 Jan 2027. Mon-Thu 12-20, Fri 12-21, Sat 10-21, Sun 10-20; 21-22 Dec 11-21; 23 Dec 11-18; 24 Dec closed.",
    sources: [{ label: "Jul i Vinterland: Hva er åpningstidene?", url: "https://www.julivinterland.no/info/hva-er-apningstidene-pa-jul-i-vinterland" }],
  },
  // Nobel Peace Prize: ceremony at City Hall on 10 December, 13:00.
  {
    id: "ceremony-2023-12-10-nobel-peace-prize", title: "Nobel Peace Prize ceremony, Oslo City Hall (Narges Mohammadi, in absentia)",
    category: "ceremony", venue: "Oslo rådhus", ...CITY_HALL,
    start: "2023-12-10T13:00:00+01:00", end: "2023-12-10T14:30:00+01:00", recurring: "yearly 10 December",
    note: "Ceremony hours are the usual 13:00 slot; the source confirms the date and place.",
    sources: [{ label: "nobelpeaceprize.org: 2023 Nobel Peace Prize Award Ceremony", url: "https://www.nobelpeaceprize.org/articles/2023-nobel-peace-prize-award-ceremony" }],
  },
  {
    id: "ceremony-2024-12-10-nobel-peace-prize", title: "Nobel Peace Prize ceremony, Oslo City Hall (Nihon Hidankyo)",
    category: "ceremony", venue: "Oslo rådhus", ...CITY_HALL,
    start: "2024-12-10T13:00:00+01:00", end: "2024-12-10T14:30:00+01:00", recurring: "yearly 10 December",
    sources: [{ label: "NobelPrize.org: The Nobel Peace Prize award ceremony 2024", url: "https://www.nobelprize.org/ceremonies/the-nobel-peace-prize-award-ceremony-2024/" }],
  },
  {
    id: "ceremony-2024-12-10-nobel-torchlight", title: "Nobel Peace Prize torchlight procession from the Nobel Peace Center to Grand Hotel",
    category: "ceremony", venue: "Nobel Peace Center to Grand Hotel, Karl Johan", ...NOBEL_CENTER,
    start: "2024-12-10T17:30:00+01:00", end: "2024-12-10T19:00:00+01:00", recurring: "yearly 10 December",
    note: "Visit Oslo lists 17:30-18:00 start; end time is an estimate for the walk past the store to Grand Hotel.",
    sources: [
      { label: "Visit Oslo: Fakkeltog for Nobels Fredspris", url: "https://www.visitoslo.com/no/event/fakkeltog-for-nobels-fredspris" },
      { label: "Flickr: Fakkeltoget Nobels Fredspris 2024 (taken 10 Dec 2024)", url: "https://www.flickr.com/photos/115813984@N07/54208261937/" },
    ],
  },
  {
    id: "ceremony-2025-12-10-nobel-peace-prize", title: "Nobel Peace Prize ceremony, Oslo City Hall (María Corina Machado)",
    category: "ceremony", venue: "Oslo rådhus", ...CITY_HALL,
    start: "2025-12-10T13:00:00+01:00", end: "2025-12-10T14:30:00+01:00", recurring: "yearly 10 December",
    sources: [
      { label: "nobelpeaceprize.org: The Nobel Peace Prize Ceremony 2025", url: "https://www.nobelpeaceprize.org/articles/the-nobel-peace-prize-ceremony-2025" },
      { label: "NobelPrize.org: Nobel Peace Prize award ceremony 2025", url: "https://www.nobelprize.org/ceremonies/nobel-peace-prize-award-ceremony-2025/" },
    ],
  },
  {
    id: "festival-2025-12-10-peoples-peace-prize-celebration", title: "People's Peace Prize Celebration, outdoor stage on Rådhusplassen",
    category: "festival", venue: "In front of the Nobel Peace Center", ...NOBEL_CENTER,
    start: "2025-12-10T06:30:00+01:00", end: "2025-12-10T12:00:00+01:00",
    sources: [{ label: "Nobel Peace Center: People's Peace Prize Celebration", url: "https://www.nobelpeacecenter.org/en/events/people-s-peace-prize-celebration" }],
  },
  {
    id: "ceremony-2025-12-10-nobel-torchlight", title: "Nobel Peace Prize torchlight procession for María Corina Machado, from the Nobel Peace Center to Grand Hotel",
    category: "ceremony", venue: "Nobel Peace Center to Grand Hotel, Karl Johan", ...NOBEL_CENTER,
    start: "2025-12-10T11:45:00+01:00", end: "2025-12-10T13:00:00+01:00", recurring: "yearly 10 December",
    note: "Times as published by the Nobel Peace Center for 2025; Grand Hotel confirms the laureate's children waved from the balcony.",
    sources: [
      { label: "Nobel Peace Center: Torchlight procession - Nobel Peace Prize 2025", url: "https://www.nobelpeacecenter.org/en/events/torchlight-procession-nobel-peace-prize-2025" },
      { label: "Grand Hotel: Markeringen av Nobels fredspris 2025", url: "https://grand.no/content/markeringen-av-nobels-fredspris-2025" },
    ],
  },
  // Christmas tree lighting, Universitetsplassen, first Sunday of Advent 17:00.
  {
    id: "ceremony-2024-12-01-christmas-tree-lighting", title: "Christmas tree lighting at Universitetsplassen (Karl Johan)",
    category: "ceremony", venue: "Universitetsplassen", ...UNI_PLASS,
    start: "2024-12-01T16:30:00+01:00", end: "2024-12-01T18:00:00+01:00", recurring: "yearly first Sunday of Advent",
    sources: [
      { label: "NRK: Londongranas «storesøster» på plass i Oslo (lights on Sunday 1 December at 17)", url: "https://www.nrk.no/stor-oslo/londongranas-_storesoster_-pa-plass-i-oslo-1.17143006" },
      { label: "ABC Nyheter: Julegrana tent på Universitetsplassen (2 Dec 2024)", url: "https://www.abcnyheter.no/nyheter/norge/2024/12/02/196048000/julegrana-tent-pa-universitetsplassen?nr=1" },
    ],
  },
  // New Year: Oslo kommune light show on Rådhusplassen 2024/25 (first public New Year event since 2019/20).
  {
    id: "holiday-2024-12-31-new-year-light-show", title: "New Year's Eve: Oslo kommune laser and sound show from Rådhusplassen",
    category: "holiday", venue: "Rådhusplassen", lat: 59.91123, lon: 10.73383,
    start: "2024-12-31T23:00:00+01:00", end: "2025-01-01T01:00:00+01:00",
    note: "Kommune told people to watch from where they were rather than gather on Rådhusplassen. Show time around midnight; exact minutes not in sources.",
    sources: [
      { label: "Nettavisen: Oslo dropper fyrverkeri, satser på lyd- og lysshow", url: "https://www.nettavisen.no/lysshow/nyttarsaften/oslo/oslo-dropper-fyrverkeri-pa-nyttarsaften-satser-pa-lyd-og-lysshow/s/5-95-2190703" },
      { label: "Avisa Oslo: lysshow fra Rådhusplassen for nesten to millioner", url: "https://www.ao.no/oslo-kommune-bruker-nesten-to-millioner-kroner-pa-nyttarsmarkering/s/5-128-946492" },
    ],
  },
  // Celebrity: IShowSpeed mobbed in central Oslo.
  {
    id: "celebrity-2024-07-03-ishowspeed-oslo", title: "IShowSpeed live stream in central Oslo: crowd of hundreds traps him in a souvenir shop near Karl Johan",
    category: "celebrity", venue: "Karl Johans gate / Grensen", lat: 59.9137, lon: 10.7425,
    start: "2024-07-03T20:30:00+02:00", end: "2024-07-03T23:00:00+02:00", expectedAttendance: 500, attendanceIsEstimate: true,
    note: "NRK: stream started just after 20:45; ambulance mentioned at 21:38; he was 'trapped' in Grensen. Metro: 'hundreds' of fans. Location is approximate (souvenir shop near Stortinget).",
    sources: [
      { label: "NRK: Youtuber IShowSpeed går live i Norge", url: "https://www.nrk.no/norge/youtuber-ishowspeed-gar-live-i-norge-1.16951589" },
      { label: "Sportskeeda: IShowSpeed in Oslo on July 3, 2024", url: "https://www.sportskeeda.com/us/streamers/news-what-happened-ishowspeed-norway-series-events-leading-controversy-explored" },
      { label: "Metro UK: IShowSpeed mobbed by fans in Norway", url: "https://metro.co.uk/2024/07/04/ishowspeed-mobbed-unhuman-fans-norway-swears-not-return-21158510/" },
    ],
  },
  // Oslo Marathon 2026 (2023-2025 are in events-crowds.json).
  {
    id: "sports-2026-09-12-oslo-marathon", title: "DNB Oslo Maraton, start and finish at Rådhusplassen",
    category: "sports", venue: "Rådhusplassen", lat: 59.91123, lon: 10.73383,
    start: "2026-09-12T08:00:00+02:00", end: "2026-09-12T17:00:00+02:00", expectedAttendance: 20000, attendanceIsEstimate: true,
    recurring: "yearly September",
    note: "Organiser describes about 20,000 participants; race hours estimated.",
    sources: [
      { label: "oslomaraton.no: DNB Oslo Marathon will be held on September 12, 2026", url: "https://oslomaraton.no/en/distanser/" },
      { label: "Racedays: DNB Oslo Marathon 2026, start and finish at Rådhusplassen", url: "https://www.racedays.run/event/oslo-marathon-2026" },
    ],
  },
];

// Measured transit disruption episodes from Entur realtime data.
type Episode = { stop: string; mode: string; start: string; end: string; hours: number; calls: number; cancelled: number; maxMedianDelay: number; meanCancelShare: number; score: number };
const ENTUR_SOURCE = { label: "Entur realtime SIRI-ET (BigQuery ent-data-sharing-ext-prd.realtime_siri_et)", url: "https://docs.data.entur.no/docs/public-data-catalog" };
const NT_RAIL = { lat: 59.91476, lon: 10.73135 };
const NT_METRO = { lat: 59.91459, lon: 10.73237 };
function episodeEvents(): Ev[] {
  const file = path.join(root, "src", "data", "transit-episodes.json");
  if (!fs.existsSync(file)) return [];
  const eps = (JSON.parse(fs.readFileSync(file, "utf8")) as Episode[])
    .filter((e) => e.stop === "NT" && e.hours >= 2)
    .slice(0, 30);
  return eps.map((e) => {
    const what = e.mode === "rail" ? "Train" : "T-bane";
    const pct = Math.round(e.meanCancelShare * 100);
    return {
      id: `transit-entur-${e.start.slice(0, 13).replace(/[^0-9]/g, "")}-nt-${e.mode}`,
      title: `${what} disruption at Nationaltheatret: ${e.cancelled} of ${e.calls} calls cancelled (${pct}%) over ${e.hours} h, worst hourly median delay ${Math.round(e.maxMedianDelay)} min`,
      category: "transit",
      venue: e.mode === "rail" ? "Nationaltheatret stasjon" : "Nationaltheatret T-bane",
      ...(e.mode === "rail" ? NT_RAIL : NT_METRO),
      start: e.start, end: e.end,
      note: "Measured, not reported: hours with more than 20% of calls cancelled or a median delay over 10 min, merged when consecutive. Cause not in the data.",
      sources: [ENTUR_SOURCE],
    };
  });
}

const read = (p: string): Ev[] => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : []);
const all: Ev[] = [
  ...RECURRING,
  ...read(path.join(root, "scripts", "data", "raw", "events-crowds.json")),
  ...read(path.join(root, "scripts", "data", "raw", "events-transit.json")),
  ...episodeEvents(),
];

// Validate and dedupe.
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/;
const seen = new Set<string>();
const out: Ev[] = [];
for (const e of all) {
  if (seen.has(e.id)) { console.warn("duplicate id", e.id); continue; }
  if (!e.sources?.length || e.sources.some((s) => !/^https?:\/\//.test(s.url))) throw new Error(`no source: ${e.id}`);
  if (!iso.test(e.start) || !iso.test(e.end)) throw new Error(`bad time: ${e.id} ${e.start} ${e.end}`);
  if (new Date(e.end) < new Date(e.start)) throw new Error(`end before start: ${e.id}`);
  if (typeof e.lat !== "number" || typeof e.lon !== "number") throw new Error(`no coords: ${e.id}`);
  seen.add(e.id);
  out.push(e);
}
out.sort((a, b) => a.start.localeCompare(b.start));
fs.writeFileSync(path.join(root, "src", "data", "events-history.json"), JSON.stringify(out, null, 1));
const byCat: Record<string, number> = {};
for (const e of out) byCat[e.category] = (byCat[e.category] ?? 0) + 1;
console.log(JSON.stringify({ total: out.length, byCat }));
