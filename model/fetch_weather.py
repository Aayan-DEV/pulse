"""Build model/data/weather_hourly.csv (UTC hourly): MET Norway Frost (Oslo Blindern SN18700)
with gaps filled from the Open-Meteo archive (model/data/weather.json, fetched in UTC).

The Frost client id is read from ../.env.local at runtime and never printed or stored.
"""
import json
import os
import sys
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"


def client_id() -> str | None:
    env = ROOT.parent / ".env.local"
    if not env.exists():
        return None
    for line in env.read_text().splitlines():
        if line.startswith("FROST_CLIENT_ID="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def fetch_frost(start: str, end: str) -> pd.DataFrame:
    cid = client_id()
    if not cid:
        return pd.DataFrame()
    rows = []
    periods = pd.date_range(start, end, freq="6MS").tolist() + [pd.Timestamp(end)]
    for a, b in zip(periods[:-1], periods[1:]):
        url = "https://frost.met.no/observations/v0.jsonld"
        params = {
            "sources": "SN18700",
            "elements": "air_temperature,sum(precipitation_amount PT1H),wind_speed",
            "referencetime": f"{a.date()}/{b.date()}",
            "timeresolutions": "PT1H",
        }
        r = requests.get(url, params=params, auth=(cid, ""), timeout=120)
        if r.status_code != 200:
            print("frost", a.date(), r.status_code, file=sys.stderr)
            continue
        for obs in r.json().get("data", []):
            t = obs["referenceTime"]
            rec = {"time": t}
            for o in obs["observations"]:
                el = o["elementId"]
                # keep the first (preferred) observation per element
                key = {"air_temperature": "tempC", "sum(precipitation_amount PT1H)": "precipMm", "wind_speed": "windMs"}[el]
                rec.setdefault(key, o["value"])
            rows.append(rec)
        print("frost", a.date(), "ok", file=sys.stderr)
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    df["time"] = pd.to_datetime(df["time"], utc=True).dt.floor("h")
    return df.groupby("time").first()


def main():
    om = json.load(open(DATA / "weather.json"))["hourly"]
    omdf = pd.DataFrame({
        "time": pd.to_datetime(om["time"]).tz_localize("UTC"),
        "tempC": om["temperature_2m"], "precipMm": om["precipitation"], "windMs": om["wind_speed_10m"],
    }).set_index("time")
    end = (omdf.index.max() + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    fr = fetch_frost("2023-01-01", end)
    out = omdf.copy()
    filled = {}
    if len(fr):
        fr = fr.reindex(omdf.index)
        for c in ["tempC", "precipMm", "windMs"]:
            filled[c] = float(fr[c].isna().mean()) if c in fr else 1.0
            if c in fr:
                out[c] = fr[c].where(fr[c].notna(), omdf[c])
        source = "MET Norway Frost, Oslo Blindern SN18700, CC BY 4.0 (the Frost API response still links CC BY 3.0 NO); gaps filled from the Open-Meteo archive"
    else:
        filled = {c: 1.0 for c in ["tempC", "precipMm", "windMs"]}
        source = "Open-Meteo archive (ERA5-based reanalysis) at the store coordinates"
    out = out.astype(float).round(2)
    out.reset_index().to_csv(DATA / "weather_hourly.csv", index=False)
    json.dump({"source": source, "gapFillShare": filled, "rows": len(out)}, open(DATA / "weather_meta.json", "w"), indent=1)
    print(source, filled, len(out))


if __name__ == "__main__":
    main()
