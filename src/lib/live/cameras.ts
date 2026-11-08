// Public road cameras from Statens vegvesen (NLOD 2.0). The camera list comes from the official
// DATEX 3.1 CCTV site table exposed as OGC API Features; still images from kamera.atlas.vegvesen.no.
// Only one camera lies within 2 km of the store (Hjortnes, E18); we return the nearest 3-8.
// Falls back to src/data/cameras.json (verified 2026-11-08) if the list request fails.
import type { Camera } from "../types";
import { cached, fetchJson } from "./cache";
import { readDataFile } from "./files";
import { distanceToStore } from "./geo";

const LIST_URL =
  "https://ogckart-sn1.atlas.vegvesen.no/ogc/features/v1/collections/datex_3_1:CctvSimple/items" +
  "?f=json&limit=2000&bbox=10.55,59.84,10.95,60.0";
const LICENSE = { label: "Statens vegvesen road cameras, NLOD 2.0", url: "https://data.norge.no/nlod/en/2.0" };

type Feature = {
  geometry: { coordinates: [number, number] };
  properties: {
    cameraId: string; description?: string; roadNumber?: string; orientationDescription?: string;
    stillImageUrl?: string; "status.stillImageAvailability"?: string;
  };
};

export async function getCameras(): Promise<Camera[]> {
  try {
    return await cached("cameras", 30 * 60_000, async () => {
      const json = await fetchJson<{ features: Feature[] }>(LIST_URL, {}, 10_000);
      return json.features
        .filter((f) => f.properties.stillImageUrl && f.properties["status.stillImageAvailability"] !== "noImagesAvailable")
        .map((f) => {
          const [lon, lat] = f.geometry.coordinates;
          const p = f.properties;
          const name = [p.roadNumber, p.description, p.orientationDescription ? `(towards ${p.orientationDescription})` : ""].filter(Boolean).join(" ");
          return {
            id: `vegvesen-${p.cameraId}`, name, lat, lon, imageUrl: p.stillImageUrl!,
            distanceM: distanceToStore(lat, lon),
            sources: [{ label: "Statens vegvesen CCTV (DATEX 3.1 via OGC API)", url: LIST_URL }, LICENSE],
          } satisfies Camera;
        })
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, 6);
    });
  } catch (e) {
    const fallback = readDataFile<Camera[]>("cameras.json", []);
    if (!fallback.length) throw e;
    return fallback.map((c) => ({ ...c, distanceM: c.distanceM ?? distanceToStore(c.lat, c.lon) }));
  }
}

