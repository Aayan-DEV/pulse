# Pulse Oslo

Why a store sells when it sells. Pulse forecasts orders per hour for **Burger King Klingenberg** (Klingenberggata 5, by Nationaltheatret, Oslo), explains every hour by its causes, finds the cause of past spikes, and turns the forecast into a legal staff schedule.

No login. Light and dark mode. Built on the Eto Admin design system.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. `.env.local` (git-ignored, server-side only) holds:

- `CONTEXT_DEV_API_KEY`: event scraping.
- `FROST_CLIENT_ID`: official MET Norway weather.

Without them the app still runs on the cached data.

## Pages

| Page | What it shows |
|---|---|
| Overview | Today's orders, staff needed now, live weather, trains, events, and what moves sales today |
| Live map | Store, 500 m to 2 km rings, live trains and buses, nearby places, events, live cameras |
| Forecast | Next 7 days by hour, with P10, P50 and P90 and the reasons per hour |
| Why it spiked | Days above the likely range, with ranked causes |
| Staffing | Erlang C staff per hour, a set-covering shift plan, a legal roster for 45 people, and a worked example |
| Events | Event library, every event with a source link |
| Trains and trams | Real Entur delay history and the biggest disruptions |
| Benchmark | Error against baselines, range hit rate, effect recovery, ablation, spike finder |
| Method, Data sources | Full method and sources (from `docs/`) |

## What is real and what is simulated

- **Real, live:**
  - Weather: met.no Locationforecast, plus the latest official observation from MET Frost (Oslo Blindern).
  - Departures, delays and disruption notices: Entur Journey Planner.
  - Train and bus positions: Entur vehicle API.
  - Venue programmes: scraped with context.dev.
- **Real, historic:**
  - Weather 2023 to now: MET Frost SN18700, with 0.6% gap-filled from Open-Meteo.
  - Norwegian holidays and school breaks.
  - About 1.8 million real stop calls at Nationaltheatret (Entur SIRI-ET on BigQuery), with disruption episodes.
  - A sourced event library: 17 May, Nobel, Jul i Vinterland, concerts, protests, IShowSpeed, outages.
- **Simulated:**
  - Hourly sales, built on the real inputs, with logged ground truth so effect recovery can be scored.
  - Cruise calls (a May to September pattern).
  - The roster mix.
  - Some staffing parameters, each labelled as an assumption.

Synthetic sales prove the pipeline and the method, not real effect sizes. With real POS data, only the sales source changes.

## Model and results (test year 2025-11-01 to 2026-11-07, held out)

- **Model:**
  - LightGBM quantile models (P10, P50, P90), calibrated with split conformal prediction.
  - Inference runs in TypeScript from the exported trees; a parity test against Python passes.
- **Error (WAPE):** 20.2%, against 29.8% (hour × weekday mean) and 31.7% (same hour last week). The noise floor is 18.0%.
- **Range:** P10 to P90 catches 79.6% of hours, against an 80% target.
- **Spike finder:** the true cause ranks first on 72.5% of 40 spike days and in the top 3 on 92.5%.
- **Effect recovery (transit):** the model estimates 17.8 extra orders per hour against 17.6 true, with a correlation of 0.93.

## Checks

```bash
npx tsx scripts/model/parity.ts
```

```bash
npx tsx scripts/staffing/test.ts
```

- **parity.ts:** TS features and predictions must equal Python's, and they do.
- **test.ts:** 38 checks. They cover Erlang C against published values, coverage, and Working Environment Act rules (§ 10-4, 10-8, 10-9, 10-11, 11-2, 11-3, 11-5).

Retrain:

```bash
model/.venv/bin/python model/train.py && model/.venv/bin/python model/write_docs.py && npx tsx scripts/model/parity.ts
```

## Notes

- The Perfectly Nineties font is copied from Eto for this demo. Check its licence before any public release.
- Rotate the context.dev key after the demo, because it was shared in chat.
