"""Effect recovery, spike finder and ablation."""
import math

import numpy as np
import pandas as pd

from features import FEATURES, GROUPS, NEUTRAL, STORE_LAT, STORE_LON, haversine_km, iso_s

TRUTH_GROUPS = ["Weather", "Calendar & holidays", "Events", "Transit disruption", "Cruise", "Christmas market"]


def neutralize(X: pd.DataFrame, group: str) -> pd.DataFrame:
    Xn = X.copy()
    for c in GROUPS[group]:
        Xn[c] = NEUTRAL[c]
    return Xn


def effect_recovery(model, test):
    rows = []
    base = model.predict(test[FEATURES].to_numpy(dtype=float))
    for g in TRUTH_GROUPS:
        tr = test[f"truth_{g}"].to_numpy()
        active = np.abs(tr) > 0.5
        if active.sum() < 5:
            rows.append({"group": g, "activeHours": int(active.sum()), "trueMeanUplift": None, "modelMeanUplift": None})
            continue
        neu = model.predict(neutralize(test, g)[FEATURES].to_numpy(dtype=float))
        est = (base - neu)[active]
        rows.append({"group": g, "activeHours": int(active.sum()), "trueMeanUplift": round(float(tr[active].mean()), 2),
                     "modelMeanUplift": round(float(est.mean()), 2),
                     "corr": round(float(np.corrcoef(tr[active], est)[0, 1]), 3) if active.sum() > 2 and np.std(est) > 0 else None})
    m = test["truth_Mystery"].to_numpy() > 0.5
    rows.append({"group": "Mystery (hidden)", "activeHours": int(m.sum()),
                 "trueMeanUplift": round(float(test["truth_Mystery"][m].mean()), 2) if m.any() else None,
                 "modelMeanUplift": 0.0, "note": "the model never sees these; they should surface as spikes"})
    return rows


def _candidates(day_rows, events, cruise):
    ts = (day_rows.time - pd.Timestamp("1970-01-01", tz="UTC")) / pd.Timedelta(seconds=1)
    ts = ts.to_numpy()
    nh = len(ts)
    cands = []
    for e in events:
        if e["category"] == "cruise":
            continue
        d = haversine_km(STORE_LAT, STORE_LON, e["lat"], e["lon"])
        lim = 10 if e["category"] == "transit" else 3
        if d > lim:
            continue
        s = iso_s(e["start"]); en = iso_s(e["end"])
        ov = np.mean((ts >= s - 3 * 3600) & (ts < en + 2 * 3600))
        if ov <= 0:
            continue
        if e["category"] == "transit":
            score = ov * 9.0
        else:
            A = e.get("expectedAttendance") or 500
            score = ov * math.log1p(A * math.exp(-d / 0.8)) * (1.0 if (en - s) <= 12 * 3600 else 0.6)
        cands.append({"id": e["id"], "kind": "transit" if e["category"] == "transit" else "event", "title": e["title"],
                      "category": e["category"], "distanceKm": round(d, 2), "score": round(float(score), 3)})
    for c in cruise:
        a = iso_s(c["arrival"]); b = iso_s(c["departure"])
        ov = np.mean((ts >= a) & (ts < b))
        if ov > 0:
            pax = c.get("passengers") or 2500
            cands.append({"id": f"cruise-{c['ship']}-{c['arrival'][:10]}", "kind": "cruise", "title": f"Cruise call: {c['ship']} ({pax} pax)",
                          "score": round(float(ov * math.log1p(pax) * 0.5), 3)})
    rl = day_rows["rail_late5_share"].to_numpy()
    if np.isfinite(rl).any() and np.nanmax(rl) > 0.25:
        cands.append({"id": "rail-delays", "kind": "transit", "title": "Rail delays at Nationaltheatret (Entur)",
                      "score": round(float(12 * np.nanmax(rl)), 3)})
    if day_rows["xmas_market"].max() == 1:
        cands.append({"id": "xmas-market", "kind": "xmas", "title": "Christmas market season (Spikersuppa)", "score": 2.5})
    if day_rows["payday_window"].max() == 1 or day_rows["is_holiday"].max() == 1:
        cands.append({"id": "calendar", "kind": "calendar", "title": "Payday / holiday", "score": 2.0})
    cands.append({"id": "unexplained", "kind": "unexplained", "title": "No logged cause (investigate)", "score": 3.0})
    return sorted(cands, key=lambda c: -c["score"])


def _truth(day_rows, excess, mystery_dates):
    sums = {g: float(day_rows[f"truth_{g}"].clip(lower=0).sum()) for g in TRUTH_GROUPS + ["Mystery"]}
    g = max(sums, key=sums.get)
    if sums[g] < 0.25 * excess:
        return {"group": "noise", "id": "unexplained", "label": "Random variation (no injected cause)"}
    if g == "Mystery":
        info = mystery_dates.get(str(day_rows.local_date.iloc[0]), {})
        return {"group": "Mystery", "id": "unexplained", "label": f"Hidden: {info.get('kind', 'mystery effect')}", "mystery": True}
    if g == "Events":
        ids = day_rows["truth_top_event"][day_rows["truth_top_event"] != ""]
        eid = ids.mode().iloc[0] if len(ids) else ""
        return {"group": g, "id": eid, "label": f"Event {eid}"}
    gid = {"Transit disruption": "transit", "Cruise": "cruise", "Christmas market": "xmas-market",
           "Calendar & holidays": "calendar", "Weather": "weather"}[g]
    return {"group": g, "id": gid, "label": g}


def _match(c, truth):
    if truth["id"] in ("transit",):
        return c["kind"] == "transit"
    if truth["id"] == "cruise":
        return c["kind"] == "cruise"
    return c["id"] == truth["id"]


def spike_finder(test, cal, events, cruise, sim_meta, n_eval=40, n_export=15):
    t = test.copy()
    t["p90c"] = cal["p90"]; t["p50c"] = cal["p50"]
    t["excess"] = np.where(t.y > t.p90c, t.y - t.p90c, 0.0)
    t["local_date"] = t.time.dt.tz_convert("Europe/Oslo").dt.date
    days = t[t.excess > 0].groupby("local_date").agg(excess=("excess", "sum"), hours=("excess", "size"))
    days = days[days.hours >= 2].sort_values("excess", ascending=False).head(n_eval)
    mystery_dates = {m["date"]: m for m in sim_meta["mystery"]}
    out, top1, top3, by_truth = [], 0, 0, {}
    for dte, row in days.iterrows():
        dr = t[(t.local_date == dte) & (t.excess > 0)]
        cands = _candidates(dr, events, cruise)
        tr = _truth(dr, row.excess, mystery_dates)
        h1 = _match(cands[0], tr); h3 = any(_match(c, tr) for c in cands[:3])
        top1 += h1; top3 += h3
        b = by_truth.setdefault(tr["group"], [0, 0, 0]); b[0] += 1; b[1] += h1; b[2] += h3
        out.append({"date": str(dte), "spikeHours": int(row.hours), "excessTransactions": round(float(row.excess), 1),
                    "actual": int(dr.y.sum()), "p90": round(float(dr.p90c.sum()), 1),
                    "hours": [{"time": x.time.isoformat(), "actual": int(x.y), "p50": round(float(x.p50c), 1), "p90": round(float(x.p90c), 1)} for x in dr.itertuples()],
                    "candidates": cands[:5], "truth": tr, "top1Hit": bool(h1), "top3Hit": bool(h3)})
    n = max(1, len(days))
    hit = {"spikeDaysEvaluated": int(len(days)), "definition": "test days with >= 2 open hours above calibrated P90, ranked by excess",
           "top1": round(top1 / n, 3), "top3": round(top3 / n, 3),
           "byTruth": {k: {"days": v[0], "top1": round(v[1] / v[0], 3), "top3": round(v[2] / v[0], 3)} for k, v in by_truth.items()},
           "mysteryDaysInTest": [m["date"] for m in sim_meta["mystery"] if m["date"] >= str(t.local_date.min())]}
    return out[:n_export], hit


def ablation(fit, wape, fitd, test, n=150):
    y = test.y.to_numpy().astype(float)
    full = fit(fitd, fitd.y.to_numpy(), 0.5, n=n)
    w0 = wape(y, full.predict(test[FEATURES].to_numpy(dtype=float)))
    rows = [{"dropped": "none", "wape": round(w0, 4), "delta": 0.0}]
    for g, cols in GROUPS.items():
        keep = [c for c in FEATURES if c not in cols]
        m = fit(fitd, fitd.y.to_numpy(), 0.5, n=n, cols=keep)
        w = wape(y, m.predict(test[keep].to_numpy(dtype=float)))
        rows.append({"dropped": g, "wape": round(w, 4), "delta": round(w - w0, 4)})
    return rows
