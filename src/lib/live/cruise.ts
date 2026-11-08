// Cruise calls today and the next 7 days from src/data/cruise-upcoming.json
// (built from Oslo Havn's published cruise schedule by scripts/data/fetch-cruise.ts).
import type { CruiseCall } from "../types";
import { readDataFile } from "./files";
import { windowBounds } from "./events";

export async function getCruise(): Promise<CruiseCall[]> {
  const { from, to } = windowBounds();
  return readDataFile<CruiseCall[]>("cruise-upcoming.json", [])
    .filter((c) => new Date(c.departure).getTime() >= from && new Date(c.arrival).getTime() <= to)
    .sort((a, b) => a.arrival.localeCompare(b.arrival));
}
