import LiveMapClient from "@/components/LiveMapClient";
import { readData } from "@/lib/data";
import type { Place } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function MapPage() {
  const places = readData<Place[]>("places.json", []);
  return <LiveMapClient places={places} />;
}
