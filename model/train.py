"""Train LightGBM quantile models, calibrate, evaluate, explain, and export artifacts.

Run: model/.venv/bin/python model/train.py
"""
import json
import math
from datetime import datetime, timezone

import lightgbm as lgb
import numpy as np
import pandas as pd

from evaluate import ablation, effect_recovery, spike_finder
from export import export_all
from features import DEFINITIONS, FEATURES, GROUPS
from inputs import DATA
from simulate import simulate

TRAIN_END = pd.Timestamp("2025-11-01", tz="Europe/Oslo").tz_convert("UTC")
CALIB_START = pd.Timestamp("2025-08-01", tz="Europe/Oslo").tz_convert("UTC")
QUANTS = {"p10": 0.1, "p50": 0.5, "p90": 0.9}
PARAMS = dict(learning_rate=0.05, num_leaves=31, min_data_in_leaf=40, feature_fraction=0.9, bagging_fraction=0.8,
              bagging_freq=1, lambda_l2=1.0, verbose=-1, seed=1, deterministic=True, num_threads=4)
N_TREES = 300


def fit(X, y, alpha, n=N_TREES, cols=FEATURES):
    ds = lgb.Dataset(X[cols].to_numpy(dtype=float), y.astype(float), feature_name=list(cols), free_raw_data=False)
    return lgb.train({**PARAMS, "objective": "quantile", "alpha": alpha}, ds, num_boost_round=n)


def wape(y, p):
    return float(np.abs(y - p).sum() / y.sum())


def pinball(y, p, a):
    d = y - p
    return float(np.mean(np.maximum(a * d, (a - 1) * d)))


def conformal_scale(p50):
    return np.sqrt(np.maximum(p50, 1.0))


def calibrate(raw, conf):
    p50 = np.maximum(raw["p50"], 0)
    sc = conformal_scale(raw["p50"])
    lo = raw["p10"] - conf["qLo"] * sc
    hi = raw["p90"] + conf["qHi"] * sc
    return {"p10": np.clip(np.minimum(lo, p50), 0, None), "p50": p50, "p90": np.maximum(hi, p50)}


def predict_raw(models, X):
    return {k: m.predict(X[FEATURES].to_numpy(dtype=float)) for k, m in models.items()}


def main():
    df, events, cruise, sim_meta = simulate()
    d = df[df.open].reset_index(drop=True)
    fit_m = d.time < CALIB_START
    cal_m = (d.time >= CALIB_START) & (d.time < TRAIN_END)
    test_m = d.time >= TRAIN_END
    fitd, cald, test = d[fit_m], d[cal_m], d[test_m].reset_index(drop=True)
    print("rows fit/calib/test", len(fitd), len(cald), len(test))

    models = {k: fit(fitd, fitd.y.to_numpy(), a) for k, a in QUANTS.items()}

    # Split conformal (CQR, asymmetric, sqrt(p50)-scaled) on the last 3 months of train
    rc = predict_raw(models, cald)
    sc = conformal_scale(rc["p50"]); yc = cald.y.to_numpy()
    nc = len(yc); level = min(1.0, math.ceil((nc + 1) * 0.9) / nc)
    conf = {"qLo": float(np.quantile((rc["p10"] - yc) / sc, level)),
            "qHi": float(np.quantile((yc - rc["p90"]) / sc, level)),
            "scale": "sqrt(max(p50_raw, 1))", "target": "P10/P90 each 10% tail -> 80% interval",
            "calibration": f"{cald.time.min().isoformat()} .. {cald.time.max().isoformat()} ({nc} open hours)"}

    raw = predict_raw(models, test)
    cal = calibrate(raw, conf)
    y = test.y.to_numpy().astype(float)

    # Baselines
    loc = d.time.dt.tz_convert("Europe/Oslo")
    key = pd.Series(d.y.to_numpy(), index=pd.MultiIndex.from_arrays([loc.dt.date, loc.dt.hour]))
    key = key[~key.index.duplicated()]
    tl = test.time.dt.tz_convert("Europe/Oslo")
    lastweek = [(dd - pd.Timedelta(days=7), hh) for dd, hh in zip(tl.dt.date, tl.dt.hour)]
    snaive = key.reindex(pd.MultiIndex.from_tuples(lastweek)).to_numpy(dtype=float)
    snaive = np.where(np.isnan(snaive), np.nanmean(y), snaive)
    trn = d[d.time < TRAIN_END]
    hd = trn.groupby(["hour", "dow"]).y.mean()
    hdmean = hd.reindex(pd.MultiIndex.from_arrays([test.hour, test.dow])).to_numpy()

    cov_raw = float(np.mean((y >= np.minimum(raw["p10"], raw["p90"])) & (y <= raw["p90"])))
    cov_cal = float(np.mean((y >= cal["p10"]) & (y <= cal["p90"])))
    bench = {
        "testRange": [test.time.min().isoformat(), test.time.max().isoformat()],
        "models": [
            {"name": "LightGBM P50 (this model)", "wape": wape(y, cal["p50"]), "mae": float(np.mean(np.abs(y - cal["p50"]))),
             "pinball": {"p10": pinball(y, cal["p10"], .1), "p50": pinball(y, cal["p50"], .5), "p90": pinball(y, cal["p90"], .9)},
             "pinballRaw": {"p10": pinball(y, raw["p10"], .1), "p90": pinball(y, raw["p90"], .9)}},
            {"name": "Seasonal naive (same hour last week)", "wape": wape(y, snaive), "mae": float(np.mean(np.abs(y - snaive))),
             "pinball": {"p50": pinball(y, snaive, .5)}, "note": "uses last week's actual sales, which live inference does not have"},
            {"name": "Oracle: true simulated mean (noise floor)", "wape": wape(y, test.mu.to_numpy()), "mae": float(np.mean(np.abs(y - test.mu.to_numpy()))),
             "pinball": {"p50": pinball(y, test.mu.to_numpy(), .5)}, "note": "not a forecast; the best any model can do given the simulated noise"},
            {"name": "Hour x weekday mean", "wape": wape(y, hdmean), "mae": float(np.mean(np.abs(y - hdmean))),
             "pinball": {"p50": pinball(y, hdmean, .5)}},
        ],
        "coverage": {"target": 0.8, "raw": cov_raw, "calibrated": cov_cal,
                     "belowP10Calibrated": float(np.mean(y < cal["p10"])), "aboveP90Calibrated": float(np.mean(y > cal["p90"]))},
        "conformal": conf,
    }
    print(json.dumps(bench["models"], indent=0)[:900]); print(bench["coverage"])

    # Explain: grouped TreeSHAP (pred_contrib) on P50
    contrib = models["p50"].predict(test[FEATURES].to_numpy(dtype=float), pred_contrib=True)
    shap = pd.DataFrame(contrib[:, :-1], columns=FEATURES)
    grouped = pd.DataFrame({g: shap[cols].sum(axis=1) for g, cols in GROUPS.items()})
    grouped["Baseline/time"] += contrib[:, -1]

    bench["effectRecovery"] = effect_recovery(models["p50"], test)
    spikes, hit = spike_finder(test, cal, events, cruise, sim_meta)
    bench["spikeFinder"] = hit
    bench["ablation"] = ablation(fit, wape, fitd, test)
    print(json.dumps(bench["effectRecovery"], indent=0)); print(hit); print(json.dumps(bench["ablation"]))

    meta = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "store": "Burger King Klingenberg, Klingenberggata 5, Oslo",
        "target": "transactions per hour (SIMULATED, semi-synthetic)",
        "trainRange": [d.time.min().isoformat(), (TRAIN_END - pd.Timedelta(hours=1)).isoformat()],
        "fitRange": [d.time.min().isoformat(), (CALIB_START - pd.Timedelta(hours=1)).isoformat()],
        "calibrationRange": [CALIB_START.isoformat(), (TRAIN_END - pd.Timedelta(hours=1)).isoformat()],
        "testRange": bench["testRange"],
        "rows": {"fit": int(len(fitd)), "calibration": int(len(cald)), "test": int(len(test))},
        "inputs": {**{k: v for k, v in sim_meta.items() if k != "mystery"},
                   "weather": json.load(open(DATA / "weather_meta.json"))},
        "mysteryEffects": sim_meta["mystery"],
        "model": {"type": "LightGBM quantile regression", "quantiles": QUANTS, "trees": N_TREES, **{k: v for k, v in PARAMS.items() if k in ("learning_rate", "num_leaves", "min_data_in_leaf")}},
        "openingHours": "Real hours from the owner calendar: Mon-Thu 10:00-24:00, Fri-Sat 10:00-04:00, Sun 11:00-24:00 (Europe/Oslo).",
        "assumptions": [
            "Sales are simulated; drivers (weather, holidays, events, transit, cruise) are real where the files exist.",
            "Baseline weekday lunch peak 95 transactions/hour; Saturday summer lunch about 145.",
            "No sales lags: the model forecasts from calendar, weather, events, transit and cruise only.",
            "P10/P90 are calibrated by split conformal (CQR) on the last 3 months of train.",
            "Crowds via Nationaltheatret: events at Ullevaal (share 0.35, 10 min), Holmenkollen (0.50, 20 min), Unity Arena Fornebu (0.25, 25 min), Bislett (0.15, 10 min) and Ekeberg (0.10, 20 min) count at any distance. Share = part of the crowd assumed to pass Nationaltheatret; windows are 2 h before (start - travel) and 1.5 h after (end + travel). Simulated response: 0.4 % of the routed crowd per pre hour, 0.8 % per post hour. All assumptions, set from the route map, not measured.",
            "Cruise: a PATTERN, not real calls. July uses the CruiseMapper count for July 2027 (about 151 calls; 8 ships on 3 and 4 Jul, 7 on 22 and 26 Jul); the May, Jun, Aug and Sep counts are an assumed season shape. Simulated response: 1.2 orders per 1000 passengers in port per hour.",
        ],
        "featureDefinitions": DEFINITIONS,
    }
    export_all(models, conf, test, raw, cal, grouped, bench, spikes, meta, events, cruise)


if __name__ == "__main__":
    main()
