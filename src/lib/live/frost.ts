// MET Norway Frost: latest official observation at Oslo Blindern (SN18700).
// License: CC BY 4.0 (MET Norway). Server-only: the client ID is read from process.env and never logged.
import { cached, fetchJson } from "./cache";

type FrostResp = {
  data: { referenceTime: string; observations: { elementId: string; value: number }[] }[];
};

export async function getObserved() {
  const id = process.env.FROST_CLIENT_ID;
  if (!id) throw new Error("FROST_CLIENT_ID is not set");
  return cached("frost", 10 * 60_000, async () => {
    const url =
      "https://frost.met.no/observations/v0.jsonld?sources=SN18700" +
      "&elements=" + encodeURIComponent("air_temperature,sum(precipitation_amount PT1H),wind_speed") +
      "&referencetime=latest";
    const auth = "Basic " + Buffer.from(`${id}:`).toString("base64");
    const json = await fetchJson<FrostResp>(url, { headers: { Authorization: auth } });
    // Elements may arrive in separate rows with different reference times; take the newest of each.
    const latest: Record<string, { v: number; t: string }> = {};
    for (const row of json.data ?? []) {
      for (const o of row.observations) {
        const cur = latest[o.elementId];
        if (!cur || row.referenceTime > cur.t) latest[o.elementId] = { v: o.value, t: row.referenceTime };
      }
    }
    const times = Object.values(latest).map((x) => x.t).sort();
    return {
      time: times[times.length - 1] ?? new Date().toISOString(),
      tempC: latest["air_temperature"]?.v ?? null,
      precipMm: latest["sum(precipitation_amount PT1H)"]?.v ?? null,
      windMs: latest["wind_speed"]?.v ?? null,
      station: "Oslo - Blindern (SN18700)",
    };
  });
}
