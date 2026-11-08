// Entur Journey Planner v3 (GraphQL): live departures and disruption messages
// for the stops serving the store. License: NLOD (Entur open data).
import { STORE, type LiveSnapshot, type TransitDeparture, type TransitSituation } from "../types";
import { cached, fetchJson } from "./cache";

const ENDPOINT = "https://api.entur.io/journey-planner/v3/graphql";
export const TRANSIT_SOURCE = { label: "Entur Journey Planner v3 (NLOD)", url: "https://developer.entur.org/pages-journeyplanner-journeyplanner" };

// Verified with Entur `nearest` from the store on 2026-11-08.
export const STOP_PLACES = {
  nationaltheatret: STORE.nearestStopPlaceId, // NSR:StopPlace:58404, metro + tram + bus + rail, 68 m
  akerBrygge: "NSR:StopPlace:58382",          // tram + boat, 358 m
  kontraskjaeret: "NSR:StopPlace:4245",        // tram, 457 m
  osloS: "NSR:StopPlace:59872",                // Oslo S, the rail bottleneck for the Oslo tunnel
};

const SIT = `id severity summary{value language} description{value language} validityPeriod{startTime endTime}`;
const QUERY = `query($ids:[String]!, $osl:String!) {
  stopPlaces(ids:$ids) {
    id name
    situations { ${SIT} }
    estimatedCalls(numberOfDepartures: 60, timeRange: 7200, includeCancelledTrips: true) {
      aimedDepartureTime expectedDepartureTime cancellation
      quay { id publicCode name }
      destinationDisplay { frontText }
      situations { ${SIT} }
      serviceJourney { line { id publicCode transportMode situations { ${SIT} } } }
    }
  }
  osl: stopPlace(id:$osl) { id name situations { ${SIT} } }
}`;

type Txt = { value: string; language?: string }[];
type Sit = { id: string; severity?: string; summary: Txt; description: Txt; validityPeriod?: { startTime?: string; endTime?: string } };
type Call = {
  aimedDepartureTime: string; expectedDepartureTime: string; cancellation: boolean;
  quay?: { id: string; publicCode?: string; name: string };
  destinationDisplay?: { frontText: string };
  situations: Sit[];
  serviceJourney: { line: { id: string; publicCode: string; transportMode: string; situations: Sit[] } };
};
type Resp = {
  data?: { stopPlaces: { id: string; name: string; situations: Sit[]; estimatedCalls: Call[] }[]; osl: { id: string; name: string; situations: Sit[] } | null };
  errors?: { message: string }[];
};

const pick = (t: Txt) => (t.find((x) => x.language === "en") ?? t.find((x) => x.language === "no" || x.language === "nob") ?? t[0])?.value;

export async function getTransit(): Promise<LiveSnapshot["transit"]> {
  return cached("transit", 60_000, async () => {
    const json = await fetchJson<Resp>(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ET-Client-Name": "panlytics-pulse" },
      body: JSON.stringify({
        query: QUERY,
        variables: { ids: [STOP_PLACES.nationaltheatret, STOP_PLACES.akerBrygge, STOP_PLACES.kontraskjaeret], osl: STOP_PLACES.osloS },
      }),
    });
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
    const places = json.data?.stopPlaces ?? [];

    const departures: TransitDeparture[] = [];
    const sits = new Map<string, TransitSituation>();
    const addSit = (s: Sit, affects: string) => {
      const prev = sits.get(s.id);
      if (prev) {
        if (!prev.affects!.includes(affects)) prev.affects!.push(affects);
        return;
      }
      sits.set(s.id, {
        id: s.id, summary: pick(s.summary) ?? "(no summary)", description: pick(s.description),
        severity: s.severity, validFrom: s.validityPeriod?.startTime, validTo: s.validityPeriod?.endTime,
        affects: [affects],
      });
    };

    for (const p of places) {
      p.situations.forEach((s) => addSit(s, p.name));
      for (const c of p.estimatedCalls) {
        const line = c.serviceJourney.line;
        departures.push({
          time: c.aimedDepartureTime,
          expected: c.expectedDepartureTime,
          line: line.publicCode,
          mode: line.transportMode,
          destination: c.destinationDisplay?.frontText ?? "",
          delayMin: Math.round((new Date(c.expectedDepartureTime).getTime() - new Date(c.aimedDepartureTime).getTime()) / 6000) / 10,
          cancelled: c.cancellation,
          quay: `${p.name}${c.quay?.publicCode ? " " + c.quay.publicCode : ""}`,
        });
        c.situations.forEach((s) => addSit(s, `${line.transportMode} ${line.publicCode}`));
        line.situations.forEach((s) => addSit(s, `${line.transportMode} ${line.publicCode}`));
      }
    }
    json.data?.osl?.situations.forEach((s) => addSit(s, "Oslo S"));

    departures.sort((a, b) => a.expected.localeCompare(b.expected));
    return { departures, situations: [...sits.values()], source: TRANSIT_SOURCE };
  });
}
