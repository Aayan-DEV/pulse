// Smoke test for the live fetchers: npx tsx scripts/data/test-live.ts [weather|transit|frost|events|cruise|cameras|all]
import path from "node:path";
try { process.loadEnvFile(path.resolve(__dirname, "..", "..", ".env.local")); } catch {}
const which = process.argv[2] ?? "all";
(async () => {
  const live = await import("../../src/lib/live/sources");
  const run = async (name: string, fn: () => Promise<unknown>) => {
    if (which !== "all" && which !== name) return;
    const t0 = Date.now();
    try {
      const v = await fn();
      const s = JSON.stringify(v);
      console.log(`OK ${name} ${Date.now() - t0}ms ${s.length}B`, s.slice(0, 900));
    } catch (e) {
      console.log(`FAIL ${name}`, (e as Error).message);
    }
  };
  await run("weather", live.getWeather);
  await run("frost", live.getObserved);
  await run("transit", live.getTransit);
  await run("events", live.getUpcomingEvents);
  await run("cruise", live.getCruise);
  await run("cameras", live.getCameras);
})();
