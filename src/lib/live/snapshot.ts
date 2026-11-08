import type { LiveSnapshot } from "../types";
import { getWeather, WEATHER_SOURCE } from "./weather";
import { getObserved } from "./frost";
import { getTransit, TRANSIT_SOURCE } from "./transit";
import { getUpcomingEvents } from "./events";
import { getCruise } from "./cruise";
import { getCameras } from "./cameras";

// Runs every source in parallel. A failing source adds to errors[] and never breaks the snapshot.
export async function buildSnapshot(): Promise<LiveSnapshot> {
  const errors: LiveSnapshot["errors"] = [];
  const safe = async <T>(source: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      errors.push({ source, message: (e as Error).message?.slice(0, 300) ?? "failed" });
      return fallback;
    }
  };
  const [weather, observed, transit, events, cruise, cameras] = await Promise.all([
    safe("met.no locationforecast", getWeather, { now: null, next48h: [], source: WEATHER_SOURCE }),
    safe("met.no frost (Blindern)", getObserved, undefined),
    safe("entur journey planner", getTransit, { departures: [], situations: [], source: TRANSIT_SOURCE }),
    safe("events", getUpcomingEvents, []),
    safe("cruise", getCruise, []),
    safe("cameras", getCameras, []),
  ]);
  return {
    fetchedAt: new Date().toISOString(),
    weather: observed ? { ...weather, observed } : weather,
    transit, cameras, events, cruise, errors,
  };
}
