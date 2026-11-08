import "server-only";
import type { LiveSnapshot } from "../types";
import { buildSnapshot } from "./snapshot";

export { getWeather, getObserved, getTransit, getUpcomingEvents, getCruise, getCameras, STOP_PLACES } from "./sources";

// Server-side entry point: the API route and server components call this directly.
export function getLiveSnapshot(): Promise<LiveSnapshot> {
  return buildSnapshot();
}
