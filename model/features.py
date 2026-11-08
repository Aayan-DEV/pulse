"""Feature builder. MUST match src/lib/model/features.ts exactly (parity test checks it).

All inputs are things the live app has: timestamp, weather hour, events, transit situations,
cruise calls, and optional hourly transit delay stats. No sales lags.
"""
import json
import math
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
STORE_LAT, STORE_LON = 59.91389, 10.73277
EPOCH_2023 = 1672531200.0  # 2023-01-01T00:00Z
YEAR_S = 365.25 * 86400

FEATURES = [
    # Baseline/time
    "hour", "dow", "month", "years_since_2023",
    # Calendar & holidays
    "is_holiday", "school_holiday", "payday_window", "days_to_christmas",
    # Weather
    "temp_c", "precip_mm", "wind_ms",
    # Events
    "ev_active", "ev_pre", "ev_post", "ev_near_count",
    # Transit disruption
    "transit_disruption", "rail_late5_share", "rail_cancelled_share", "metro_late5_share",
    # Cruise
    "cruise_pax",
    # Christmas market
    "xmas_market",
]

GROUPS = {
    "Baseline/time": ["hour", "dow", "month", "years_since_2023"],
    "Calendar & holidays": ["is_holiday", "school_holiday", "payday_window", "days_to_christmas"],
    "Weather": ["temp_c", "precip_mm", "wind_ms"],
    "Events": ["ev_active", "ev_pre", "ev_post", "ev_near_count"],
    "Transit disruption": ["transit_disruption", "rail_late5_share", "rail_cancelled_share", "metro_late5_share"],
    "Cruise": ["cruise_pax"],
    "Christmas market": ["xmas_market"],
}

DEFINITIONS = {
    "hour": "Local hour 0-23 (Europe/Oslo).",
    "dow": "Local weekday, 0 = Monday .. 6 = Sunday.",
    "month": "Local month 1-12.",
    "years_since_2023": "(UTC epoch seconds - 2023-01-01T00:00Z) / (365.25 days). Slow trend.",
    "is_holiday": "1 if the local date is a Norwegian public holiday (date-holidays 'NO', type public).",
    "school_holiday": "1 in Oslo school holidays: ISO week 8, ISO week 40, Palm Sunday..Easter Monday, 21 Jun..17 Aug, 21 Dec..2 Jan.",
    "payday_window": "1 on payday and the 2 days after. Payday = the 20th, moved back to the previous weekday that is not a public holiday.",
    "days_to_christmas": "Days from the local date to 24 Dec of the same year, clipped to -7..60 (25 Dec = -1, 31 Dec = -7).",
    "temp_c": "Air temperature, deg C.",
    "precip_mm": "Precipitation in the hour, mm.",
    "wind_ms": "Wind speed, m/s.",
    "ev_active": "Sum over events active this hour (start <= t < end, within 3 km, not transit/cruise) of attendance * exp(-d/0.8 km) / max(3, duration h) / 100.",
    "ev_pre": "Sum over events (<= 12 h long, within 3 km) starting in (t, t+3h] of attendance * exp(-d/0.8 km) / 1000.",
    "ev_post": "Sum over events (<= 12 h long, within 3 km) that ended in (t-2h, t] of attendance * exp(-d/0.8 km) / 1000.",
    "ev_near_count": "Number of events active this hour within 1 km.",
    "transit_disruption": "1 if a transit-category event (within 10 km) or a transit situation (severity not slight/noImpact) is active this hour.",
    "rail_late5_share": "Share of rail calls in the hour more than 5 min late (Entur). NaN when unknown.",
    "rail_cancelled_share": "Share of rail calls in the hour cancelled (Entur). NaN when unknown.",
    "metro_late5_share": "Share of metro calls in the hour more than 5 min late (Entur). NaN when unknown.",
    "cruise_pax": "Sum of passengers (default 2500) of cruise ships in port this hour / 1000.",
    "xmas_market": "1 when Jul i Vinterland (Spikersuppa, ~0.3 km) is open: 7 Nov..3 Jan, closed 24 Dec. 2026 season listed as 7 Nov 2026 - 3 Jan 2027; same window assumed every year.",
}

# Neutral values used for saliency drivers (TS) and effect recovery (Python).
NEUTRAL = {
    "is_holiday": 0, "school_holiday": 0, "payday_window": 0, "days_to_christmas": 60,
    "temp_c": 12.0, "precip_mm": 0.0, "wind_ms": 3.0,
    "ev_active": 0, "ev_pre": 0, "ev_post": 0, "ev_near_count": 0,
    "transit_disruption": 0, "rail_late5_share": 0.05, "rail_cancelled_share": 0.0, "metro_late5_share": 0.05,
    "cruise_pax": 0, "xmas_market": 0,
}

_HOL = None


def holidays_set() -> set:
    global _HOL
    if _HOL is None:
        d = json.load(open(ROOT / "data" / "holidays-no.json"))
        _HOL = {x for v in d.values() for x in v}
    return _HOL


def easter(y: int) -> date:
    a = y % 19; b = y // 100; c = y % 100; d = b // 4; e = b % 4
    f = (b + 8) // 25; g = (b - f + 1) // 3; h = (19 * a + b - d - g + 15) % 30
    i = c // 4; k = c % 4; l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31; day = ((h + l - 7 * m + 114) % 31) + 1
    return date(y, month, day)


def is_school_holiday(d: date) -> int:
    wk = d.isocalendar()[1]
    if wk in (8, 40):
        return 1
    e = easter(d.year)
    if e - timedelta(days=7) <= d <= e + timedelta(days=1):
        return 1
    md = (d.month, d.day)
    if (6, 21) <= md <= (8, 17):
        return 1
    if md >= (12, 21) or md <= (1, 2):
        return 1
    return 0


def payday(y: int, m: int) -> date:
    hol = holidays_set()
    d = date(y, m, 20)
    while d.weekday() >= 5 or d.isoformat() in hol:
        d -= timedelta(days=1)
    return d


def calendar_feats(d: date) -> dict:
    hol = holidays_set()
    p = payday(d.year, d.month)
    dtx = (date(d.year, 12, 24) - d).days
    md = (d.month, d.day)
    return {
        "is_holiday": 1 if d.isoformat() in hol else 0,
        "school_holiday": is_school_holiday(d),
        "payday_window": 1 if 0 <= (d - p).days <= 2 else 0,
        "days_to_christmas": min(60, max(-7, dtx)),
        "xmas_market": 1 if ((11, 7) <= md or md <= (1, 3)) and md != (12, 24) else 0,
    }


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    p1 = math.radians(lat1); p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1); dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def iso_s(s: str) -> float:
    return pd.Timestamp(s).timestamp()


def situation_active(s: dict, t: float) -> bool:
    if s.get("severity") in ("slight", "noImpact"):
        return False
    a = iso_s(s["validFrom"]) if s.get("validFrom") else -math.inf
    b = iso_s(s["validTo"]) if s.get("validTo") else math.inf
    return a <= t < b


def build_features(times_s: np.ndarray, temp, precip, wind, events: list, situations: list, cruise: list,
                   rail_late5=None, rail_canc=None, metro_late5=None) -> pd.DataFrame:
    """times_s: UTC epoch seconds of each hour start. Returns DataFrame with FEATURES columns."""
    n = len(times_s)
    t = np.asarray(times_s, dtype=float)
    local = pd.to_datetime(t, unit="s", utc=True).tz_convert("Europe/Oslo")
    out = {
        "hour": local.hour.to_numpy().astype(float),
        "dow": local.dayofweek.to_numpy().astype(float),
        "month": local.month.to_numpy().astype(float),
        "years_since_2023": (t - EPOCH_2023) / YEAR_S,
    }
    dates = [date(y, m, d) for y, m, d in zip(local.year, local.month, local.day)]
    cache = {}
    cal = []
    for d in dates:
        if d not in cache:
            cache[d] = calendar_feats(d)
        cal.append(cache[d])
    for k in ["is_holiday", "school_holiday", "payday_window", "days_to_christmas", "xmas_market"]:
        out[k] = np.array([c[k] for c in cal], dtype=float)
    out["temp_c"] = np.asarray(temp, dtype=float)
    out["precip_mm"] = np.asarray(precip, dtype=float)
    out["wind_ms"] = np.asarray(wind, dtype=float)

    ev_active = np.zeros(n); ev_pre = np.zeros(n); ev_post = np.zeros(n); ev_near = np.zeros(n)
    transit = np.zeros(n)
    for e in events:
        s = iso_s(e["start"]); en = iso_s(e["end"])
        d = haversine_km(STORE_LAT, STORE_LON, e["lat"], e["lon"])
        cat = e["category"]
        active = (t >= s) & (t < en)
        if cat == "transit":
            if d <= 10:
                transit[active] = 1
            continue
        if cat == "cruise" or d > 3:
            continue
        A = e.get("expectedAttendance") or 500
        w = A * math.exp(-d / 0.8)
        dur_h = (en - s) / 3600.0
        ev_active += np.where(active, w / max(3.0, dur_h) / 100.0, 0.0)
        if dur_h <= 12:
            ev_pre += np.where((s > t) & (s <= t + 3 * 3600), w / 1000.0, 0.0)
            ev_post += np.where((en <= t) & (en > t - 2 * 3600), w / 1000.0, 0.0)
        if d <= 1:
            ev_near += active.astype(float)
    for sit in situations:
        a = iso_s(sit["validFrom"]) if sit.get("validFrom") else -math.inf
        b = iso_s(sit["validTo"]) if sit.get("validTo") else math.inf
        if sit.get("severity") in ("slight", "noImpact"):
            continue
        transit[(t >= a) & (t < b)] = 1
    cpax = np.zeros(n)
    for c in cruise:
        a = iso_s(c["arrival"]); b = iso_s(c["departure"])
        cpax += np.where((t >= a) & (t < b), (c.get("passengers") or 2500) / 1000.0, 0.0)

    out.update({"ev_active": ev_active, "ev_pre": ev_pre, "ev_post": ev_post, "ev_near_count": ev_near,
                "transit_disruption": transit, "cruise_pax": cpax})
    # No stats passed at all -> assume a typical hour (the NEUTRAL values). Passed but NaN -> unknown.
    out["rail_late5_share"] = np.full(n, NEUTRAL["rail_late5_share"]) if rail_late5 is None else np.asarray(rail_late5, dtype=float)
    out["rail_cancelled_share"] = np.full(n, NEUTRAL["rail_cancelled_share"]) if rail_canc is None else np.asarray(rail_canc, dtype=float)
    out["metro_late5_share"] = np.full(n, NEUTRAL["metro_late5_share"]) if metro_late5 is None else np.asarray(metro_late5, dtype=float)
    return pd.DataFrame({k: out[k] for k in FEATURES})


def is_open(hour: np.ndarray, dow: np.ndarray) -> np.ndarray:
    """Assumed opening hours: daily 10:00-01:00; Fri and Sat nights until 03:00.
    Hour 0 is open every day; hours 1-2 only on Sat/Sun mornings (Fri/Sat nights)."""
    hour = np.asarray(hour); dow = np.asarray(dow)
    return (hour >= 10) | (hour == 0) | (((hour == 1) | (hour == 2)) & ((dow == 5) | (dow == 6)))
