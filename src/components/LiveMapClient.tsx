"use client";

import dynamic from "next/dynamic";
import type { Place } from "@/lib/types";

const LiveMap = dynamic(() => import("./LiveMap"), {
  ssr: false,
  loading: () => <div className="map-wrap"><div className="ak-empty">Loading the map</div></div>,
});

export default function LiveMapClient({ places }: { places: Place[] }) {
  return <LiveMap places={places} />;
}
