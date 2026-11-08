// Public webcams near the store. The list in src/data/cameras.json is built and checked by
// scripts/data/fetch-cameras.ts (each image URL returned an image when checked).
import type { Camera } from "../types";
import { readDataFile } from "./files";
import { distanceToStore } from "./geo";

export async function getCameras(): Promise<Camera[]> {
  return readDataFile<Camera[]>("cameras.json", [])
    .map((c) => ({ ...c, distanceM: c.distanceM ?? distanceToStore(c.lat, c.lon) }))
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0))
    .slice(0, 8);
}
