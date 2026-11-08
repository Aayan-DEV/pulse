// Prints departure and situation counts from the live Entur fetcher.
import { getTransit } from "../../src/lib/live/transit";
getTransit().then((t) => console.log(t.departures.length, t.situations.length, JSON.stringify(t.situations.slice(0, 4)).slice(0, 1200)));
