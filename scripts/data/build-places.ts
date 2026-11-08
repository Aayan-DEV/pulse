// Builds src/data/places.json (Place[]) from OpenStreetMap via the Overpass API.
// Every place is a real OSM element (coordinates from OSM, ODbL); the category and the
// one-line note on why it matters are ours. Clusters (bars, offices) are centroids of the listed OSM elements.
// Usage: npx tsx scripts/data/build-places.ts
import fs from "node:fs";
import path from "node:path";
import { STORE, type Place, type PlaceCategory } from "../../src/lib/types";
import { haversineM } from "../../src/lib/live/geo";

const root = path.resolve(__dirname, "..", "..");
type T = "node" | "way" | "relation";
type Pick = { ref: [T, number]; cat: PlaceCategory; note: string; name?: string; id?: string; capacity?: number };

const PICKS: Pick[] = [
  // Transit
  { ref: ["node", 5218231660], cat: "transit", name: "Nationaltheatret station (train + T-bane)", note: "Train (Oslo tunnel) and T-bane lines 1-5 under the same Entur stop place NSR:StopPlace:58404; exits face the store." },
  { ref: ["node", 1334861613], cat: "transit", name: "Nationaltheatret tram stop", note: "Trams 11, 12, 13, 17, 18, 19 stop outside the store." },
  { ref: ["node", 1365825662], cat: "transit", name: "Aker brygge tram stop", note: "Tram stop serving the Aker Brygge office and dining cluster." },
  { ref: ["node", 1365825667], cat: "transit", name: "Kontraskjæret tram stop", note: "Tram stop by Rådhusplassen and Akershus fortress." },
  { ref: ["node", 5218231673], cat: "transit", name: "Stortinget T-bane station", note: "Next metro station east; Karl Johan and Stortinget crowds." },
  { ref: ["node", 660921], cat: "transit", name: "Oslo S (Oslo Central Station)", note: "Rail bottleneck: faults at Oslo S or in the Oslo tunnel stop trains at Nationaltheatret." },
  // Landmarks and venues
  { ref: ["way", 4368869], cat: "venue", name: "Nationaltheatret (theatre)", note: "National theatre; evening shows release audiences next to the store." },
  { ref: ["relation", 14166523], cat: "venue", name: "Oslo Konserthus", note: "Concert hall in Vika; evening concerts." },
  { ref: ["node", 34693409], cat: "venue", note: "Theatre on Kristian IVs gate; evening audiences." },
  { ref: ["node", 2452107757], cat: "venue", name: "Oslo Nye Teater (Hovedscenen)", note: "Theatre near Karl Johan; evening audiences." },
  { ref: ["node", 34693408], cat: "venue", note: "Revue theatre on Klingenberggata, next door to the store." },
  { ref: ["way", 10568134], cat: "venue", name: "Oslo Spektrum", note: "Main indoor arena (concerts, Nobel Peace Prize Concert); 1.2 km east." },
  { ref: ["way", 24900009], cat: "landmark", name: "Oslo rådhus (City Hall)", note: "Nobel Peace Prize ceremony on 10 December; tourist magnet." },
  { ref: ["way", 1062404152], cat: "landmark", name: "Rådhusplassen", note: "City Hall square: Oslo Marathon start/finish, New Year events, outdoor concerts." },
  { ref: ["way", 29132806], cat: "landmark", name: "Stortinget (Parliament)", note: "Demonstrations at Eidsvolls plass and the Parliament." },
  { ref: ["relation", 12267199], cat: "landmark", name: "Det kongelige slott (Royal Palace)", note: "17 May children's parade ends here; changing of the guard draws tourists." },
  { ref: ["relation", 12391390], cat: "landmark", name: "Akershus festning", note: "Fortress by the cruise quays; tourist route to the centre." },
  // Museums
  { ref: ["node", 8046314379], cat: "museum", name: "Nobel Peace Center", note: "Museum on Rådhusplassen; recent torchlight processions start outside it." },
  { ref: ["relation", 13920125], cat: "museum", name: "Nasjonalmuseet (National Museum)", note: "National art museum at Vestbanen; school groups and tourists." },
  { ref: ["way", 31106820], cat: "museum", name: "Historisk museum", note: "University museum by Karl Johan; school visits." },
  { ref: ["way", 90768996], cat: "museum", name: "Ibsenmuseet", note: "Museum by the Palace park." },
  { ref: ["node", 1931359713], cat: "museum", name: "Astrup Fearnley Museet", note: "Art museum at Tjuvholmen past Aker Brygge." },
  // Cinemas
  { ref: ["node", 25416924], cat: "cinema", name: "Klingenberg kino", note: "Odeon/Oslo Kino cinema in the same block; screenings end into the store's evening peak." },
  { ref: ["node", 25416925], cat: "cinema", name: "Saga kino", note: "Large central cinema 100 m north." },
  { ref: ["node", 25416923], cat: "cinema", name: "Vika kino", note: "Cinema in Vika." },
  { ref: ["node", 2555016576], cat: "cinema", name: "Cinemateket", note: "Film institute cinema." },
  // Market
  { ref: ["relation", 11158886], cat: "market", name: "Spikersuppa", note: "Jul i Vinterland Christmas market and ice rink each November to New Year, 250 m away." },
  // Port
  { ref: ["way", 865183365], cat: "port", name: "Revierkaia cruise quay", note: "Cruise berth; passengers walk via Akershus and Rådhusplassen." },
  { ref: ["way", 865170294], cat: "port", name: "Søndre Akershuskai cruise quay", note: "Cruise berth below Akershus fortress, closest to the store." },
  { ref: ["node", 1448786168], cat: "port", name: "Vippetangen (Oslo Vippetangen terminal)", note: "Cruise and ferry berth at the tip of Akershus." },
  { ref: ["way", 24667689], cat: "port", name: "Color Line Terminal (Hjortneskaia)", note: "Kiel ferry terminal west of Aker Brygge." },
  // Hotels
  { ref: ["node", 307505492], cat: "hotel", name: "Grand Hotel", note: "Nobel laureate's hotel; torchlight procession ends here." },
  { ref: ["node", 1884293696], cat: "hotel", name: "Hotel Continental", note: "Hotel across Stortingsgata from Nationaltheatret." },
  { ref: ["node", 392058686], cat: "hotel", name: "Thon Hotel Vika Atrium", note: "Business and conference hotel in Vika." },
  { ref: ["node", 1929813126], cat: "hotel", name: "Hotel Bristol", note: "Hotel by Rosenkrantz gate." },
  { ref: ["node", 441543677], cat: "hotel", name: "Hotel Christiania Teater", note: "Hotel on Stortingsgata." },
  { ref: ["node", 441543679], cat: "hotel", name: "Thon Hotel Cecil", note: "Hotel by Stortinget." },
  { ref: ["node", 1884426647], cat: "hotel", name: "Scandic Victoria", note: "Hotel by Rosenkrantz gate." },
  { ref: ["node", 5015490124], cat: "hotel", name: "Scandic Karl Johan", note: "Hotel on Karl Johan." },
  { ref: ["node", 33730394], cat: "hotel", name: "Radisson Blu Scandinavia Hotel", note: "Large hotel at Holbergs plass." },
  { ref: ["node", 1960919882], cat: "hotel", name: "The Thief", note: "Hotel at Tjuvholmen." },
  { ref: ["way", 88639599], cat: "hotel", name: "Sommerro", note: "Hotel at Solli plass." },
  // Competitors
  { ref: ["node", 1884335181], cat: "competitor", name: "McDonald's Klingenberggata", note: "Direct competitor directly opposite the store." },
  { ref: ["node", 315233909], cat: "competitor", name: "Max Burgers (Egertorget)", note: "Burger competitor on Karl Johan." },
  { ref: ["node", 13040179115], cat: "competitor", name: "McDonald's (Solli)", note: "McDonald's west of the store." },
  { ref: ["node", 10013717804], cat: "competitor", name: "Upper Crust (Nationaltheatret)", note: "Station quick-service food." },
  { ref: ["node", 3441434865], cat: "competitor", name: "Smoothie Xchange", note: "Quick-service, same block." },
  { ref: ["node", 10604787204], cat: "competitor", name: "Banh Mi Xo", note: "Quick-service, same block." },
  { ref: ["node", 3090736997], cat: "competitor", name: "Subway (Karl Johan)", note: "Quick-service near Stortinget." },
  { ref: ["node", 2785549699], cat: "competitor", name: "Digg Burger", note: "Burger competitor in Rosenkrantz gate." },
  { ref: ["node", 5865563902], cat: "competitor", name: "Texburger Universitetsgata", note: "Burger competitor north of Karl Johan." },
  { ref: ["node", 3132099333], cat: "competitor", name: "Burger King (Oslo S)", note: "Same brand at Oslo S; absorbs station traffic." },
  // Schools (nearby; source lists location only, not trip behaviour)
  { ref: ["way", 1062588873], cat: "school", name: "Ruseløkka skole", note: "Primary school 450 m west." },
  { ref: ["node", 7944170092], cat: "school", name: "Vika videregående skole", note: "Upper secondary school in Vika." },
  { ref: ["node", 2824231278], cat: "school", name: "Wang videregående skole", note: "Upper secondary school near the Palace park." },
  { ref: ["node", 5830068507], cat: "school", name: "Otto Treider private gymnas", note: "Upper secondary school by Rådhusplassen." },
  { ref: ["way", 870640504], cat: "school", name: "Oslo Handelsgymnasium", note: "Upper secondary school at Solli." },
  { ref: ["way", 870940069], cat: "school", name: "Oslo katedralskole", note: "Upper secondary school north of the centre." },
  { ref: ["way", 870639372], cat: "school", name: "Uranienborg skole", note: "Primary school." },
];

const CLUSTERS: { id: string; name: string; cat: PlaceCategory; note: string; refs: [T, number][] }[] = [
  {
    id: "cluster-rosenkrantz-bars", name: "Rosenkrantz gate bar cluster", cat: "nightlife",
    note: "Pubs and clubs (Lawo, Last Train, John's Bar, Mulligan's, Justisen, Herr Nilsen, Per på Hjørnet): Friday and Saturday late-night foot traffic.",
    refs: [["node", 10933957569], ["node", 10933957567], ["node", 10933957570], ["node", 10933877464], ["node", 12749752010], ["node", 2844681715], ["node", 4340314385], ["node", 10933877463], ["node", 10933877465]],
  },
  {
    id: "cluster-klingenberg-bars", name: "Klingenberggata / Stortingsgata bars", cat: "nightlife",
    note: "Pubs on the store's block (Dr. Jekyll's, The Old Irish Pub, The Lannisters, Raadhuset Bar, Bar Boman).",
    refs: [["node", 10604787203], ["node", 12797437936], ["node", 12797437935], ["node", 10604866005], ["node", 6341292393]],
  },
  {
    id: "cluster-aker-brygge", name: "Aker Brygge office, dining and bar cluster", cat: "office",
    note: "Waterfront offices, shops, restaurants and bars 500 m south-west; lunch and after-work traffic.",
    refs: [["way", 92647224], ["node", 25468555], ["node", 392057333], ["node", 8089727217], ["node", 11105786805], ["node", 10013753418]],
  },
];

async function overpass(refs: [T, number][]) {
  const byType = (t: T) => refs.filter((r) => r[0] === t).map((r) => r[1]);
  const part = (t: T) => (byType(t).length ? `${t}(id:${byType(t).join(",")});` : "");
  const q = `[out:json][timeout:60];(${part("node")}${part("way")}${part("relation")});out center tags;`;
  let res: Response | undefined;
  // main instance first, then public mirrors (same OSM data)
  for (const host of ["https://overpass-api.de", "https://overpass.private.coffee"]) {
    res = await fetch(`${host}/api/interpreter`, {
      signal: AbortSignal.timeout(25_000),
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "pulse-demo/0.1 github.com/panlytics" },
      body: "data=" + encodeURIComponent(q),
    }).catch(() => undefined);
    if (res?.ok) break;
    console.warn(`overpass ${host} -> ${res?.status ?? "network error"}`);
  }
  // Fallback: the raw Overpass response saved on 2026-11-08 (radius query around the store, same OSM ids).
  const json = (res?.ok
    ? await res.json()
    : (console.warn("using cached scripts/data/raw/osm-around-store.json"),
       JSON.parse(fs.readFileSync(path.join(root, "scripts", "data", "raw", "osm-around-store.json"), "utf8")))) as { elements: { type: T; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
  const m = new Map<string, { lat: number; lon: number; tags: Record<string, string> }>();
  for (const e of json.elements) {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat != null && lon != null) m.set(`${e.type}/${e.id}`, { lat, lon, tags: e.tags ?? {} });
  }
  return m;
}

const osmUrl = (t: T, id: number) => `https://www.openstreetmap.org/${t}/${id}`;
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ø/g, "o").replace(/æ/g, "ae").replace(/å/g, "a").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const dist = (lat: number, lon: number) => Math.round(haversineM(STORE.lat, STORE.lon, lat, lon));

(async () => {
  const allRefs = [...PICKS.map((p) => p.ref), ...CLUSTERS.flatMap((c) => c.refs)];
  const osm = await overpass(allRefs);
  const places: Place[] = [{
    id: STORE.id, name: STORE.name, category: "competitor", lat: STORE.lat, lon: STORE.lon, distanceM: 0,
    note: "The store itself (category set to competitor so it groups with QSR; filter by id).",
    sources: [
      { label: "Brønnøysundregistrene: org 981909100 BURGER KING AVD 5031 KLINGENBERG", url: "https://data.brreg.no/enhetsregisteret/oppslag/underenheter/981909100" },
      { label: "OpenStreetMap: Burger King Klingenberggata (node 383991805)", url: osmUrl("node", 383991805) },
    ],
  }];
  const missing: string[] = [];
  for (const p of PICKS) {
    const e = osm.get(`${p.ref[0]}/${p.ref[1]}`);
    if (!e) { missing.push(p.ref.join("/")); continue; }
    const name = p.name ?? e.tags.name;
    const capacity = p.capacity ?? (Number(e.tags.capacity) || undefined);
    places.push({
      id: p.id ?? `${p.cat}-${slug(name)}`, name, category: p.cat,
      lat: Math.round(e.lat * 1e6) / 1e6, lon: Math.round(e.lon * 1e6) / 1e6, distanceM: dist(e.lat, e.lon),
      note: p.note, ...(capacity ? { capacity } : {}),
      sources: [{ label: `OpenStreetMap ${p.ref[0]} ${p.ref[1]} (ODbL)`, url: osmUrl(...p.ref) }],
    });
  }
  for (const c of CLUSTERS) {
    const pts = c.refs.map((r) => ({ r, e: osm.get(`${r[0]}/${r[1]}`) })).filter((x) => x.e);
    if (!pts.length) { missing.push(c.id); continue; }
    const lat = pts.reduce((s, x) => s + x.e!.lat, 0) / pts.length;
    const lon = pts.reduce((s, x) => s + x.e!.lon, 0) / pts.length;
    places.push({
      id: c.id, name: c.name, category: c.cat, lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6,
      distanceM: dist(lat, lon), note: c.note,
      sources: pts.map((x) => ({ label: `OpenStreetMap ${x.r[0]} ${x.r[1]}: ${x.e!.tags.name ?? ""} (ODbL)`, url: osmUrl(...x.r) })),
    });
  }
  places.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  fs.writeFileSync(path.join(root, "src", "data", "places.json"), JSON.stringify(places, null, 1));
  const byCat: Record<string, number> = {};
  places.forEach((p) => (byCat[p.category] = (byCat[p.category] ?? 0) + 1));
  console.log(JSON.stringify({ total: places.length, byCat, missing }));
})();
