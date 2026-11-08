"""Semi-synthetic hourly transactions for BK Klingenberg with logged ground truth per driver group.

Drivers (weather, holidays, events, transit, cruise) are real where the data exists; the sales
response to them is simulated with the assumptions below. Writes model/data/sim.parquet.
"""
import math

import numpy as np
import pandas as pd

from features import STORE_LAT, STORE_LON, build_features, haversine_km, iso_s, is_open, route_venue, route_windows
from inputs import DATA, END, START, load_cruise, load_events, load_transit_stats, load_weather

PEAK = 95.0  # weekday lunch transactions/hour at baseline (see docs/model.md)
HOUR_PROFILE = {10: .30, 11: .62, 12: 1.0, 13: .92, 14: .62, 15: .58, 16: .70, 17: .85, 18: .82, 19: .68,
                20: .56, 21: .48, 22: .42, 23: .36, 0: .26, 1: .30, 2: .22, 3: .15}
DOW = [0.90, 0.92, 0.95, 1.0, 1.12, 1.22, 1.0]
MONTH = [0, .85, .88, .92, .97, 1.05, 1.15, 1.25, 1.18, 1.0, .95, .95, 1.05]
MYSTERY_KINDS = ["viral TikTok about the store", "private event nearby let out", "film shoot crowd on Karl Johan",
                 "competitor next door closed", "school trip groups", "spontaneous street gathering"]
NB_R = 25.0


def simulate(seed: int = 42):
    rng = np.random.default_rng(seed)
    idx = pd.date_range(START, END, freq="h", tz="UTC")
    w = load_weather().reindex(idx).interpolate().bfill().ffill()
    events, ev_src = load_events()
    cruise, cr_src = load_cruise()
    tstats, ts_src = load_transit_stats(idx)
    t = ((idx - pd.Timestamp("1970-01-01", tz="UTC")) / pd.Timedelta(seconds=1)).to_numpy(dtype=float)
    kw = {}
    if tstats is not None:
        kw = dict(rail_late5=tstats["rail_late5_share"].to_numpy(), rail_canc=tstats["rail_cancelled_share"].to_numpy(),
                  metro_late5=tstats["metro_late5_share"].to_numpy())
    X = build_features(t, w["tempC"], w["precipMm"], w["windMs"], events, [], cruise, **kw)
    h = X["hour"].to_numpy().astype(int); dow = X["dow"].to_numpy().astype(int); mon = X["month"].to_numpy().astype(int)
    open_ = is_open(h, dow)
    n = len(idx)

    # Baseline: hour x dow x month x trend x Fri/Sat bar crowd
    prof = np.array([HOUR_PROFILE.get(x, 0.0) for x in h])
    sun_morning = (dow == 6) & (h <= 11) & (h >= 10)
    bar = ((np.isin(dow, [4, 5]) & (h >= 22)) | (np.isin(dow, [5, 6]) & (h <= 3))).astype(float)
    base = PEAK * prof * np.array(DOW)[dow] * np.array(MONTH)[mon] * (1 + 0.02 * X["years_since_2023"].to_numpy())
    base *= np.where(sun_morning, 0.7, 1.0) * (1 + 0.4 * bar)
    base = np.where(open_, base, 0.0)

    # Weather (net of a small delivery offset)
    T = X["temp_c"].to_numpy(); P = X["precip_mm"].to_numpy(); W = X["wind_ms"].to_numpy()
    m_w = np.ones(n)
    m_w *= np.where(P >= 0.2, 1 - 0.04 - 0.02 * np.minimum(P, 5), 1)
    m_w *= np.where(T < 0, 1 - 0.012 * np.minimum(-T, 15), 1)
    m_w *= np.where((T >= 18) & (P < 0.1) & (h >= 11) & (h <= 21), 1 + 0.015 * np.minimum(T - 18, 10), 1)
    m_w *= np.where(W > 8, 1 - 0.015 * np.minimum(W - 8, 8), 1)

    # Calendar & holidays
    local = idx.tz_convert("Europe/Oslo")
    md = local.month * 100 + local.day
    m_c = np.ones(n)
    m_c *= np.where(X["is_holiday"].to_numpy() == 1, 0.82, 1)
    m_c *= np.where(md == 1225, 0.55, 1)
    m_c *= np.where((md == 1224) & (h >= 16), 0.1, np.where(md == 1224, 0.9, 1))
    m_c *= np.where((md == 1231) & (h >= 18), 0.6, 1)
    m_c *= np.where((md == 101) & (h <= 2), 2.0, 1)
    m_c *= np.where((X["school_holiday"].to_numpy() == 1) & (h >= 11) & (h <= 18), 1.05, 1)
    pay = X["payday_window"].to_numpy() == 1
    m_c *= np.where(pay & (h >= 17), 1.12, np.where(pay, 1.07, 1))

    # Christmas market (Jul i Vinterland, Spikersuppa ~0.3 km)
    xm = X["xmas_market"].to_numpy() == 1
    m_x = np.where(xm & (h >= 14) & (h <= 21), 1.25, np.where(xm, 1.12, 1.0))

    # Transit disruption: real outage events + real Entur delay stats when present
    weekday_day = (dow <= 4) & (h >= 7) & (h <= 20)
    outage = X["transit_disruption"].to_numpy() == 1
    m_t = np.where(outage, np.where(weekday_day, 1.45, 1.25), 1.0)
    rl = np.nan_to_num(X["rail_late5_share"].to_numpy(), nan=0.0)
    rc = np.nan_to_num(X["rail_cancelled_share"].to_numpy(), nan=0.0)
    ml = np.nan_to_num(X["metro_late5_share"].to_numpy(), nan=0.0)
    m_t = m_t * (1 + 0.35 * np.clip((rl - 0.10) / 0.4, 0, 1) + 0.5 * np.clip(rc / 0.3, 0, 1) + 0.15 * np.clip((ml - 0.1) / 0.4, 0, 1))
    m_t = np.minimum(m_t, 1.9)

    # Hidden mystery effects (never shown to the model)
    m_m = np.ones(n)
    mystery = []
    days = pd.date_range(START, END[:10], freq="D")
    for d in rng.choice(len(days), 20, replace=False):
        day = days[d]
        sh = int(rng.integers(11, 20)); dur = int(rng.integers(2, 6)); mult = float(rng.uniform(1.5, 2.3))
        kind = MYSTERY_KINDS[int(rng.integers(len(MYSTERY_KINDS)))]
        s = pd.Timestamp(f"{day.date()} {sh:02d}:00", tz="Europe/Oslo").tz_convert("UTC")
        mask = (idx >= s) & (idx < s + pd.Timedelta(hours=dur))
        m_m[mask] *= mult
        mystery.append({"date": str(day.date()), "startHour": sh, "hours": dur, "mult": round(mult, 2), "kind": kind})

    mult_groups = {"Weather": m_w, "Calendar & holidays": m_c, "Christmas market": m_x, "Transit disruption": m_t, "Mystery": m_m}
    mu_mult = base * np.prod(np.vstack(list(mult_groups.values())), axis=0)
    truth = {"Baseline/time": base}
    for g, m in mult_groups.items():
        truth[g] = base * (m - 1)
    truth["Interaction"] = mu_mult - base - sum(base * (m - 1) for m in mult_groups.values())

    # Events (additive, distance decay, pre/active/post windows)
    ev_add = np.zeros(n); top_ev = np.full(n, "", dtype=object); top_val = np.zeros(n)
    for e in events:
        if e["category"] in ("transit", "cruise"):
            continue
        d = haversine_km(STORE_LAT, STORE_LON, e["lat"], e["lon"])
        if d > 3:
            continue
        s = iso_s(e["start"]); en = iso_s(e["end"]); dur = (en - s) / 3600
        A = (e.get("expectedAttendance") or 500) * math.exp(-d / 0.7)
        v = np.where((t >= s) & (t < en), A * 0.012 / max(3.0, dur), 0.0)
        if dur <= 12:
            v += np.where((s > t) & (s <= t + 3 * 3600), A * 0.004, 0.0)
            v += np.where((en <= t) & (en > t - 2 * 3600), A * 0.006, 0.0)
        v = np.where(open_, v, 0.0)
        ev_add += v
        better = v > top_val
        top_val = np.where(better, v, top_val); top_ev = np.where(better, e["id"], top_ev)
    truth["Events"] = ev_add

    # Crowds via Nationaltheatret: route venues at any distance. ASSUMPTION: 0.4 % of the routed crowd buys per
    # pre-window hour and 0.8 % per post-window hour (post-event hunger is the bigger effect).
    cr_add = np.zeros(n)
    for e in events:
        rv = route_venue(e)
        if rv is None:
            continue
        pre, post, val = route_windows(e, rv)
        v = np.zeros(n)
        for a, b in pre:
            v += np.where((a < t + 3600) & (b > t), val * 1000 * 0.004, 0.0)
        for a, b in post:
            v += np.where((a < t + 3600) & (b > t), val * 1000 * 0.008, 0.0)
        v = np.where(open_, v, 0.0)
        cr_add += v
        better = v > top_val
        top_val = np.where(better, v, top_val); top_ev = np.where(better, e["id"], top_ev)
    truth["Crowds via Nationaltheatret"] = cr_add

    # Cruise passengers (additive, 09-17 local)
    cr = X["cruise_pax"].to_numpy()
    # ASSUMPTION: 1.2 orders per 1000 passengers in port per hour (about 1 % of passengers over a 9 h call).
    truth["Cruise"] = np.where(open_ & (h >= 9) & (h <= 17), cr * 1.2, 0.0)

    mu = np.maximum(mu_mult + truth["Events"] + truth["Crowds via Nationaltheatret"] + truth["Cruise"], 0.0)
    lam = rng.gamma(NB_R, np.maximum(mu, 1e-9) / NB_R)
    y = np.where(open_, rng.poisson(lam), 0)

    df = X.copy()
    df.insert(0, "time", idx)
    df["open"] = open_
    df["y"] = y
    df["mu"] = mu
    for g, v in truth.items():
        df[f"truth_{g}"] = v
    df["truth_top_event"] = top_ev
    df.to_parquet(DATA / "sim.parquet")
    df[["time", "y", "mu"] + [c for c in df.columns if c.startswith("truth_")]].to_csv(DATA / "truth.csv", index=False)
    meta = {"events": ev_src, "cruise": cr_src, "transitStats": ts_src, "mystery": mystery, "nEvents": len(events)}
    return df, events, cruise, meta


if __name__ == "__main__":
    df, ev, cr, meta = simulate()
    o = df[df.open]
    print(meta["events"], meta["cruise"], meta["transitStats"])
    print("open hours", len(o), "mean y", o.y.mean().round(1), "p95", o.y.quantile(.95), "max", o.y.max())
    print("daily mean", df.groupby(df.time.dt.tz_convert("Europe/Oslo").dt.date).y.sum().mean().round(0))
    print(o.groupby("hour").y.mean().round(0).to_dict())
