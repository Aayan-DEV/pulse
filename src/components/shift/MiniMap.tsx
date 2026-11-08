"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { STORE } from "@/lib/types";

// Small live map: the store and live trains, trams and buses (Entur), refreshed every 15 s.
export default function MiniMap() {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!box.current) return;
    const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    const m = new maplibregl.Map({ container: box.current, style: `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`, center: [STORE.lon, STORE.lat], zoom: 14.8, attributionControl: { compact: true } });
    const el = document.createElement("div"); el.className = "mini-store";
    new maplibregl.Marker({ element: el }).setLngLat([STORE.lon, STORE.lat]).addTo(m);
    let timer: ReturnType<typeof setInterval>;
    // The grid may size the box after the map is created; keep the canvas in step with it.
    const ro = new ResizeObserver(() => m.resize()); ro.observe(box.current);
    m.on("error", (e) => { if (!m.isStyleLoaded()) setFailed(true); console.warn("mini map", e.error?.message); });
    m.on("load", () => {
      m.addSource("veh", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "veh", type: "circle", source: "veh", paint: { "circle-radius": 5, "circle-color": ["match", ["get", "mode"], "metro", "#d9622b", "tram", "#2f7d4f", "rail", "#3c3c3c", "#7a7a7a"], "circle-stroke-width": 1.5, "circle-stroke-color": "#fff" } });
      const load = async () => {
        try {
          const j = (await (await fetch("/api/vehicles", { cache: "no-store" })).json()) as { vehicles: { lat: number; lon: number; mode: string }[] };
          (m.getSource("veh") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: j.vehicles.map((v) => ({ type: "Feature", properties: { mode: String(v.mode).toLowerCase() }, geometry: { type: "Point", coordinates: [v.lon, v.lat] } })) });
        } catch { /* keep the last positions */ }
      };
      void load(); timer = setInterval(load, 15_000);
    });
    return () => { clearInterval(timer); ro.disconnect(); m.remove(); };
  }, []);
  return (
    <div className="mini-map-wrap">
      <div ref={box} className="mini-map" />
      {failed && <div className="mini-map-msg">Map tiles could not load. The full map is under Live map.</div>}
    </div>
  );
}
