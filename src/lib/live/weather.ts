// MET Norway Locationforecast 2.0 (compact) for the store, next 48 h.
// License: CC BY 4.0 (MET Norway). Requires an identifying User-Agent.
import { STORE, type LiveSnapshot, type WeatherHour } from "../types";
import { cached, fetchJson, USER_AGENT } from "./cache";

export const WEATHER_SOURCE = {
  label: "MET Norway Locationforecast 2.0 (CC BY 4.0)",
  url: `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${STORE.lat.toFixed(4)}&lon=${STORE.lon.toFixed(4)}`,
};

type MetResp = {
  properties: {
    timeseries: {
      time: string;
      data: {
        instant: { details: { air_temperature: number; wind_speed: number } };
        next_1_hours?: { summary: { symbol_code: string }; details: { precipitation_amount: number } };
        next_6_hours?: { summary: { symbol_code: string }; details: { precipitation_amount: number } };
      };
    }[];
  };
};

export async function getWeather(): Promise<Omit<LiveSnapshot["weather"], "observed">> {
  return cached("weather", 10 * 60_000, async () => {
    const json = await fetchJson<MetResp>(WEATHER_SOURCE.url, { headers: { "User-Agent": USER_AGENT } });
    const cutoff = Date.now() + 48 * 3600_000;
    const hours: WeatherHour[] = json.properties.timeseries
      .filter((t) => new Date(t.time).getTime() <= cutoff && t.data.next_1_hours)
      .map((t) => ({
        time: t.time,
        tempC: t.data.instant.details.air_temperature,
        windMs: t.data.instant.details.wind_speed,
        precipMm: t.data.next_1_hours!.details.precipitation_amount,
        symbol: t.data.next_1_hours!.summary.symbol_code,
      }));
    return { now: hours[0] ?? null, next48h: hours, source: WEATHER_SOURCE };
  });
}
