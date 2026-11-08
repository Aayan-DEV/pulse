// Live vehicle positions around central Oslo from Entur's open vehicle API (NLOD licence).
// Trains (Vy, Flytoget) and some buses report here; Ruter trams do not.
export const dynamic = "force-dynamic";

type V = {
  codespace: { codespaceId: string }; line: { publicCode: string } | null; mode: string;
  bearing: number | null; delay: number | null; lastUpdated: string;
  location: { latitude: number; longitude: number }; destinationName: string | null;
};

let cache: { at: number; body: unknown } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < 15_000) return Response.json(cache.body);
  const query = `{ vehicles(boundingBox:{minLat:59.880,minLon:10.650,maxLat:59.950,maxLon:10.830}) {
    codespace { codespaceId } line { publicCode } mode bearing delay lastUpdated
    location { latitude longitude } destinationName } }`;
  try {
    const r = await fetch("https://api.entur.io/realtime/v2/vehicles/graphql", {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json", "ET-Client-Name": "panlytics-pulse" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Entur vehicles answered ${r.status}`);
    const j = (await r.json()) as { data: { vehicles: V[] } };
    const cutoff = Date.now() - 10 * 60_000;
    const vehicles = j.data.vehicles
      .filter((v) => new Date(v.lastUpdated).getTime() > cutoff)
      .map((v) => ({
        operator: v.codespace.codespaceId, line: v.line?.publicCode ?? "", mode: v.mode,
        lat: v.location.latitude, lon: v.location.longitude, bearing: v.bearing,
        delayMin: v.delay != null ? Math.round(v.delay / 60) : null, destination: v.destinationName ?? "",
        updated: v.lastUpdated,
      }));
    const body = { fetchedAt: new Date().toISOString(), vehicles, source: { label: "Entur vehicle positions (NLOD)", url: "https://developer.entur.no/pages-real-time-vehicle-positions" } };
    cache = { at: Date.now(), body };
    return Response.json(body);
  } catch (e) {
    return Response.json({ fetchedAt: new Date().toISOString(), vehicles: [], error: e instanceof Error ? e.message : "failed" }, { status: 200 });
  }
}
