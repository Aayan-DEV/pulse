"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Store, TrainFront, Camera as CameraIcon, CalendarDays, Ship, Landmark, Clapperboard,
  Building2, Wine, ShoppingBag, MapPin, Hotel, School, AlertTriangle, CloudSun, Utensils,
} from "lucide-react";
import type { Place, LiveSnapshot, CityEvent, Camera, PlaceCategory } from "@/lib/types";
import { STORE } from "@/lib/types";

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

const PLACE_ICON: Record<PlaceCategory, React.ElementType> = {
  transit: TrainFront, venue: Landmark, museum: Landmark, cinema: Clapperboard, office: Building2,
  nightlife: Wine, market: ShoppingBag, landmark: MapPin, port: Ship, competitor: Utensils,
  school: School, hotel: Hotel,
};

const svg = (I: React.ElementType) => renderToStaticMarkup(<I />);

function circle(lat: number, lon: number, radiusM: number, n = 96) {
  const coords: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const dLat = (radiusM / 111320) * Math.cos(a);
    const dLon = (radiusM / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.sin(a);
    coords.push([lon + dLon, lat + dLat]);
  }
  return coords;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const srcLinks = (sources: { label: string; url: string }[]) =>
  sources.slice(0, 2).map((s) => `<a class="ak-link" href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.label)}</a>`).join(" · ");
const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });

type Layer = "places" | "events" | "cameras" | "rings" | "vehicles";

export default function LiveMap({ places }: { places: Place[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Record<string, maplibregl.Marker[]>>({ places: [], events: [], cameras: [] });
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ places: true, events: true, cameras: true, rings: true, vehicles: true });
  const [ready, setReady] = useState(0);
  const [camTick, setCamTick] = useState(0);

  // Live snapshot every 60 s.
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch("/api/live", { cache: "no-store" });
        if (!r.ok) throw new Error(`Live data answered ${r.status}`);
        const j = (await r.json()) as LiveSnapshot;
        if (!stop) { setLive(j); setLiveErr(null); }
      } catch (e) {
        if (!stop) setLiveErr(e instanceof Error ? e.message : "Live data is not reachable");
      }
    };
    load();
    const t = setInterval(load, 60_000);
    const c = setInterval(() => setCamTick((x) => x + 1), 30_000);
    return () => { stop = true; clearInterval(t); clearInterval(c); };
  }, []);

  // Map, restyled when the theme changes.
  useEffect(() => {
    if (!el.current) return;
    const theme = (document.documentElement.dataset.theme as "light" | "dark") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const m = new maplibregl.Map({
      container: el.current, style: STYLE[theme], center: [STORE.lon, STORE.lat],
      zoom: 14.6, pitch: 45, bearing: -12, attributionControl: { compact: true },
    });
    if (window.innerWidth > 768) m.setPadding({ left: 360, top: 0, right: 0, bottom: 0 });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    const addRings = () => {
      if (m.getSource("rings")) return;
      m.addSource("rings", { type: "geojson", data: { type: "FeatureCollection", features: [500, 1000, 2000].map((r) => ({
        type: "Feature", properties: { r }, geometry: { type: "LineString", coordinates: circle(STORE.lat, STORE.lon, r) },
      })) } });
      m.addLayer({ id: "rings", type: "line", source: "rings", paint: { "line-color": "#d9622b", "line-width": 1.2, "line-dasharray": [2, 2], "line-opacity": 0.7 } });
      setReady((x) => x + 1);
    };
    m.on("load", addRings);
    m.on("styledata", () => { if (m.isStyleLoaded()) addRings(); });
    const onTheme = (e: Event) => m.setStyle(STYLE[(e as CustomEvent).detail as "light" | "dark"]);
    window.addEventListener("pulse-theme", onTheme);

    // Store marker
    const sEl = document.createElement("div");
    sEl.className = "mk mk--store";
    sEl.innerHTML = `<span class="mk-pulse"></span>${svg(Store)}`;
    new maplibregl.Marker({ element: sEl }).setLngLat([STORE.lon, STORE.lat]).setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(
      `<b>${STORE.name}</b><div class="faint">${STORE.address}</div><div style="margin-top:6px">45 employees (brreg ${STORE.orgNumber}). Nationaltheatret station is next door.</div>`,
    )).addTo(m);
    map.current = m;
    return () => { window.removeEventListener("pulse-theme", onTheme); m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current; if (!m || !m.getLayer("rings")) return;
    m.setLayoutProperty("rings", "visibility", layers.rings ? "visible" : "none");
  }, [layers.rings, ready]);

  // Live trains and buses, every 15 s.
  const [vehCount, setVehCount] = useState<number | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const m = map.current; if (!m) return;
      try {
        const j = await (await fetch("/api/vehicles", { cache: "no-store" })).json() as { vehicles: { lat: number; lon: number; line: string; mode: string; destination: string; delayMin: number | null; operator: string }[] };
        if (stop || !m.isStyleLoaded()) return;
        const data = { type: "FeatureCollection" as const, features: j.vehicles.map((v) => ({
          type: "Feature" as const, properties: { label: v.line || v.mode, mode: v.mode, late: (v.delayMin ?? 0) >= 3 ? 1 : 0, info: `${v.operator} ${v.line} to ${v.destination}${v.delayMin != null ? `, ${v.delayMin >= 0 ? "+" : ""}${v.delayMin} min` : ""}` },
          geometry: { type: "Point" as const, coordinates: [v.lon, v.lat] },
        })) };
        const src = m.getSource("vehicles") as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData(data);
        else {
          m.addSource("vehicles", { type: "geojson", data });
          m.addLayer({ id: "vehicles", type: "circle", source: "vehicles", paint: {
            "circle-radius": 7, "circle-color": ["case", ["==", ["get", "late"], 1], "#a32d1d", ["==", ["get", "mode"], "RAIL"], "#0a0a0a", "#8a5a00"],
            "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
          m.addLayer({ id: "vehicles-label", type: "symbol", source: "vehicles", layout: { "text-field": ["get", "label"], "text-size": 11, "text-offset": [0, 1.4], "text-font": ["Noto Sans Regular"] }, paint: { "text-color": "#0a0a0a", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
          m.on("click", "vehicles", (e) => {
            const f = e.features?.[0]; if (!f) return;
            new maplibregl.Popup({ offset: 10 }).setLngLat(e.lngLat).setHTML(`<b>${esc(String(f.properties.info))}</b><div class="faint">Live position · Entur</div>`).addTo(m);
          });
        }
        m.setLayoutProperty("vehicles", "visibility", layersRef.current.vehicles ? "visible" : "none");
        m.setLayoutProperty("vehicles-label", "visibility", layersRef.current.vehicles ? "visible" : "none");
        setVehCount(j.vehicles.length);
      } catch { /* the side panel already reports live-data errors */ }
    };
    const t0 = setTimeout(load, 1500);
    const t = setInterval(load, 15_000);
    return () => { stop = true; clearTimeout(t0); clearInterval(t); };
  }, [ready]);
  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
    const m = map.current; if (!m || !m.getLayer("vehicles")) return;
    m.setLayoutProperty("vehicles", "visibility", layers.vehicles ? "visible" : "none");
    m.setLayoutProperty("vehicles-label", "visibility", layers.vehicles ? "visible" : "none");
  }, [layers]);

  // Places
  useEffect(() => {
    const m = map.current; if (!m) return;
    markers.current.places.forEach((mk) => mk.remove());
    markers.current.places = [];
    if (!layers.places) return;
    for (const p of places) {
      if (p.id === STORE.id) continue;
      const d = document.createElement("div");
      d.className = `mk mk--place${p.category === "transit" ? " mk--transit" : ""}`;
      d.innerHTML = svg(PLACE_ICON[p.category] ?? MapPin);
      const html = `<b>${esc(p.name)}</b><div class="faint">${esc(p.category)}${p.distanceM ? ` · ${Math.round(p.distanceM)} m from the store` : ""}</div>${p.note ? `<div style="margin-top:6px">${esc(p.note)}</div>` : ""}${p.capacity ? `<div class="faint">Capacity ${p.capacity.toLocaleString("en")}</div>` : ""}<div style="margin-top:6px">${srcLinks(p.sources)}</div>`;
      markers.current.places.push(new maplibregl.Marker({ element: d }).setLngLat([p.lon, p.lat]).setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(html)).addTo(m));
    }
  }, [places, layers.places]);

  // Events
  useEffect(() => {
    const m = map.current; if (!m) return;
    markers.current.events.forEach((mk) => mk.remove());
    markers.current.events = [];
    if (!layers.events || !live) return;
    for (const e of live.events) {
      const d = document.createElement("div");
      d.className = "mk mk--event";
      d.innerHTML = svg(e.category === "cruise" ? Ship : CalendarDays);
      const html = `<b>${esc(e.title)}</b><div class="faint">${esc(e.venue ?? e.category)}</div><div style="margin-top:6px">${fmtTime(e.start)} to ${hhmm(e.end)}</div>${e.expectedAttendance ? `<div>${e.attendanceIsEstimate ? "About " : ""}${e.expectedAttendance.toLocaleString("en")} people</div>` : ""}<div style="margin-top:6px">${srcLinks(e.sources)}</div>`;
      markers.current.events.push(new maplibregl.Marker({ element: d }).setLngLat([e.lon, e.lat]).setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(html)).addTo(m));
    }
  }, [live, layers.events]);

  // Cameras
  useEffect(() => {
    const m = map.current; if (!m) return;
    markers.current.cameras.forEach((mk) => mk.remove());
    markers.current.cameras = [];
    if (!layers.cameras || !live) return;
    for (const c of live.cameras) {
      const d = document.createElement("div");
      d.className = "mk mk--camera";
      d.innerHTML = svg(CameraIcon);
      const html = `<b>${esc(c.name)}</b><div class="faint">${c.distanceM ? `${Math.round(c.distanceM)} m from the store · ` : ""}refreshes every 30 s</div><img src="${esc(c.imageUrl)}${c.imageUrl.includes("?") ? "&" : "?"}t=${Date.now()}" alt="Live camera ${esc(c.name)}" style="width:280px;margin-top:8px;border-radius:4px;display:block"/><div style="margin-top:6px">${srcLinks(c.sources)}</div>`;
      markers.current.cameras.push(new maplibregl.Marker({ element: d }).setLngLat([c.lon, c.lat]).setPopup(new maplibregl.Popup({ offset: 14, maxWidth: "320px" }).setHTML(html)).addTo(m));
    }
  }, [live, layers.cameras]);

  const flyTo = (lat: number, lon: number) => map.current?.flyTo({ center: [lon, lat], zoom: 16.5 });
  const w = live?.weather;
  const obs = (w as LiveSnapshot["weather"] & { observed?: { tempC: number; precipMm: number; windMs: number; time: string; station?: string } })?.observed;

  const todayEvents = useMemo(() => (live?.events ?? []).slice().sort((a, b) => a.start.localeCompare(b.start)).slice(0, 12), [live]);

  return (
    <div className="map-wrap">
      <div ref={el} style={{ position: "absolute", inset: 0 }} />

      <div className="ak-panel map-side">
        <div className="ak-panel-head">
          <div>
            <h2 className="ak-h">Around the store now</h2>
            <p className="ak-note">{live ? `Updated ${hhmm(live.fetchedAt)} · refreshes every minute` : liveErr ?? "Loading live data"}</p>
          </div>
        </div>
        <div className="ak-panel-scroll">
          {liveErr && <div className="ak-error" style={{ margin: 12 }}>{liveErr}. The map still shows places.</div>}
          {!live && !liveErr && <div className="ak-panel-body"><span className="ak-skel" /><br /><span className="ak-skel" /></div>}
          {live && (
            <>
              <Section title="Weather" icon={CloudSun}>
                {w?.now ? (
                  <div className="ak-row"><div>
                    <div className="ak-row-title">{Math.round(w.now.tempC)}°C, {w.now.precipMm} mm rain, wind {w.now.windMs} m/s</div>
                    <div className="ak-row-why">Forecast for this hour · {w.source.label}</div>
                    {obs && <div className="ak-row-why">Observed {obs.tempC}°C at {obs.station ?? "Oslo Blindern"} ({hhmm(obs.time)}) · MET Norway Frost</div>}
                  </div></div>
                ) : <div className="ak-empty">No weather right now.</div>}
              </Section>
              <Section title={`Disruptions (${live.transit.situations.length})`} icon={AlertTriangle}>
                {live.transit.situations.length === 0 && <div className="ak-row"><div className="ak-row-why">No disruption notices for the nearby stops right now.</div></div>}
                {live.transit.situations.slice(0, 6).map((s) => (
                  <div className="ak-row" key={s.id}><div>
                    <div className="ak-row-title is-bad">{s.summary}</div>
                    {s.description && <div className="ak-row-why">{s.description.slice(0, 160)}</div>}
                  </div></div>
                ))}
              </Section>
              <Section title="Next departures, Nationaltheatret" icon={TrainFront}>
                {live.transit.departures.slice(0, 10).map((d, i) => (
                  <div className="ak-row" key={i}>
                    <div>
                      <div className="ak-row-title"><span className="ak-pill ak-pill--line" style={{ marginRight: 6 }}>{d.mode} {d.line}</span>{d.destination}</div>
                    </div>
                    <div className={`ak-row-n ${d.cancelled ? "is-bad" : d.delayMin >= 3 ? "is-warn" : ""}`} style={{ fontSize: 13 }}>
                      {d.cancelled ? "Cancelled" : hhmm(d.expected)}{!d.cancelled && d.delayMin >= 1 ? ` +${d.delayMin}` : ""}
                    </div>
                  </div>
                ))}
              </Section>
              <Section title={`Events in the next 7 days (${live.events.length})`} icon={CalendarDays}>
                {todayEvents.length === 0 && <div className="ak-row"><div className="ak-row-why">No events found.</div></div>}
                {todayEvents.map((e: CityEvent) => (
                  <button className="ak-row" key={e.id} onClick={() => flyTo(e.lat, e.lon)} style={{ width: "100%", textAlign: "left", background: "none", border: 0, borderTop: "1px solid var(--od-surface-2)", cursor: "pointer", font: "inherit", color: "inherit" }}>
                    <div><div className="ak-row-title">{e.title}</div><div className="ak-row-why">{e.venue ?? e.category} · {fmtTime(e.start)}</div></div>
                    <div className="ak-row-n" style={{ fontSize: 13 }}>{e.expectedAttendance ? e.expectedAttendance.toLocaleString("en") : ""}</div>
                  </button>
                ))}
              </Section>
              <Section title={`Live cameras (${live.cameras.length})`} icon={CameraIcon}>
                {live.cameras.map((c: Camera) => (
                  <button key={c.id} onClick={() => flyTo(c.lat, c.lon)} style={{ display: "block", width: "100%", padding: "8px 20px", background: "none", border: 0, cursor: "pointer", textAlign: "left", color: "inherit", font: "inherit" }}>
                    <div className="ak-row-title">{c.name}</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${c.imageUrl}${c.imageUrl.includes("?") ? "&" : "?"}t=${camTick}`} alt={`Live camera ${c.name}`} style={{ width: "100%", borderRadius: 4, marginTop: 6, border: "1px solid var(--od-line)" }} />
                  </button>
                ))}
              </Section>
              {live.errors.length > 0 && (
                <div className="ak-panel-foot">Not reachable now: {live.errors.map((e) => e.source).join(", ")}</div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="ak-panel map-layers">
        {(["vehicles", "places", "events", "cameras", "rings"] as Layer[]).map((k) => (
          <label key={k}>
            <input type="checkbox" checked={layers[k]} onChange={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} />
            {k === "rings" ? "500 m, 1 km, 2 km rings" : k === "vehicles" ? `Live trains and buses${vehCount != null ? ` (${vehCount})` : ""}` : k[0].toUpperCase() + k.slice(1)}
          </label>
        ))}
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: "1px solid var(--od-line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px 4px", fontSize: 12, color: "var(--od-muted)" }}>
        <Icon style={{ width: 14, height: 14 }} /> {title}
      </div>
      {children}
    </div>
  );
}
