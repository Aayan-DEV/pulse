import type { ForecastHour, StaffRequirement, WeatherHour } from "./types";

// What /api/forecast returns: the next 48 hours, live.
export type ForecastPayload = {
  generatedAt: string;
  hours: (ForecastHour & { weather?: WeatherHour; open: boolean })[];
  staffing: StaffRequirement[];
  today: { date: string; p10: number; p50: number; p90: number; typical: number };
  driversToday: { group: string; value: number }[]; // transactions, summed over today's open hours
  inputs: { events: number; situations: number; weatherSource: string; transitLate5Share?: number | null };
  model: { trainedAt?: string; coverage?: number; wape?: number };
  errors: string[];
};
