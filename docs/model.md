# Demand model (BK Klingenberg)

Generated 2026-11-08T09:00:24+00:00 by `model/train.py`. Rebuild: `model/.venv/bin/python model/train.py && model/.venv/bin/python model/write_docs.py`, then `npx tsx scripts/model/parity.ts`.

## Real vs simulated

- **Simulated: the sales.** We have no POS data. Hourly transactions come from `model/simulate.py`; every injected effect is logged per hour in `model/data/truth.csv`.
- **Real: the drivers**, where a file exists:
  - Weather: MET Norway Frost, Oslo Blindern SN18700, CC BY 4.0 (the Frost API response still links CC BY 3.0 NO); gaps filled from the Open-Meteo archive. Gap-fill share from Open-Meteo: tempC 0.0%, precipMm 0.6%, windMs 0.0%.
  - Holidays: `date-holidays` 'NO' public holidays (the same library in Python via an export and in TS live).
  - Transit: src/data/transit-history.json (53178 rows, real Entur SIRI-ET). Rail late-5-min share, rail cancelled share and metro late-5-min share at Nationaltheatret, hourly. The simulator's transit uplift is driven by these real hours.
  - Events: src/data/events-history.json (111 events).
  - Cruise: src/data/cruise-history.json (2164 calls, PATTERN from CruiseMapper July 2027, not real calls).
  - Christmas market: calendar rule for Jul i Vinterland at Spikersuppa (about 0.3 km away): open 7 Nov to 3 Jan, closed 24 Dec. Listings give 7 Nov 2026 to 3 Jan 2027 (rove.me/to/oslo/christmas-markets); one Visit Oslo page says 15 Nov, and 2025 listings vary (7 or 8 Nov). The same window is assumed every year. `days_to_christmas` sits in Calendar & holidays, not in Christmas market.
- **Opening hours:** Real hours from the owner calendar: Mon-Thu 10:00-24:00, Fri-Sat 10:00-04:00, Sun 11:00-24:00 (Europe/Oslo).

## Simulator assumptions

- Baseline weekday lunch peak 95 transactions/hour; summer Saturday lunch about 145; about 1,000 transactions/day on average. Reasoning: 45 staff (brreg) and a flagship site by Nationaltheatret station; at an assumed average ticket near NOK 160 this is roughly NOK 55-60M a year. This is an assumption, not a sourced figure.
- Shape: hour-of-day x weekday x month (tourist summer peak) x 2%/year trend; Fri/Sat nights after 22:00 x1.4 (bar crowd).
- Weather: rain -6% to -14% (net of extra delivery), frost down to -18%, warm dry afternoons up to +15%, strong wind down to -12%.
- Calendar: public holidays x0.82 (offices closed), 24 Dec after 16:00 x0.1, 25 Dec x0.55, New Year night x2, school holidays +5% daytime, payday window +7% (+12% evenings).
- Events: additive, attendance x exp(-d / 0.7 km), within 3 km; 3 h before, during, and 2 h after.
- Transit: real outage events x1.45 (weekday daytime) or x1.25; real rail delay/cancel shares up to +85%; capped at x1.9.
- Cruise: +4 transactions/hour per 1,000 passengers in port, 09-17.
- Christmas market: +12% (+25% 14:00-21:00).
- 20 hidden "mystery" days (+50% to +130% for 2-5 hours) that the model never sees.
- Noise: negative binomial (gamma-Poisson, r = 25). The oracle row below shows the floor this noise sets.

## Model

- LightGBM quantile regression, three models (alpha 0.1 / 0.5 / 0.9), 300 trees, num_leaves 31.
- 23 features, all computable live from timestamp, weather, events, transit situations/stats and cruise calls (`src/data/model/features.json`).
- **No sales lags.** Live inference needs no POS feed. The cost: the model cannot adapt to a level shift (new competitor, refurbishment) until it is retrained.
- Split (Europe/Oslo dates): fit 2023-01-01 to 2025-07-31, conformal calibration 2025-08-01 to 2025-10-31, test 2025-11-01 to 2026-11-07. Open-hour rows: fit 14141, calibration 1380, test 5584.
- Calibration: split conformal (CQR), one offset per tail, scaled by sqrt(P50).

## Results (test period, open hours)

| Model | WAPE | MAE | Pinball P50 |
|---|---|---|---|
| LightGBM P50 (this model) | 21.4% | 17.3 | 8.65 |
| Seasonal naive (same hour last week) | 32.2% | 26.0 | 13.00 |
| Oracle: true simulated mean (noise floor) | 19.1% | 15.4 | 7.72 |
| Hour x weekday mean | 31.0% | 25.1 | 12.53 |

- Pinball P10 / P90 (calibrated): 3.33 / 4.42; raw: 3.38 / 4.38.
- 80% interval coverage: raw 76.1%, calibrated 78.5% (below P10 9.5%, above P90 12.1%).

### Effect recovery (model uplift = P50 minus P50 with that group set to neutral values, mean over hours where the true effect is active)

| Group | Active hours | True mean uplift | Model mean uplift | Corr |
|---|---|---|---|---|
| Weather | 2058 | -0.94 | 3.02 | 0.843 |
| Calendar & holidays | 1367 | 2.66 | 3.01 | 0.664 |
| Events | 87 | 9.79 | 3.12 | 0.23 |
| Crowds via Nationaltheatret | 25 | 49.2 | 28.92 | 0.99 |
| Transit disruption | 3077 | 17.85 | 18.55 | 0.906 |
| Cruise | 979 | 12.43 | 8.6 | 0.847 |
| Christmas market | 877 | 12.34 | 10.94 | 0.736 |
| Mystery (hidden) | 20 | 67.22 | 0.0 |  |

Weather has the wrong sign on average: the neutral point (12 C, dry, 3 m/s) is rare in winter, so the model's counterfactual is an extrapolation. The per-hour correlation is still high.

### Spike finder

test days with >= 2 open hours above calibrated P90, ranked by excess. Days evaluated: 40. Top-1 hit 85.0%, top-3 hit 100.0%.

| True cause | Days | Top-1 | Top-3 |
|---|---|---|---|
| Mystery | 4 | 25.0% | 100.0% |
| Transit disruption | 29 | 100.0% | 100.0% |
| Crowds via Nationaltheatret | 2 | 100.0% | 100.0% |
| Calendar & holidays | 1 | 0.0% | 100.0% |
| noise | 1 | 100.0% | 100.0% |
| Christmas market | 2 | 0.0% | 100.0% |
| Events | 1 | 100.0% | 100.0% |

"Mystery" and "noise" days count as a hit when "No logged cause" is ranked. Mystery days in the test period: 2025-12-11, 2026-09-26, 2026-03-26, 2025-12-02, 2026-04-11, 2026-01-07.

### Ablation (drop a feature group, retrain P50 with 150 trees)

| Dropped | WAPE | Delta |
|---|---|---|
| none | 21.5% | +0.00 pp |
| Baseline/time | 31.9% | +10.38 pp |
| Calendar & holidays | 21.9% | +0.41 pp |
| Weather | 23.4% | +1.89 pp |
| Events | 21.3% | -0.25 pp |
| Transit disruption | 30.1% | +8.62 pp |
| Cruise | 21.9% | +0.40 pp |
| Christmas market | 22.0% | +0.50 pp |
| Crowds via Nationaltheatret | 21.8% | +0.24 pp |

## Drivers in the app

- `history.json` drivers are TreeSHAP (LightGBM `pred_contrib`) on P50, grouped; "Baseline/time" includes the bias, so drivers sum to P50.
- Live drivers (`predict.ts`) use saliency instead of TreeSHAP: P50 minus P50 with the group set to neutral values; "Baseline/time" is the remainder.

## Honest limits

- The accuracy numbers measure how well the model recovers effects **we injected**. They say nothing yet about real BK sales.
- Effect sizes are assumptions. Real POS data would replace the simulator and re-fit the same features.
- Live transit features want the hourly Entur shares (`transitStatsFromDepartures`). With no `transitStats` argument the builder assumes a typical hour (rail late share 0.05, no cancellations); a null field means "unknown" and takes the NaN branch learned from night hours.
- Events: few real events fall in the test period, so the event effect is weakly recovered (see table).
- Daily bands in `history.json` sum hourly P10/P90, so they are wider than a true daily 80% interval.
