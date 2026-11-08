# Data sources

Every figure in Pulse comes from one of these sources. Checked on 2026-11-08.

## Live (fetched by `src/lib/live/*`, served at `GET /api/live`)

| Source | URL | License | Used for | Cache | Verified |
|---|---|---|---|---|---|
| MET Norway Locationforecast 2.0 (compact) | https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=59.9139&lon=10.7328 | CC BY 4.0 (MET Norway) | `weather.now`, `weather.next48h` | 10 min | Live call returned hourly data, User-Agent `pulse-demo/0.1 github.com/panlytics` |
| MET Norway Frost, Oslo Blindern SN18700 | https://frost.met.no/observations/v0.jsonld?sources=SN18700&elements=air_temperature,sum(precipitation_amount PT1H),wind_speed&referencetime=latest | CC BY 4.0 (MET Norway) | `weather.observed` (latest official observation) | 10 min | Live call returned temp, precip, wind. Client ID read server-side from `FROST_CLIENT_ID`, never logged |
| Entur Journey Planner v3 (GraphQL) | https://api.entur.io/journey-planner/v3/graphql | NLOD 2.0 | `transit.departures` (aimed vs expected, cancellation) and `transit.situations` for the stop, its lines and Oslo S | 60 s | Live call returned 88 departures and 6 situations (incl. the T-bane closure 19-22 Nov 2026) |
| Statens vegvesen CCTV (DATEX 3.1 site table via OGC API Features) | https://ogckart-sn1.atlas.vegvesen.no/ogc/features/v1/collections/datex_3_1:CctvSimple/items | NLOD 2.0, credit "Contains data under the Norwegian licence for Open Government data (NLOD) distributed by Statens vegvesen" | `cameras` (6 nearest) | 30 min, fallback `src/data/cameras.json` | Each still image URL `https://kamera.atlas.vegvesen.no/api/images/<id>` answered 200 image/jpeg |
| Upcoming listings (file) | see below | publisher's own | `events` (today + 7 days) | read per request | |
| Cruise (file) | none yet | | `cruise` | | No schedule obtained, see gaps |

Entur stop places (from Entur `nearest` at the store, 2026-11-08):
- NSR:StopPlace:58404 Nationaltheatret (metro, tram, bus, rail), 68 m
- NSR:StopPlace:58382 Aker brygge (tram, boat), 358 m
- NSR:StopPlace:4245 Kontraskjæret (tram), 457 m
- NSR:StopPlace:59872 Oslo S (situations only)
- Rail quays at Nationaltheatret: NSR:Quay:475, 476, 477, 478

Cameras (all 200 image/jpeg on 2026-11-08; the only one within 2 km is Hjortnes):
- 0329002_1 E18 Hjortnes, 1.6 km: https://kamera.atlas.vegvesen.no/api/images/0329002_1
- 0329034_1 R150 Ullevål, 3.8 km: https://kamera.atlas.vegvesen.no/api/images/0329034_1
- 0329031_1 E6 Sandstuveien, 5.1 km: https://kamera.atlas.vegvesen.no/api/images/0329031_1
- 0329003_1 R4 Linderud, 6.6 km: https://kamera.atlas.vegvesen.no/api/images/0329003_1
- 0329007_1 E18 Fiskevollbukta, 8.4 km: https://kamera.atlas.vegvesen.no/api/images/0329007_1
- 0329004_1 E6 Furuset, 9.8 km: https://kamera.atlas.vegvesen.no/api/images/0329004_1

## Files (built by `scripts/data/*.ts`)

| File | Built by | Sources | License | Notes |
|---|---|---|---|---|
| `src/data/events-history.json` (CityEvent[]) | `build-events-history.ts` | News, official and organiser pages per event (each event lists its URLs); Entur SIRI-ET for measured disruptions | publishers' own (facts only, cited) | Inputs: hand-checked recurring events in the script, `scripts/data/raw/events-crowds.json`, `scripts/data/raw/events-transit.json`, `src/data/transit-episodes.json` |
| `src/data/events-upcoming.json` | `scrape-upcoming.ts` (context.dev scrape API) | https://www.oslospektrum.no/, https://oslokonserthus.no/program, https://www.nobelpeacecenter.org/en/events | publishers' own | Times are not on the Spektrum and Konserthus listings: 19:00 start assumed, noted per event |
| `src/data/places.json` (Place[]) | `build-places.ts` | OpenStreetMap via Overpass (https://overpass-api.de/api/interpreter); store from Brønnøysundregistrene | ODbL (OSM), NLOD (brreg) | Every place links its OSM element. Overpass was down at build time, so the script used `scripts/data/raw/osm-around-store.json`, an Overpass response saved earlier the same morning |
| `src/data/cameras.json` | `fetch-cameras.ts` | Statens vegvesen | NLOD 2.0 | Fallback only |
| `src/data/transit-history.json` | `build-transit-history.ts` | Entur SIRI-ET (BigQuery) | NLOD 2.0 | Hourly, Nationaltheatret rail + metro, 2023-01-01 to 2026-11-07, 7.3 MB |
| `model/data/transit-history.csv` | `build-transit-history.ts` | Entur SIRI-ET (BigQuery) | NLOD 2.0 | Hourly, all modes at Nationaltheatret plus Oslo S rail |
| `src/data/transit-episodes.json` | `build-transit-history.ts` | Entur SIRI-ET (BigQuery) | NLOD 2.0 | Merged disruption hours |

## Entur realtime history (BigQuery)

- Table: `ent-data-sharing-ext-prd.realtime_siri_et.realtime_siri_et_last_recorded` (last SIRI-ET message per journey, one row per stop call; partitioned by `operatingDate`, clustered by `dataSource, lineref`). Catalog: https://docs.data.entur.no/docs/public-data-catalog
- Billing project: `etoo-501119`. SQL: `scripts/data/sql/transit-hourly.sql`, run once per year with `@d0/@d1` (piped via stdin because the file starts with `--`).
- Filters: `dataSource IN ('RUT','VYG','FLT','GOA','SJN','BNR')`, `stopPointName LIKE 'Nationaltheatret%' OR = 'Oslo S'`. Mode: non-Ruter = rail; Ruter line 1-5 = metro, 11-19 = tram, else bus. Delay = recorded departure (or arrival) minus aimed, only for non-estimated, non-cancelled calls. Cancelled = journey or stop cancellation.
- Disruption hour: rail or metro, >= 4 calls, and > 20% cancelled or median delay > 10 min. Consecutive hours (gap <= 1 h) merged into episodes; top 30 Nationaltheatret episodes of >= 2 h are in events-history as category `transit`.

| Job | Range | Bytes billed | Cost at $6.25/TiB |
|---|---|---|---|
| Discovery (one day, distinct quays) | 2026-11-05 | 73,400,320 | $0.0004 |
| Hourly 2023 | 2023-01-01..2023-12-31 | 39,682,310,144 | $0.23 |
| Hourly 2024 | 2024 | 40,869,298,176 | $0.23 |
| Hourly 2025 | 2025 | 34,078,720,000 | $0.19 |
| Hourly 2026 | 2026-01-01..2026-11-08 | 29,613,883,392 | $0.17 |
| Total | | 144,317,612,032 (134 GiB) | about $0.82 |

Dry runs were done before each query (upper bounds 39.7, 40.9, 34.1, 29.6 GB).

Data caveat: Ruter metro realtime at Nationaltheatret is thin in 2023 (1,671 hours with data vs about 7,000 in later years), so metro history before 2024 is incomplete.

## Research tools (not runtime sources)

- context.dev Search and Scrape API (https://docs.context.dev) for finding and reading event pages.
- Two research passes (concerts, matches, protests, festivals; reported rail outages) produced the raw files in `scripts/data/raw/`. Each event there carries its own URLs.

## Gaps and things not verified

- Cruise: no Oslo Havn schedule obtained (the oslohavn.no cruise page did not scrape). `cruise` is empty and there is no `cruise-history.json`.
- Klingenberg kino (Odeon) showtimes, Nationaltheatret performance dates, Nasjonalmuseet and visitoslo listings are not parsed yet (Odeon page did not scrape).
- Ticketmaster skipped (needs an account).
- Measured transit episodes say what happened (cancellations, delays), not why.
- Jul i Vinterland 2025 closing date assumed 31 Dec (opening sourced). 17 May 2024 and 2026 pupil counts are estimates.
