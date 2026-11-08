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
_STORE = json.load(open(ROOT.parent / "src" / "data" / "store.json"))  # single source, shared with the TS app
STORE_LAT, STORE_LON = _STORE["lat"], _STORE["lon"]
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
    # Crowds via Nationaltheatret (route-weighted, no distance cutoff)
    "crowd_nt_pre", "crowd_nt_post",
]

GROUPS = {
    "Baseline/time": ["hour", "dow", "month", "years_since_2023"],
    "Calendar & holidays": ["is_holiday", "school_holiday", "payday_window", "days_to_christmas"],
    "Weather": ["temp_c", "precip_mm", "wind_ms"],
    "Events": ["ev_active", "ev_pre", "ev_post", "ev_near_count"],
    "Transit disruption": ["transit_disruption", "rail_late5_share", "rail_cancelled_share", "metro_late5_share"],
    "Cruise": ["cruise_pax"],
    "Christmas market": ["xmas_market"],
    "Crowds via Nationaltheatret": ["crowd_nt_pre", "crowd_nt_post"],
}

# Venues whose crowds travel through Nationaltheatret (T-bane common tunnel or the rail tunnel), whatever the distance.
# ASSUMPTIONS (documented in docs/model.md): share = part of the crowd that passes Nationaltheatret on the way in or
# out; travelMin = typical ride from Nationaltheatret to the venue gate. Not measured; set from the route map.
#   Ullevaal: T-bane lines 4/5 stop at Ullevaal stadion, about 10 min via the common tunnel -> 0.35
#   Holmenkollen: line 1 (Holmenkollbanen) starts through Nationaltheatret, about 20 min -> 0.50
#   Unity Arena, Fornebu: trains via Nationaltheatret to Lysaker, then bus or walk, about 25 min -> 0.25
#   Bislett: tram 17/18 or walk; few use Nationaltheatret, about 10 min -> 0.15
#   Ekeberg: trams 13/19 from Jernbanetorget; few pass Nationaltheatret, about 20 min -> 0.10
ROUTE_VENUES = [
    {"name": "Ullevaal Stadion", "lat": 59.9488, "lon": 10.7346, "share": 0.35, "travelMin": 10},
    {"name": "Holmenkollen", "lat": 59.9637, "lon": 10.6676, "share": 0.50, "travelMin": 20},
    {"name": "Unity Arena, Fornebu", "lat": 59.8955, "lon": 10.6235, "share": 0.25, "travelMin": 25},
    {"name": "Bislett Stadion", "lat": 59.9250, "lon": 10.7330, "share": 0.15, "travelMin": 10},
    {"name": "Ekeberg", "lat": 59.8990, "lon": 10.7700, "share": 0.10, "travelMin": 20},
]
ROUTE_MATCH_KM = 0.8
ROUTE_PRE_S = 2 * 3600    # arrivals pass Nationaltheatret during the 2 h before (start - travel)
ROUTE_POST_S = 5400       # departures pass during the 1.5 h after (end + travel)


def route_venue(e: dict):
    """The route venue an event is held at (within 0.8 km), or None. Transit, cruise and protest events never count."""
    if e["category"] in ("transit", "cruise", "protest"):
        return None
    for v in ROUTE_VENUES:
        if haversine_km(v["lat"], v["lon"], e["lat"], e["lon"]) <= ROUTE_MATCH_KM:
            return v
    return None


MAX_EVENT_DAYS = 14  # longer items (Christmas market season, Ramadan, russ season) are not hourly events


def sessions(e: dict):
    """Real sessions of an event. Up to 12 h: one session. Longer: daily sessions with the same clock times,
    attendance counted per session. Over 14 days: none (handled by their own features or left out)."""
    s = iso_s(e["start"]); en = iso_s(e["end"]); dur = en - s
    if dur <= 12 * 3600:
        return [(s, en)]
    if dur > MAX_EVENT_DAYS * 86400:
        return []
    daily = dur % 86400 or 12 * 3600
    return [(s + k * 86400, s + k * 86400 + daily) for k in range(int(dur // 86400) + 1)]


def route_windows(e: dict, v: dict):
    """(pre windows, post windows, value). Events over 12 h are split into daily sessions with the same clock times."""
    sessions_ = sessions(e)
    tr = v["travelMin"] * 60
    pre = [(a - tr - ROUTE_PRE_S, a - tr) for a, _ in sessions_]
    post = [(b + tr, b + tr + ROUTE_POST_S) for _, b in sessions_]
    return pre, post, (e.get("expectedAttendance") or 500) * v["share"] / 1000.0

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
    "ev_active": "Sum over event sessions active this hour (within 3 km, not transit/cruise) of attendance * exp(-d/0.8 km) / max(3, session h) / 100. Events over 12 h count as daily sessions; items over 14 days are left out.",
    "ev_pre": "Sum over events (<= 12 h long, within 3 km) starting in (t, t+3h] of attendance * exp(-d/0.8 km) / 1000.",
    "ev_post": "Sum over events (<= 12 h long, within 3 km) that ended in (t-2h, t] of attendance * exp(-d/0.8 km) / 1000.",
    "ev_near_count": "Number of events active this hour within 1 km.",
    "transit_disruption": "1 if a transit-category event (within 10 km) or a transit situation (severity not slight/noImpact) is active this hour.",
    "rail_late5_share": "Share of rail calls in the hour more than 5 min late (Entur). NaN when unknown.",
    "rail_cancelled_share": "Share of rail calls in the hour cancelled (Entur). NaN when unknown.",
    "metro_late5_share": "Share of metro calls in the hour more than 5 min late (Entur). NaN when unknown.",
    "cruise_pax": "Sum of passengers (default 2500) of cruise ships in port this hour / 1000.",
    "crowd_nt_pre": "Sum over events at a route venue (Ullevaal, Holmenkollen, Unity Arena, Bislett, Ekeberg; no distance cutoff) of attendance x route share / 1000, when the hour overlaps [start - travel - 2 h, start - travel). Shares and travel times are assumptions (ROUTE_VENUES).",
    "crowd_nt_post": "Same sum when the hour overlaps [end + travel, end + travel + 1.5 h). Events over 12 h count as daily sessions.",
    "xmas_market": "1 when Jul i Vinterland (Spikersuppa, ~0.3 km) is open: 7 Nov..3 Jan, closed 24 Dec. 2026 season listed as 7 Nov 2026 - 3 Jan 2027; same window assumed every year.",
}

# Neutral values used for saliency drivers (TS) and effect recovery (Python).
NEUTRAL = {
    "is_holiday": 0, "school_holiday": 0, "payday_window": 0, "days_to_christmas": 60,
    "temp_c": 12.0, "precip_mm": 0.0, "wind_ms": 3.0,
    "ev_active": 0, "ev_pre": 0, "ev_post": 0, "ev_near_count": 0,
    "transit_disruption": 0, "rail_late5_share": 0.05, "rail_cancelled_share": 0.0, "metro_late5_share": 0.05,
    "cruise_pax": 0, "xmas_market": 0, "crowd_nt_pre": 0, "crowd_nt_post": 0,
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
    transit = np.zeros(n); crowd_pre = np.zeros(n); crowd_post = np.zeros(n)
    for e in events:
        rv = route_venue(e)
        if rv is not None:
            pre, post, val = route_windows(e, rv)
            for a, b in pre:
                crowd_pre += np.where((a < t + 3600) & (b > t), val, 0.0)
            for a, b in post:
                crowd_post += np.where((a < t + 3600) & (b > t), val, 0.0)
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
        for s, en in sessions(e):
            active = (t >= s) & (t < en)
            dur_h = (en - s) / 3600.0
            ev_active += np.where(active, w / max(3.0, dur_h) / 100.0, 0.0)
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
                "transit_disruption": transit, "cruise_pax": cpax,
                "crowd_nt_pre": crowd_pre, "crowd_nt_post": crowd_post})
    # No stats passed at all -> assume a typical hour (the NEUTRAL values). Passed but NaN -> unknown.
    out["rail_late5_share"] = np.full(n, NEUTRAL["rail_late5_share"]) if rail_late5 is None else np.asarray(rail_late5, dtype=float)
    out["rail_cancelled_share"] = np.full(n, NEUTRAL["rail_cancelled_share"]) if rail_canc is None else np.asarray(rail_canc, dtype=float)
    out["metro_late5_share"] = np.full(n, NEUTRAL["metro_late5_share"]) if metro_late5 is None else np.asarray(metro_late5, dtype=float)
    return pd.DataFrame({k: out[k] for k in FEATURES})


def is_open(hour: np.ndarray, dow: np.ndarray) -> np.ndarray:
    """Real opening hours (owner calendar, docs/bk-klingenberg-demand-calendar.md):
    Mon-Thu 10:00-24:00, Fri-Sat 10:00-04:00, Sun 11:00-24:00.
    Hours 0-3 are open only on Sat and Sun mornings (the Fri and Sat nights)."""
    hour = np.asarray(hour); dow = np.asarray(dow)
    day = (hour >= 10) & ~((dow == 6) & (hour == 10))
    night = (hour <= 3) & ((dow == 5) | (dow == 6))
    return day | night
