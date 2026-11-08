"""Load the driver inputs (weather, events, cruise, transit stats). Falls back to small,
clearly-labelled lists when the data agent's files are not there yet."""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
APP = ROOT.parent
DATA = ROOT / "data"
START = "2023-01-01"
END = "2026-11-07 23:00"


def load_weather() -> pd.DataFrame:
    w = pd.read_csv(DATA / "weather_hourly.csv", parse_dates=["time"])
    w["time"] = pd.to_datetime(w["time"], utc=True)
    return w.set_index("time")


def _fallback_events() -> list:
    ev = []
    src = [{"label": "Recurring public date (fallback list in model/inputs.py)", "url": "https://www.oslo.kommune.no/"}]
    for y in (2023, 2024, 2025, 2026):
        ev.append({"id": f"fb-17mai-{y}", "title": "17. mai (national day) on Karl Johans gate", "category": "holiday",
                   "lat": 59.9133, "lon": 10.7389, "start": f"{y}-05-17T08:00:00+02:00", "end": f"{y}-05-17T20:00:00+02:00",
                   "expectedAttendance": 100000, "attendanceIsEstimate": True, "sources": src})
        ev.append({"id": f"fb-nobel-{y}", "title": "Nobel Peace Prize ceremony (City Hall)", "category": "ceremony",
                   "lat": 59.9119, "lon": 10.7336, "start": f"{y}-12-10T13:00:00+01:00", "end": f"{y}-12-10T15:00:00+01:00",
                   "expectedAttendance": 1000, "attendanceIsEstimate": True, "sources": src})
        ev.append({"id": f"fb-nobeltorch-{y}", "title": "Nobel torchlight procession", "category": "ceremony",
                   "lat": 59.9139, "lon": 10.7330, "start": f"{y}-12-10T18:30:00+01:00", "end": f"{y}-12-10T20:00:00+01:00",
                   "expectedAttendance": 5000, "attendanceIsEstimate": True, "sources": src})
    return ev


def load_events() -> tuple[list, str]:
    p = APP / "src" / "data" / "events-history.json"
    if p.exists():
        try:
            ev = json.load(open(p))
            if isinstance(ev, dict):
                ev = ev.get("events", [])
            ev = [e for e in ev if all(k in e for k in ("lat", "lon", "start", "end", "category"))]
            if ev:
                return ev, f"src/data/events-history.json ({len(ev)} events)"
        except Exception:
            pass
    return _fallback_events(), "fallback list of recurring dates (events-history.json missing)"


def load_cruise() -> tuple[list, str]:
    p = APP / "src" / "data" / "cruise-history.json"
    if p.exists():
        try:
            c = json.load(open(p))
            if isinstance(c, dict):
                c = c.get("calls", c.get("cruise", []))
            c = [x for x in c if "arrival" in x and "departure" in x]
            if c:
                return c, f"src/data/cruise-history.json ({len(c)} calls)"
        except Exception:
            pass
    # Simulated seasonal pattern: May-Sep, ~55% of days a ship, 08:00-17:00 local.
    rng = np.random.default_rng(7)
    calls = []
    for d in pd.date_range(START, END[:10], freq="D"):
        if d.month in (5, 6, 7, 8, 9) and rng.random() < 0.55:
            pax = int(rng.choice([1200, 2000, 2800, 3500, 4300]))
            calls.append({"ship": "simulated", "arrival": f"{d.date()}T08:00:00+02:00",
                          "departure": f"{d.date()}T17:00:00+02:00", "passengers": pax,
                          "sources": [{"label": "SIMULATED seasonal pattern", "url": "about:blank"}]})
    return calls, "SIMULATED seasonal cruise pattern (cruise-history.json missing)"


def load_transit_stats(index: pd.DatetimeIndex) -> tuple[pd.DataFrame | None, str]:
    """Hourly per-mode Entur stats -> rail_late5_share, rail_cancelled_share, metro_late5_share."""
    df = None
    for p in [APP / "src" / "data" / "transit-history.json", DATA / "transit-history.parquet", DATA / "transit-history.csv"]:
        if p.exists():
            try:
                if p.suffix == ".json":
                    raw = json.load(open(p))
                    if isinstance(raw, dict):
                        raw = raw.get("rows", raw.get("data", []))
                    df = pd.DataFrame(raw)
                elif p.suffix == ".parquet":
                    df = pd.read_parquet(p)
                else:
                    df = pd.read_csv(p)
                src = str(p.relative_to(APP))
                break
            except Exception:
                df = None
    if df is None or not len(df):
        return None, "none (transit-history missing)"
    df["t"] = pd.to_datetime(df["t"], utc=True).dt.floor("h")
    if "stop" in df:
        df = df[df["stop"].astype(str) == "NT"]  # Nationaltheatret only
    df["mode"] = df["mode"].astype(str).str.lower()
    df["calls"] = df["calls"].astype(float).clip(lower=1)
    df["late5n"] = df["late5Share"].astype(float).fillna(0) * df["calls"]
    df["cancn"] = df["cancelled"].astype(float)  # a count of cancelled calls
    g = df.groupby(["mode", "t"])[["calls", "late5n", "cancn"]].sum()
    out = pd.DataFrame(index=index)
    rail = g.loc["rail"] if "rail" in g.index.get_level_values(0) else None
    metro = g.loc["metro"] if "metro" in g.index.get_level_values(0) else None
    out["rail_late5_share"] = (rail.late5n / rail.calls).reindex(index) if rail is not None else np.nan
    out["rail_cancelled_share"] = (rail.cancn / rail.calls).clip(upper=1).reindex(index) if rail is not None else np.nan
    out["metro_late5_share"] = (metro.late5n / metro.calls).reindex(index) if metro is not None else np.nan
    return out, f"{src} ({len(df)} rows, real Entur SIRI-ET)"
