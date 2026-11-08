"""Cruise calls for Oslo as a PATTERN (not real ship calls), labelled as such.

Source of the shape: CruiseMapper, Oslo, July 2027 (from docs/bk-klingenberg-demand-calendar.md, item 12):
about 151 calls in July; 8 ships on 3 and 4 Jul, 7 ships on 22 and 26 Jul. Season May to Sep.
ASSUMPTION: the other months' totals (May 60, Jun 120, Aug 135, Sep 75) are a season shape, not counts.
Writes src/data/cruise-history.json (2023-01-01 .. 2026-11-07, model training) and
src/data/cruise-upcoming.json (2027 season, with the four July 2027 peak days exact).
Run: python3 -I scripts/data/cruise_pattern.py
"""
import json
from datetime import date, timedelta
from pathlib import Path

import random

ROOT = Path(__file__).resolve().parents[2]
MONTH_CALLS = {5: 60, 6: 120, 7: 151, 8: 135, 9: 75}
PEAKS_2027 = {date(2027, 7, 3): 8, date(2027, 7, 4): 8, date(2027, 7, 22): 7, date(2027, 7, 26): 7}
PAX = [1200, 2000, 2800, 3500, 4300]
SRC = [{"label": "PATTERN from CruiseMapper Oslo July 2027 (151 calls; May-Sep season shape assumed)",
        "url": "https://www.cruisemapper.com/ports/oslo-port-57?month=2027-07"}]


def month_days(y, m):
    d = date(y, m, 1); out = []
    while d.month == m:
        out.append(d); d += timedelta(days=1)
    return out


def season(y, rng, peaks=None):
    calls = []
    for m, total in MONTH_CALLS.items():
        days = month_days(y, m)
        fixed = {d: n for d, n in (peaks or {}).items() if d.month == m}
        counts = {d: 0 for d in days}; counts.update(fixed)
        rest = total - sum(fixed.values())
        free = [d for d in days if d not in fixed]
        # weekends get 1.4x weight (ASSUMPTION), spread by a seeded draw
        wts = [1.4 if d.weekday() >= 5 else 1.0 for d in free]
        for d in rng.choices(free, weights=wts, k=rest):
            counts[d] += 1
        for d, n in counts.items():
            for k in range(n):
                calls.append({"ship": f"pattern call {k + 1}", "berth": "Oslo cruise quays (pattern)",
                              "arrival": f"{d.isoformat()}T08:00:00+02:00", "departure": f"{d.isoformat()}T17:00:00+02:00",
                              "passengers": rng.choice(PAX), "pattern": True, "sources": SRC})
    return calls


rng = random.Random(7)
hist = [c for y in (2023, 2024, 2025, 2026) for c in season(y, rng)]
up = season(2027, random.Random(2027), PEAKS_2027)
(ROOT / "src/data/cruise-history.json").write_text(json.dumps(hist, indent=0))
(ROOT / "src/data/cruise-upcoming.json").write_text(json.dumps(up, indent=0))
jul = [c for c in up if c["arrival"][:7] == "2027-07"]
print("history calls", len(hist), "| 2027 calls", len(up), "| Jul 2027", len(jul),
      "| 3 Jul", sum(c["arrival"][:10] == "2027-07-03" for c in up), "| 22 Jul", sum(c["arrival"][:10] == "2027-07-22" for c in up))
