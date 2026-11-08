// Shared contract between the data, model, staffing and UI parts.
// Every agent reads this file; change it only by adding optional fields.

export const STORE = {
  id: "bk-klingenberg",
  name: "Burger King Klingenberg",
  address: "Klingenberggata 5, 0161 Oslo",
  lat: 59.91389,
  lon: 10.73277,
  // brreg org 981909100 "BURGER KING AVD 5031 KLINGENBERG", 45 employees, opened 1999-11-01
  orgNumber: "981909100",
  employees: 45,
  nearestStopPlaceId: "NSR:StopPlace:58404", // Nationaltheatret (verified live 2026-11-08)
} as const;

export type Source = { label: string; url: string };

export type PlaceCategory =
  | "transit" | "venue" | "museum" | "cinema" | "office" | "nightlife"
  | "market" | "landmark" | "port" | "competitor" | "school" | "hotel";

export type Place = {
  id: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lon: number;
  distanceM?: number;       // straight-line distance to STORE
  note?: string;            // why it matters for demand, one line
  capacity?: number;        // seats / people, when public
  sources: Source[];
};

export type EventCategory =
  | "concert" | "sports" | "festival" | "market" | "ceremony" | "protest"
  | "celebrity" | "cinema" | "conference" | "cruise" | "school" | "transit"
  | "holiday" | "other";

export type CityEvent = {
  id: string;
  title: string;
  category: EventCategory;
  venue?: string;
  lat: number;
  lon: number;
  start: string;            // ISO 8601 with offset
  end: string;              // ISO 8601 with offset
  expectedAttendance?: number;
  attendanceIsEstimate?: boolean;
  recurring?: string;       // e.g. "yearly 17 May"
  sources: Source[];        // empty array is NOT allowed; every event cites where it came from
};

export type WeatherHour = {
  time: string;             // ISO
  tempC: number;
  precipMm: number;
  windMs: number;
  symbol?: string;          // met.no symbol_code
};

export type TransitDeparture = {
  time: string; expected: string; line: string; mode: string;
  destination: string; delayMin: number; cancelled: boolean; quay?: string;
};

export type TransitSituation = {
  id: string; summary: string; description?: string;
  severity?: string; validFrom?: string; validTo?: string;
  affects?: string[];       // line codes or stop names
};

export type Camera = {
  id: string; name: string; lat: number; lon: number;
  imageUrl: string;         // still image, refreshed by the source
  distanceM?: number; sources: Source[];
};

export type CruiseCall = {
  ship: string; berth?: string; lat?: number; lon?: number;
  arrival: string; departure: string; passengers?: number; sources: Source[];
};

export type LiveSnapshot = {
  fetchedAt: string;
  weather: { now: WeatherHour | null; next48h: WeatherHour[]; source: Source };
  transit: { departures: TransitDeparture[]; situations: TransitSituation[]; source: Source };
  cameras: Camera[];
  events: CityEvent[];      // today and the next 7 days
  cruise: CruiseCall[];     // today and the next 7 days
  errors: { source: string; message: string }[]; // a failed source never breaks the snapshot
};

// Model outputs (written by model/ into src/data/model/*.json)
export type ForecastHour = {
  time: string;
  p10: number; p50: number; p90: number;   // transactions in the hour
  actual?: number;
  drivers: { group: string; value: number }[]; // SHAP grouped, in transactions
};

// Staffing outputs
export type StaffRequirement = {
  time: string; transactions: number;
  front: number; kitchen: number; total: number;
  serviceLevel: number;     // probability a customer waits <= target seconds
};
