// Prints a summary of the full live snapshot (same code path as /api/live).
import path from "node:path";
try { process.loadEnvFile(path.resolve(__dirname, "..", "..", ".env.local")); } catch {}
import("../../src/lib/live/snapshot").then(async ({ buildSnapshot }) => {
  const s = await buildSnapshot();
  console.log(JSON.stringify({ hours: s.weather.next48h.length, observed: !!s.weather.observed, departures: s.transit.departures.length, situations: s.transit.situations.length, cameras: s.cameras.length, events: s.events.length, cruise: s.cruise.length, errors: s.errors }));
});
