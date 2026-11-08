// Oslo local-time helpers. A "business day" runs from the morning until the
// small hours: an hour before `dayCutoffHour` (06:00) belongs to the previous
// day and gets a local hour of 24..29 (so 01:00 Saturday = Friday hour 25).

export const TZ = "Europe/Oslo";

export type LocalHour = {
  businessDate: string; // YYYY-MM-DD of the business day
  weekday: number;      // 0 = Monday ... 6 = Sunday, of the business day
  hour: number;         // 0..29, hours >= 24 are after midnight
  calendarWeekday: number; // weekday of the actual clock time (0 = Monday)
};

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", hourCycle: "h23", weekday: "short",
});

const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function toLocalHour(iso: string, dayCutoffHour = 6): LocalHour {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  const calendarWeekday = WD[parts.weekday as string];
  let date = `${parts.year}-${parts.month}-${parts.day}`;
  let weekday = calendarWeekday;
  let h = hour;
  if (hour < dayCutoffHour) {
    date = addDays(date, -1);
    weekday = (weekday + 6) % 7;
    h = hour + 24;
  }
  return { businessDate: date, weekday, hour: h, calendarWeekday };
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Format a business hour (0..29) as a clock label, e.g. 25 -> "01:00". */
export function clock(hour: number): string {
  const h = ((Math.round(hour * 60) / 60) % 24 + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
