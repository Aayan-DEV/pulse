import { TrendingUp } from "lucide-react";
import PageHead from "@/components/PageHead";
import { getForecast } from "@/lib/forecast";
import { sumDay } from "@/lib/reasons";
import ForecastView, { type Day } from "@/components/ForecastView";

export const dynamic = "force-dynamic";

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/Oslo", ...o });
const hh = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });

export default async function ForecastPage() {
  let days: Day[] = [], err: string | null = null;
  try {
    const f = await getForecast(7);
    // Business days run 06:00 to 06:00, 24 hours each from the start of today.
    for (let i = 0; i < 7; i++) {
      const h = f.hours.slice(i * 24, i * 24 + 24);
      if (!h.length) break;
      const s = sumDay(h);
      days.push({
        label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : fmt(h[0].time, { weekday: "long", day: "numeric", month: "short" }),
        short: i === 0 ? "Today" : fmt(h[0].time, { weekday: "short", day: "numeric" }),
        p50: Math.round(s.p50), vs: s.vsNormal, reasons: s.reasons,
        hours: h.filter((x) => x.open).map((x) => ({ label: hh(x.time), p10: x.p10, p50: x.p50, p90: x.p90 })),
      });
    }
  } catch (e) { err = e instanceof Error ? e.message : "Forecast failed"; days = []; }
  const week = days.reduce((s, d) => s + d.p50, 0);
  return (
    <main className="adm-content">
      <PageHead crumb="Plan / Forecast" title="Forecast" icon={TrendingUp}
        finding={days.length ? <><b>{week.toLocaleString("en")} orders</b> in the next 7 days.</> : undefined} />
      {err && <div className="ak-error">{err}</div>}
      {days.length > 0 && <ForecastView days={days} />}
    </main>
  );
}
