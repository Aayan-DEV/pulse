"""Render docs/model.md from the exported benchmark and meta, so the numbers never drift."""
import json

from inputs import APP

M = APP / "src" / "data" / "model"


def pct(x):
    return "n/a" if x is None else f"{100 * x:.1f}%"


def main():
    b = json.load(open(M / "benchmark.json"))
    m = json.load(open(M / "meta.json"))
    w = m["inputs"]["weather"]
    rows = "\n".join(
        f"| {x['name']} | {pct(x['wape'])} | {x['mae']:.1f} | {x['pinball'].get('p50', 0):.2f} |" for x in b["models"])
    pb = b["models"][0]["pinball"]; pr = b["models"][0]["pinballRaw"]
    eff = "\n".join(
        f"| {r['group']} | {r['activeHours']} | {r['trueMeanUplift']} | {r['modelMeanUplift']} | {r.get('corr', '')} |"
        for r in b["effectRecovery"])
    abl = "\n".join(f"| {r['dropped']} | {pct(r['wape'])} | {100 * r['delta']:+.2f} pp |" for r in b["ablation"])
    sf = b["spikeFinder"]
    by = "\n".join(f"| {k} | {v['days']} | {pct(v['top1'])} | {pct(v['top3'])} |" for k, v in sf["byTruth"].items())
    fill = ", ".join(f"{k} {pct(v)}" for k, v in w["gapFillShare"].items())
    doc = f"""# Demand model (BK Klingenberg)

Generated {m['generatedAt']} by `model/train.py`. Rebuild: `model/.venv/bin/python model/train.py && model/.venv/bin/python model/write_docs.py`, then `npx tsx scripts/model/parity.ts`.

## Real vs simulated

- **Simulated: the sales.** We have no POS data. Hourly transactions come from `model/simulate.py`; every injected effect is logged per hour in `model/data/truth.csv`.
- **Real: the drivers**, where a file exists:
  - Weather: {w['source']}. Gap-fill share from Open-Meteo: {fill}.
  - Holidays: `date-holidays` 'NO' public holidays (the same library in Python via an export and in TS live).
  - Transit: {m['inputs']['transitStats']}. Rail late-5-min share, rail cancelled share and metro late-5-min share at Nationaltheatret, hourly. The simulator's transit uplift is driven by these real hours.
  - Events: {m['inputs']['events']}.
  - Cruise: {m['inputs']['cruise']}.
  - Christmas market: calendar rule for Jul i Vinterland at Spikersuppa (about 0.3 km away): open 7 Nov to 3 Jan, closed 24 Dec. Listings give 7 Nov 2026 to 3 Jan 2027 (rove.me/to/oslo/christmas-markets); one Visit Oslo page says 15 Nov, and 2025 listings vary (7 or 8 Nov). The same window is assumed every year. `days_to_christmas` sits in Calendar & holidays, not in Christmas market.
- **Assumed:** opening hours. {m['openingHours']}

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

- LightGBM quantile regression, three models (alpha 0.1 / 0.5 / 0.9), {m['model']['trees']} trees, num_leaves {m['model']['num_leaves']}.
- {len(m['featureDefinitions'])} features, all computable live from timestamp, weather, events, transit situations/stats and cruise calls (`src/data/model/features.json`).
- **No sales lags.** Live inference needs no POS feed. The cost: the model cannot adapt to a level shift (new competitor, refurbishment) until it is retrained.
- Split (Europe/Oslo dates): fit 2023-01-01 to 2025-07-31, conformal calibration 2025-08-01 to 2025-10-31, test 2025-11-01 to {m['testRange'][1][:10]}. Open-hour rows: fit {m['rows']['fit']}, calibration {m['rows']['calibration']}, test {m['rows']['test']}.
- Calibration: split conformal (CQR), one offset per tail, scaled by sqrt(P50).

## Results (test period, open hours)

| Model | WAPE | MAE | Pinball P50 |
|---|---|---|---|
{rows}

- Pinball P10 / P90 (calibrated): {pb['p10']:.2f} / {pb['p90']:.2f}; raw: {pr['p10']:.2f} / {pr['p90']:.2f}.
- 80% interval coverage: raw {pct(b['coverage']['raw'])}, calibrated {pct(b['coverage']['calibrated'])} (below P10 {pct(b['coverage']['belowP10Calibrated'])}, above P90 {pct(b['coverage']['aboveP90Calibrated'])}).

### Effect recovery (model uplift = P50 minus P50 with that group set to neutral values, mean over hours where the true effect is active)

| Group | Active hours | True mean uplift | Model mean uplift | Corr |
|---|---|---|---|---|
{eff}

Weather has the wrong sign on average: the neutral point (12 C, dry, 3 m/s) is rare in winter, so the model's counterfactual is an extrapolation. The per-hour correlation is still high.

### Spike finder

{sf['definition']}. Days evaluated: {sf['spikeDaysEvaluated']}. Top-1 hit {pct(sf['top1'])}, top-3 hit {pct(sf['top3'])}.

| True cause | Days | Top-1 | Top-3 |
|---|---|---|---|
{by}

"Mystery" and "noise" days count as a hit when "No logged cause" is ranked. Mystery days in the test period: {', '.join(sf['mysteryDaysInTest'])}.

### Ablation (drop a feature group, retrain P50 with 150 trees)

| Dropped | WAPE | Delta |
|---|---|---|
{abl}

## Drivers in the app

- `history.json` drivers are TreeSHAP (LightGBM `pred_contrib`) on P50, grouped; "Baseline/time" includes the bias, so drivers sum to P50.
- Live drivers (`predict.ts`) use saliency instead of TreeSHAP: P50 minus P50 with the group set to neutral values; "Baseline/time" is the remainder.

## Honest limits

- The accuracy numbers measure how well the model recovers effects **we injected**. They say nothing yet about real BK sales.
- Effect sizes are assumptions. Real POS data would replace the simulator and re-fit the same features.
- Live transit features want the hourly Entur shares (`transitStatsFromDepartures`). With no `transitStats` argument the builder assumes a typical hour (rail late share 0.05, no cancellations); a null field means "unknown" and takes the NaN branch learned from night hours.
- Events: few real events fall in the test period, so the event effect is weakly recovered (see table).
- Daily bands in `history.json` sum hourly P10/P90, so they are wider than a true daily 80% interval.
"""
    (APP / "docs" / "model.md").write_text(doc)
    print("wrote docs/model.md")


if __name__ == "__main__":
    main()
