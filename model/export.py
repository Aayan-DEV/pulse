"""Write src/data/model/*.json and model/data/parity.json."""
import json
import math

import numpy as np
import pandas as pd

from features import DEFINITIONS, FEATURES, GROUPS, NEUTRAL, build_features
from inputs import APP, DATA

OUT = APP / "src" / "data" / "model"


def _clean(o):
    if isinstance(o, float):
        return None if not math.isfinite(o) else o
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (np.floating,)):
        return _clean(float(o))
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def _w(name, obj, path=OUT):
    with open(path / name, "w") as f:
        json.dump(_clean(obj), f, separators=(",", ":"), allow_nan=False)


def _tree(node):
    if "leaf_value" in node:
        return {"v": node["leaf_value"]}
    assert node["decision_type"] == "<=", node["decision_type"]
    return {"f": node["split_feature"], "t": node["threshold"], "d": bool(node["default_left"]),
            "m": node["missing_type"], "l": _tree(node["left_child"]), "r": _tree(node["right_child"])}


def dump_trees(model):
    dm = model.dump_model()
    assert dm["feature_names"] == FEATURES
    return {"featureNames": dm["feature_names"], "numTrees": len(dm["tree_info"]),
            "trees": [_tree(t["tree_structure"]) for t in dm["tree_info"]]}


def export_all(models, conf, test, raw, cal, grouped, bench, spikes, meta, events, cruise):
    OUT.mkdir(parents=True, exist_ok=True)
    for k, m in models.items():
        _w(f"{k}.json", dump_trees(m))
    _w("features.json", {"names": FEATURES, "groups": GROUPS, "definitions": DEFINITIONS,
                         "neutral": {k: (None if isinstance(v, float) and math.isnan(v) else v) for k, v in NEUTRAL.items()}})
    _w("conformal.json", conf)
    _w("benchmark.json", bench)
    _w("spikes.json", spikes)
    _w("meta.json", meta)

    # history: last 8 weeks hourly + daily aggregate of the whole test period
    t = test.copy()
    for k in ("p10", "p50", "p90"):
        t[k] = cal[k]
    cut = t.time.max() - pd.Timedelta(weeks=8)
    hourly = []
    for i in np.where(t.time > cut)[0]:
        r = t.iloc[i]
        hourly.append({"time": r.time.isoformat(), "p10": round(float(r.p10), 1), "p50": round(float(r.p50), 1),
                       "p90": round(float(r.p90), 1), "actual": int(r.y),
                       "drivers": [{"group": g, "value": round(float(grouped.iloc[i][g]), 2)} for g in GROUPS]})
    t["date"] = t.time.dt.tz_convert("Europe/Oslo").dt.date.astype(str)
    daily = t.groupby("date").agg(actual=("y", "sum"), p10=("p10", "sum"), p50=("p50", "sum"), p90=("p90", "sum")).round(0).reset_index()
    _w("history.json", {"note": "Hourly = last 8 weeks of the test period (open hours only). Daily band = sum of hourly P10/P90 (wider than a true daily 80% interval). Actuals are SIMULATED.",
                        "hourly": hourly, "daily": daily.to_dict(orient="records")})

    # parity set: 200 test rows, with event/cruise subsets, synthetic situations and some synthetic transit stats
    rng = np.random.default_rng(3)
    busy = np.where((t.ev_active + t.ev_pre + t.ev_post + t.transit_disruption + t.cruise_pax + t.xmas_market + t.crowd_nt_pre + t.crowd_nt_post) > 0)[0]
    pick = list(rng.choice(busy, min(100, len(busy)), replace=False)) if len(busy) else []
    rest = np.setdiff1d(np.arange(len(t)), pick)
    pick = sorted(pick + list(rng.choice(rest, 200 - len(pick), replace=False)))
    rows = t.iloc[pick].reset_index(drop=True)
    ts = ((rows.time - pd.Timestamp("1970-01-01", tz="UTC")) / pd.Timedelta(seconds=1)).to_numpy(dtype=float)

    def near(s, e):
        return bool(np.any((ts >= s - 4 * 3600) & (ts < e + 3 * 3600)))

    ev_sub = [e for e in events if near(pd.Timestamp(e["start"]).timestamp(), pd.Timestamp(e["end"]).timestamp())]
    cr_sub = [c for c in cruise if near(pd.Timestamp(c["arrival"]).timestamp(), pd.Timestamp(c["departure"]).timestamp())]
    t0 = rows.time.iloc[10]; t1 = rows.time.iloc[50]; t2 = rows.time.iloc[90]
    sits = [
        {"id": "syn-1", "summary": "Signal fault, trains cancelled", "severity": "severe",
         "validFrom": (t0 - pd.Timedelta(hours=1)).isoformat(), "validTo": (t0 + pd.Timedelta(hours=2)).isoformat()},
        {"id": "syn-2", "summary": "Minor delays", "severity": "slight",
         "validFrom": (t1 - pd.Timedelta(hours=1)).isoformat(), "validTo": (t1 + pd.Timedelta(hours=2)).isoformat()},
        {"id": "syn-3", "summary": "Open-ended works", "severity": "normal", "validFrom": t2.isoformat()},
    ]
    rl = rows.rail_late5_share.to_numpy(dtype=float).copy(); rc = rows.rail_cancelled_share.to_numpy(dtype=float).copy()
    ml = rows.metro_late5_share.to_numpy(dtype=float).copy()
    syn = rng.choice(len(rows), 20, replace=False)
    rl[syn] = rng.uniform(0, 0.6, 20); rc[syn] = rng.uniform(0, 0.3, 20); ml[syn] = rng.uniform(0, 0.4, 20)
    X = build_features(ts, rows.temp_c, rows.precip_mm, rows.wind_ms, ev_sub, sits, cr_sub, rl, rc, ml)
    from train import calibrate, predict_raw  # local import to avoid a cycle at module load
    pr = predict_raw(models, X)
    pc = calibrate(pr, conf)
    parity = {"events": ev_sub, "cruise": cr_sub, "situations": sits, "rows": []}
    for i in range(len(rows)):
        parity["rows"].append({
            "time": rows.time.iloc[i].isoformat(),
            "weather": {"time": rows.time.iloc[i].isoformat(), "tempC": float(rows.temp_c.iloc[i]),
                        "precipMm": float(rows.precip_mm.iloc[i]), "windMs": float(rows.wind_ms.iloc[i])},
            "transitStats": {"railLate5Share": rl[i], "railCancelledShare": rc[i], "metroLate5Share": ml[i]},
            "features": [float(v) for v in X.iloc[i].to_numpy()],
            "raw": {k: float(pr[k][i]) for k in pr}, "pred": {k: float(pc[k][i]) for k in pc},
        })
    from datetime import date, timedelta
    from features import calendar_feats
    cal_rows, dd = [], date(2023, 1, 1)
    while dd <= date(2027, 12, 31):
        c = calendar_feats(dd)
        cal_rows.append([dd.isoformat(), c["is_holiday"], c["school_holiday"], c["payday_window"], c["days_to_christmas"], c["xmas_market"]])
        dd += timedelta(days=1)
    parity["calendar"] = cal_rows
    from features import is_open
    wk = pd.date_range("2026-11-16", periods=24 * 8, freq="h", tz="Europe/Oslo")  # Mon 16 Nov .. Mon 23 Nov
    parity["openWeek"] = [[x.isoformat(), bool(o)] for x, o in zip(wk, is_open(wk.hour.to_numpy(), wk.dayofweek.to_numpy()))]
    Xn = build_features(ts[:5], np.zeros(5), np.zeros(5), np.zeros(5), [], [], [])
    parity["noStats"] = [{"time": rows.time.iloc[i].isoformat(), "features": [float(v) for v in Xn.iloc[i].to_numpy()]} for i in range(5)]
    _w("parity.json", parity, DATA)
    sizes = {p.name: p.stat().st_size for p in OUT.glob("*.json")}
    print("exported", sizes)
