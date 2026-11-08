"""Fill missing attendance in events-history.json with labelled estimates (typical public figures, not ticket counts).
Run: python3 -I scripts/data/event_attendance.py"""
import json
from pathlib import Path

P = Path(__file__).resolve().parents[2] / "src/data/events-history.json"
EST = [  # (id contains, people per day or session, why)
    ("norway-cup", 25000, "players, coaches and parents per day; Norway Cup reports about 30 000 players over the week"),
    ("oyafestivalen", 20000, "about 20 000 festival guests per day"),
    ("nobel-peace-prize", 1000, "City Hall ceremony seats about 1 000 guests"),
    ("nobel-torchlight", 5000, "torchlight procession, typical crowd"),
    ("christmas-tree-lighting", 3000, "tree lighting crowd on Karl Johan"),
    ("new-year-light-show", 20000, "Rådhusplassen New Year show crowd"),
    ("oslo-pride-parade", 50000, "parade participants plus spectators"),
    ("peoples-peace-prize", 5000, "outdoor stage crowd at Rådhusplassen"),
    ("holmenkollen-ski-festival", 30000, "same as the other Holmenkollen years"),
]
ev = json.loads(P.read_text()); n = 0
for e in ev:
    if e.get("expectedAttendance") or e["category"] in ("transit", "market"):
        continue
    for key, a, why in EST:
        if key in e["id"]:
            e["expectedAttendance"] = a; e["attendanceIsEstimate"] = True
            e["note"] = ((e.get("note") or "") + f" Attendance {a} is an estimate: {why}.").strip(); n += 1
            break
P.write_text(json.dumps(ev, ensure_ascii=False, indent=1))
print("filled", n)
