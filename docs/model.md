# Demand model (BK Klingenberg)

Generated 2026-11-08T08:22:15+00:00 by `model/train.py`. Rebuild: `model/.venv/bin/python model/train.py && model/.venv/bin/python model/write_docs.py`, then `npx tsx scripts/model/parity.ts`.

## Real vs simulated

- **Simulated: the sales.** We have no POS data. Hourly transactions come from `model/simulate.py`; every injected effect is logged per hour in `model/data/truth.csv`.
- **Real: the drivers**, where a file exists:
  - Weather: MET Norway Frost, Oslo Blindern SN18700, CC BY 4.0 (the Frost API response still links CC BY 3.0 NO); gaps filled from the Open-Meteo archive. Gap-fill share from Open-Meteo: tempC 0.0%, precipMm 0.6%, windMs 0.0%.
  - Holidays: `date-holidays` 'NO' public holidays (the same library in Python via an export and in TS live).
  - Transit: src/data/transit-history.json (53178 rows, real Entur SIRI-ET). Rail late-5-min share, rail cancelled share and metro late-5-min share at Nationaltheatret, hourly. The simulator's transit uplift is driven by these real hours.
  - Events: src/data/events-history.json (111 events).
  - Cruise: SIMULATED seasonal cruise pattern (cruise-history.json missing).
  - Christmas market: calendar rule for Jul i Vinterland at Spikersuppa (about 0.3 km away): open 7 Nov to 3 Jan, closed 24 Dec. Listings give 7 Nov 2026 to 3 Jan 2027 (rove.me/to/oslo/christmas-markets); one Visit Oslo page says 15 Nov, and 2025 listings vary (7 or 8 Nov). The same window is assumed every year. `days_to_christmas` sits in Calendar & holidays, not in Christmas market.
- **Assumed:** opening hours. Assumed: daily 10:00-01:00, Fri/Sat nights until 03:00 (Europe/Oslo).

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
- 21 features, all computable live from timestamp, weather, events, transit situations/stats and cruise calls (`src/data/model/features.json`).
- **No sales lags.** Live inference needs no POS feed. The cost: the model cannot adapt to a level shift (new competitor, refurbishment) until it is retrained.
- Split (Europe/Oslo dates): fit 2023-01-01 to 2025-07-31, conformal calibration 2025-08-01 to 2025-10-31, test 2025-11-01 to 2026-11-07. Open-hour rows: fit 14681, calibration 1433, test 5795.
- Calibration: split conformal (CQR), one offset per tail, scaled by sqrt(P50).

## Results (test period, open hours)

| Model | WAPE | MAE | Pinball P50 |
|---|---|---|---|
| LightGBM P50 (this model) | 20.2% | 15.7 | 7.86 |
| Seasonal naive (same hour last week) | 31.7% | 24.7 | 12.33 |
| Oracle: true simulated mean (noise floor) | 18.0% | 14.0 | 7.01 |
| Hour x weekday mean | 29.8% | 23.2 | 11.58 |

- Pinball P10 / P90 (calibrated): 3.20 / 4.14; raw: 3.22 / 4.12.
- 80% interval coverage: raw 75.7%, calibrated 79.6% (below P10 8.8%, above P90 11.6%).

### Effect recovery (model uplift = P50 minus P50 with that group set to neutral values, mean over hours where the true effect is active)

| Group | Active hours | True mean uplift | Model mean uplift | Corr |
|---|---|---|---|---|
| Weather | 2102 | -0.95 | 3.23 | 0.825 |
| Calendar & holidays | 1394 | 2.6 | 2.25 | 0.777 |
| Events | 28 | 24.04 | 6.5 | -0.614 |
| Transit disruption | 3164 | 17.55 | 17.75 | 0.927 |
| Cruise | 623 | 11.42 | 7.18 | 0.584 |
| Christmas market | 907 | 12.03 | 6.37 | 0.758 |
| Mystery (hidden) | 20 | 67.22 | 0.0 |  |

Weather has the wrong sign on average: the neutral point (12 C, dry, 3 m/s) is rare in winter, so the model's counterfactual is an extrapolation. The per-hour correlation is still high.

### Spike finder

test days with >= 2 open hours above calibrated P90, ranked by excess. Days evaluated: 40. Top-1 hit 72.5%, top-3 hit 92.5%.

| True cause | Days | Top-1 | Top-3 |
|---|---|---|---|
| Mystery | 6 | 16.7% | 100.0% |
| Events | 2 | 100.0% | 100.0% |
| Transit disruption | 26 | 88.5% | 88.5% |
| Christmas market | 3 | 0.0% | 100.0% |
| noise | 3 | 100.0% | 100.0% |

"Mystery" and "noise" days count as a hit when "No logged cause" is ranked. Mystery days in the test period: 2025-12-11, 2026-09-26, 2026-03-26, 2025-12-02, 2026-04-11, 2026-01-07.

### Ablation (drop a feature group, retrain P50 with 150 trees)

| Dropped | WAPE | Delta |
|---|---|---|
| none | 20.3% | +0.00 pp |
| Baseline/time | 33.7% | +13.35 pp |
| Calendar & holidays | 20.8% | +0.48 pp |
| Weather | 21.9% | +1.60 pp |
| Events | 20.3% | -0.04 pp |
| Transit disruption | 31.6% | +11.28 pp |
| Cruise | 20.4% | +0.06 pp |
| Christmas market | 20.3% | -0.06 pp |

## Drivers in the app

- `history.json` drivers are TreeSHAP (LightGBM `pred_contrib`) on P50, grouped; "Baseline/time" includes the bias, so drivers sum to P50.
- Live drivers (`predict.ts`) use saliency instead of TreeSHAP: P50 minus P50 with the group set to neutral values; "Baseline/time" is the remainder.

## Honest limits

- The accuracy numbers measure how well the model recovers effects **we injected**. They say nothing yet about real BK sales.
- Effect sizes are assumptions. Real POS data would replace the simulator and re-fit the same features.
- Live transit features want the hourly Entur shares (`transitStatsFromDepartures`). With no `transitStats` argument the builder assumes a typical hour (rail late share 0.05, no cancellations); a null field means "unknown" and takes the NaN branch learned from night hours.
- Events: few real events fall in the test period, so the event effect is weakly recovered (see table).
- Daily bands in `history.json` sum hourly P10/P90, so they are wider than a true daily 80% interval.
