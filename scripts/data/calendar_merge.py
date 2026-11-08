"""Merge the owner's demand calendar (docs/bk-klingenberg-demand-calendar.md) into the event library.

Every calendar item with a date is checked against events-history.json + events-upcoming.json
(same keyword, start within +-1 day). Items already there are reported as "had"; the rest are
written to src/data/events-calendar.json with the calendar's source link and a dateStatus:
  confirmed = the calendar gives a firm date
  inferred  = the calendar says "inferred", "about", "probably" or the yearly pattern
  unverified = the calendar itself flags it as reported but not verified
TBD items without any date are listed but not added.
Run: python3 -I scripts/data/calendar_merge.py
"""
import json, sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOC = "docs/bk-klingenberg-demand-calendar.md"

S = {  # sources named in the calendar's "Main sources"
    "visit": ("Visit Oslo", "https://www.visitoslo.com/"),
    "ruter": ("Ruter: Det store T-baneløftet (closures)", "https://ruter.no/om-oss/prosjekter-og-innovasjon/det-store-t-baneloftet"),
    "banenor": ("Bane NOR traffic notices", "https://www.banenor.no/reise-og-trafikk/trafikkmeldinger/"),
    "ullevaal": ("Ullevaal Stadion", "https://www.ullevaal-stadion.no/"),
    "unity": ("Unity Arena events", "https://unityarena.no/arrangementer/"),
    "spektrum": ("Oslo Spektrum events", "https://www.oslospektrum.no/arrangementer/"),
    "school": ("Oslo kommune school holidays", "https://www.oslo.kommune.no/skole-og-utdanning/ferie-og-fridager/"),
    "cruise": ("CruiseMapper Oslo, July 2027", "https://www.cruisemapper.com/ports/oslo-port-57?month=2027-07"),
}

# venue coordinates (approximate, from OpenStreetMap)
V = {
    "radhus": (59.9117, 10.7339), "grand": (59.9133, 10.7405), "spikersuppa": (59.9140, 10.7370),
    "karljohan": (59.9138, 10.7385), "kontra": (59.9083, 10.7358), "tjuvholmen": (59.9068, 10.7214),
    "holmenkollen": (59.9637, 10.6676), "ullevaal": (59.9488, 10.7346), "unity": (59.8955, 10.6235),
    "spektrum": (59.9129, 10.7547), "nt": (59.9146, 10.7317), "oslos": (59.9111, 10.7528),
    "kino": (59.9135, 10.7325), "cruise": (59.9045, 10.7395), "stortinget": (59.9131, 10.7400),
    "domkirke": (59.9124, 10.7465), "bislett": (59.9250, 10.7330), "ekeberg": (59.8990, 10.7700),
    "tøyen": (59.9160, 10.7800), "konserthus": (59.9125, 10.7310), "centre": (59.9139, 10.7380),
}

def ev(id, title, cat, venue, d0, d1=None, t0="10:00", t1="22:00", att=None, src="visit", status="confirmed", match=None, impact=None, note=None):
    return dict(id=id, title=title, category=cat, venue=venue, d0=d0, d1=d1 or d0, t0=t0, t1=t1, att=att, src=src,
                status=status, match=match or [], impact=impact, note=note)

CAL = [
    # Impact 5
    ev("cal-nobel-2026-ceremony", "Nobel Peace Prize ceremony, Oslo City Hall (125th anniversary)", "ceremony", "radhus", "2026-12-10", t0="13:00", t1="15:00", match=["peace prize ceremony", "prisutdeling", "award ceremony"], impact=5),
    ev("cal-nobel-2026-torch", "Nobel torchlight march down Karl Johan to Grand Hotel", "ceremony", "grand", "2026-12-10", t0="17:30", t1="18:30", match=["torchlight", "fakkel"], impact=5),
    ev("cal-17mai-2027", "17 May 2027: children's parade on Karl Johan (also Whit Monday)", "holiday", "karljohan", "2027-05-17", t0="10:00", t1="13:30", att=60000, match=["17 may", "17. mai"], impact=5),
    ev("cal-pride-2027", "Oslo Pride 2027, Pride Park at Rådhusplassen (week)", "festival", "radhus", "2027-06-20", "2027-06-26", match=["pride"], impact=5),
    ev("cal-pride-parade-2027", "Oslo Pride parade on Karl Johan to Kontraskjæret", "festival", "kontra", "2027-06-26", t0="13:00", t1="17:00", att=90000, match=["pride parade"], impact=5, status="inferred", note="parade time inferred"),
    ev("cal-takethat-2027", "Take That open-air concert, Tjuvholmen (first show in Norway)", "concert", "tjuvholmen", "2027-06-18", t0="18:00", t1="23:00", match=["take that"], impact=5, src=None),
    ev("cal-holmenkollen-2027", "Holmenkollen FIS ski weekend (50 km men 13th, women 14th)", "sports", "holmenkollen", "2027-03-12", "2027-03-14", t0="09:00", t1="17:00", match=["holmenkollen"], impact=5),
    ev("cal-biathlon-2027", "Biathlon World Cup finale, Holmenkollen", "sports", "holmenkollen", "2027-03-16", "2027-03-21", t0="09:00", t1="17:00", match=["biathlon"], impact=5, status="inferred", note="start 15 or 16 Mar"),
    ev("cal-nor-wales-2026", "Norway vs Wales (men), Ullevaal", "sports", "ullevaal", "2026-11-14", t0="17:00", t1="20:00", att=27000, src="ullevaal", match=["wales"], impact=5, status="inferred", note="kick-off 17:00 or 18:00"),
    ev("cal-cupfinal-2027", "Men's cup final (NM-finalen), probably Ullevaal", "sports", "ullevaal", "2027-05-29", t0="15:00", t1="19:00", att=27000, src="ullevaal", match=["cup final", "nm-final", "cupfinale"], impact=5, status="inferred", note="venue probable"),
    # Impact 4: T-bane closures through the centre
    *[ev(f"cal-tbane-{a}", f"T-bane closed through the centre (Nationaltheatret, Stortinget, Jernbanetorget){' : ' + n if n else ''}", "transit", "nt", a, b, t0="00:00", t1="23:59", src="ruter",
         match=["t-bane closed through", "metro will be closed"], impact=4)
      for a, b, n in [("2026-11-19", "2026-11-22", ""), ("2027-02-25", "2027-02-28", ""), ("2027-03-26", "2027-03-29", "Easter"),
                      ("2027-05-04", "2027-05-07", "Ascension"), ("2027-07-01", "2027-07-04", ""), ("2027-08-12", "2027-08-15", "Øya")]],
    ev("cal-banenor-nights-2027", "No trains Oslo S to Lysaker on weekday nights (22:30 to 04:15)", "transit", "oslos", "2027-01-25", "2027-02-05", t0="22:30", t1="04:15", src="banenor", match=["lysaker"], impact=4),
    ev("cal-banenor-weekend-2027", "Oslo S to Lysaker closed all weekend", "transit", "oslos", "2027-01-30", "2027-01-31", t0="00:00", t1="23:59", src="banenor", match=["lysaker"], impact=4),
    ev("cal-oslos-summer-2027", "Oslo S closed to trains (reported, not verified)", "transit", "oslos", "2027-07-17", "2027-08-03", t0="00:00", t1="23:59", src="banenor", match=["oslo s closed"], impact=4, status="unverified"),
    ev("cal-films-2026-12-18", "Avengers: Doomsday and Dune: Part Three open (Klingenberg kino, Saga)", "cinema", "kino", "2026-12-18", "2026-12-20", t0="12:00", t1="23:59", match=["avengers", "dune"], impact=4, status="inferred", src=None, note="worldwide date; Norwegian date not confirmed"),
    ev("cal-blackfriday-2026", "Black Friday", "other", "centre", "2026-11-27", match=["black friday"], impact=4, src=None),
    *[ev(f"cal-sundayshop-{d}", "Shops open on Sunday before Christmas", "other", "centre", d, t0="12:00", t1="18:00", match=["sunday shop", "søndagsåpent"], impact=4, src=None)
      for d in ["2026-12-06", "2026-12-13", "2026-12-20"]],
    *[ev(f"cal-cruise-{d}", f"Cruise peak: {n} ships in Oslo", "cruise", "cruise", d, t0="08:00", t1="18:00", src="cruise", match=["cruise"], impact=4)
      for d, n in [("2027-07-03", 8), ("2027-07-04", 8), ("2027-07-22", 7), ("2027-07-26", 7)]],
    ev("cal-ramadan-2027", "Ramadan (lunch dips, rush after iftar)", "holiday", "centre", "2027-02-08", "2027-03-08", t0="00:00", t1="23:59", match=["ramadan"], impact=4, status="inferred", src=None, note="approximate, moon sighting"),
    ev("cal-eid-2027", "Eid al-Fitr, family day out", "holiday", "centre", "2027-03-09", "2027-03-10", match=["eid al"], impact=4, status="inferred", src=None),
    # Impact 3: walkable events, conferences, demos, school/russ
    ev("cal-russ-2027", "Russ celebration season (late-night groups)", "festival", "centre", "2027-04-15", "2027-05-17", t0="20:00", t1="03:00", match=["russ"], impact=3, status="inferred", src=None, note="mid-April start"),
    ev("cal-off-2027", "Oslo Freedom Forum", "conference", "centre", "2027-05-31", "2027-06-02", match=["freedom forum"], impact=3, src=None),
    ev("cal-musikkfest-2027", "Musikkfest Oslo", "festival", "centre", "2027-06-05", match=["musikkfest"], impact=3, status="inferred", src=None),
    ev("cal-jazz-2027", "Oslo Jazz Festival", "festival", "centre", "2027-08-16", "2027-08-21", t0="17:00", t1="23:59", match=["oslo jazz"], impact=3, src=None),
    ev("cal-marathon-2027", "Oslo Marathon, start and finish at Rådhusplassen", "sports", "radhus", "2027-09-11", t0="08:00", t1="16:00", match=["marathon", "maraton"], impact=3, status="inferred", src=None),
    ev("cal-kulturnatt-2027", "Kulturnatt Oslo", "festival", "centre", "2027-09-17", t0="17:00", t1="23:59", match=["kulturnatt"], impact=3, status="inferred", src=None),
    ev("cal-nho-2027", "NHO annual conference", "conference", "spektrum", "2027-01-07", match=["nho"], impact=3, src="spektrum"),
    ev("cal-norshipping-2027", "Nor-Shipping (fills central hotels)", "conference", "centre", "2027-06-07", "2027-06-11", match=["nor-shipping"], impact=3, src=None),
    ev("cal-obf-2027", "Oslo Business Forum", "conference", "centre", "2027-09-22", "2027-09-23", match=["business forum"], impact=3, src=None),
    ev("cal-8mars-2027", "8 March march (International Women's Day)", "protest", "stortinget", "2027-03-08", t0="16:00", t1="19:00", match=["8 march", "8. mars"], impact=3, status="inferred", src=None),
    ev("cal-1mai-2027", "1 May march (Labour Day)", "protest", "stortinget", "2027-05-01", t0="10:00", t1="15:00", match=["1 may", "1. mai"], impact=3, status="inferred", src=None),
    # Full arena list
    *[ev(f"cal-arena-{d}-{k}", f"{who}, {place}", cat, venue, d, t0="19:00", t1="22:30", att=att, src=src, match=[m], impact=3)
      for d, who, place, venue, att, src, m, k, cat in [
        ("2026-11-12", "J. Cole", "Unity Arena", "unity", 25000, "unity", "j. cole", "jcole", "concert"),
        ("2026-11-13", "Synne Vo", "Oslo Spektrum", "spektrum", 11500, "spektrum", "synne vo", "synne1", "concert"),
        ("2026-11-14", "Synne Vo", "Oslo Spektrum", "spektrum", 11500, "spektrum", "synne vo", "synne2", "concert"),
        ("2026-11-14", "The Prodigy", "Unity Arena", "unity", 25000, "unity", "prodigy", "prodigy", "concert"),
        ("2026-11-17", "Tove Lo", "Oslo Spektrum", "spektrum", 11500, "spektrum", "tove lo", "tovelo", "concert"),
        ("2026-11-20", "Marstein", "Oslo Spektrum", "spektrum", 11500, "spektrum", "marstein", "marstein", "concert"),
        ("2026-11-21", "Westlife", "Oslo Spektrum", "spektrum", 11500, "spektrum", "westlife", "westlife", "concert"),
        ("2026-11-27", "beabadoobee", "Oslo Spektrum", "spektrum", 11500, "spektrum", "beabadoobee", "bea", "concert"),
        ("2026-11-28", "Winnerbäck", "Oslo Spektrum", "spektrum", 11500, "spektrum", "winnerb", "winner", "concert"),
        ("2026-12-05", "Norway vs Wales (women)", "Ullevaal", "ullevaal", 27000, "ullevaal", "wales", "wwales", "sports"),
        ("2026-12-05", "Lise Davidsen", "Oslo Spektrum", "spektrum", 11500, "spektrum", "davidsen", "davidsen", "concert"),
        ("2026-12-11", "Emma Steinbakken", "Oslo Spektrum", "spektrum", 11500, "spektrum", "steinbakken", "emma1", "concert"),
        ("2026-12-12", "Emma Steinbakken", "Oslo Spektrum", "spektrum", 11500, "spektrum", "steinbakken", "emma2", "concert"),
        ("2026-12-11", "Christmas concerts", "Oslo Cathedral", "domkirke", None, None, "cathedral", "dom1", "concert"),
        ("2026-12-12", "Christmas concerts", "Oslo Cathedral", "domkirke", None, None, "cathedral", "dom2", "concert"),
        ("2026-12-13", "Christmas concerts", "Oslo Cathedral", "domkirke", None, None, "cathedral", "dom3", "concert"),
        ("2026-12-15", "Bøksle and Sølvguttene", "Oslo Spektrum", "spektrum", 11500, "spektrum", "sølvgutt", "bøksle", "concert"),
        ("2026-12-16", "Kurt Nilsen", "Oslo Spektrum", "spektrum", 11500, "spektrum", "kurt nilsen", "kurt1", "concert"),
        ("2026-12-17", "Kurt Nilsen", "Oslo Spektrum", "spektrum", 11500, "spektrum", "kurt nilsen", "kurt2", "concert"),
        ("2026-12-28", "Handball cup finals", "Oslo Spektrum", "spektrum", 9000, "spektrum", "handball", "handball", "sports"),
        ("2027-01-22", "Delara", "Oslo Spektrum", "spektrum", 11500, "spektrum", "delara", "delara", "concert"),
        ("2027-01-30", "Chris Holsten", "Oslo Spektrum", "spektrum", 11500, "spektrum", "holsten", "holsten", "concert"),
        ("2027-02-04", "Disney On Ice (to 7 Feb)", "Unity Arena", "unity", 10000, "unity", "disney", "disney", "other"),
        ("2027-02-13", "Broiler", "Unity Arena", "unity", 25000, "unity", "broiler", "broiler", "concert"),
        ("2027-02-18", "Wenche Myhre", "Unity Arena", "unity", 25000, "unity", "wenche", "wenche", "concert"),
        ("2027-02-19", "Five Finger Death Punch", "Unity Arena", "unity", 25000, "unity", "five finger", "ffdp", "concert"),
        ("2027-03-02", "Teddy Swims", "Unity Arena", "unity", 25000, "unity", "teddy swims", "teddy", "concert"),
        ("2027-03-16", "James Blunt", "Oslo Spektrum", "spektrum", 11500, "spektrum", "blunt", "blunt", "concert"),
        ("2027-03-23", "Brandi Carlile", "Oslo Spektrum", "spektrum", 11500, "spektrum", "carlile", "carlile", "concert"),
        ("2027-03-28", "Megadeth", "Oslo Spektrum", "spektrum", 11500, "spektrum", "megadeth", "megadeth", "concert"),
        ("2027-04-06", "Rush", "Unity Arena", "unity", 25000, "unity", "rush", "rush", "concert"),
        ("2027-04-23", "Simple Minds", "Oslo Spektrum", "spektrum", 11500, "spektrum", "simple minds", "sminds", "concert"),
        ("2027-04-24", "Hans Zimmer show", "Oslo Spektrum", "spektrum", 11500, "spektrum", "zimmer", "zimmer", "concert"),
        ("2027-04-29", "In Flames", "Oslo Spektrum", "spektrum", 11500, "spektrum", "in flames", "inflames", "concert"),
        ("2027-05-03", "Bryan Adams", "Oslo Spektrum", "spektrum", 11500, "spektrum", "bryan adams", "adams1", "concert"),
        ("2027-05-05", "Bryan Adams", "Oslo Spektrum", "spektrum", 11500, "spektrum", "bryan adams", "adams2", "concert"),
        ("2027-05-08", "sombr", "Unity Arena", "unity", 25000, "unity", "sombr", "sombr", "concert"),
        ("2027-05-29", "Weezer", "Oslo Spektrum", "spektrum", 11500, "spektrum", "weezer", "weezer", "concert"),
        ("2027-06-08", "Jorja Smith", "Oslo Spektrum", "spektrum", 11500, "spektrum", "jorja", "jorja", "concert"),
        ("2027-06-09", "André Rieu", "Oslo Spektrum", "spektrum", 11500, "spektrum", "rieu", "rieu", "concert"),
        ("2027-06-10", "Bislett Games (athletics)", "Bislett", "bislett", 15000, None, "bislett", "bislett", "sports"),
        ("2027-06-23", "Tons of Rock (to 26 Jun)", "Ekeberg", "ekeberg", 30000, None, "tons of rock", "tor", "festival"),
        ("2027-07-09", "Nickelback", "Unity Arena", "unity", 25000, "unity", "nickelback", "nickelback", "concert"),
        ("2027-07-28", "Santana", "Oslo Spektrum", "spektrum", 11500, "spektrum", "santana", "santana", "concert"),
        ("2027-09-10", "Ronan Keating", "Oslo Spektrum", "spektrum", 11500, "spektrum", "keating", "keating", "concert"),
        ("2027-10-06", "Till Lindemann", "Oslo Spektrum", "spektrum", 11500, "spektrum", "lindemann", "lindemann", "concert"),
    ]],
    ev("cal-oya-2027", "Øya festival", "festival", "tøyen", "2027-08-11", "2027-08-14", t0="14:00", t1="23:59", match=["øya"], impact=3, status="inferred", src=None),
]

TBD = ["Euro 2028 qualifiers at Ullevaal (draw 6 Dec 2026; windows only)", "T-bane closure, four days in Sep 2027",
       "Norway Cup 2027 (late July)", "Oslo Pix film festival (late August)", "Halv skatt month (Nov or Dec)",
       "Stadium concerts 2027 (none announced)"]

def load(p):
    try: return json.loads((ROOT / p).read_text())
    except Exception: return []

lib = load("src/data/events-history.json") + load("src/data/events-upcoming.json")

def found(c):
    d0 = date.fromisoformat(c["d0"]); d1 = date.fromisoformat(c["d1"])
    for e in lib:
        text = (e["title"] + " " + (e.get("venue") or "")).lower()
        try: s = datetime.fromisoformat(e["start"]).date(); en = datetime.fromisoformat(e["end"]).date()
        except Exception: continue
        if s <= d1 + timedelta(days=1) and en >= d0 - timedelta(days=1) and any(m in text for m in c["match"]):
            return e["title"]
    return None

def iso(d, t, end=False, d0=None):
    hh, mm = map(int, t.split(":"))
    dd = date.fromisoformat(d)
    # an end time earlier than the start rolls to the next day (night windows)
    if end and d0 and t < "06:00": dd = dd + timedelta(days=1)
    off = "+02:00" if 4 <= dd.month <= 9 or (dd.month == 3 and dd.day >= 28) or (dd.month == 10 and dd.day < 25) else "+01:00"
    return f"{dd.isoformat()}T{hh:02d}:{mm:02d}:00{off}"

had, added = [], []
for c in CAL:
    hit = found(c)
    if hit: had.append((c["d0"], c["title"], hit)); continue
    lat, lon = V[c["venue"]]
    srcs = []
    src = c["src"] or ("visit" if c["category"] in ("festival", "conference", "protest", "concert", "sports") else None)
    if src: srcs.append({"label": S[src][0], "url": S[src][1]})
    srcs.append({"label": "Owner demand calendar (docs/bk-klingenberg-demand-calendar.md)", "url": "/docs/bk-klingenberg-demand-calendar.md"})
    added.append({
        "id": c["id"], "title": c["title"], "category": c["category"], "venue": c["title"].split(", ")[-1] if c["venue"] in ("spektrum", "unity") else None,
        "lat": lat, "lon": lon, "start": iso(c["d0"], c["t0"]), "end": iso(c["d1"], c["t1"], end=True, d0=c["d0"]),
        **({"expectedAttendance": c["att"], "attendanceIsEstimate": True} if c["att"] else {}),
        "dateStatus": c["status"], "impact": c["impact"], **({"note": c["note"]} if c["note"] else {}),
        "sources": srcs,
    })

(ROOT / "src/data/events-calendar.json").write_text(json.dumps(added, ensure_ascii=False, indent=1))
print(f"HAD {len(had)}"); [print(f"  {d}  {t}   <= {h[:60]}") for d, t, h in had]
print(f"ADDED {len(added)}"); [print(f"  {e['start'][:10]}  [{e['dateStatus']}] {e['title']}") for e in added]
print("NOT ADDED (no date):"); [print("  " + t) for t in TBD]
