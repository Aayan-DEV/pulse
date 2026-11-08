import { CalendarDays } from "lucide-react";
import PageHead from "@/components/PageHead";
import { readData } from "@/lib/data";
import type { CityEvent } from "@/lib/types";
import { STORE } from "@/lib/types";
import EventsTable from "@/components/EventsTable";

export const dynamic = "force-dynamic";

function distM(lat: number, lon: number) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (lat - STORE.lat) * toR, dLon = (lon - STORE.lon) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(STORE.lat * toR) * Math.cos(lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default function EventsPage() {
  const hist = readData<CityEvent[]>("events-history.json", []);
  const up = readData<CityEvent[]>("events-upcoming.json", []);
  const seen = new Set<string>();
  const all = [...up, ...hist].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .map((e) => ({ ...e, distanceM: Math.round(distM(e.lat, e.lon)) }))
    .sort((a, b) => b.start.localeCompare(a.start));
  const cats = all.reduce<Record<string, number>>((m, e) => ((m[e.category] = (m[e.category] ?? 0) + 1), m), {});
  const within1k = all.filter((e) => e.distanceM <= 1000).length;
  return (
    <main className="adm-content">
      <PageHead crumb="Signals / Events" title="Events" icon={CalendarDays}
        finding={<><b>{all.length} events</b> with a source link each, {within1k} of them within 1 km of the store. The model learns how much each kind moves sales.</>} />
      <section className="ak-panel">
        <div className="ak-kpis">
          {Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => (
            <div className="ak-kpi" key={k}><div className="ak-kpi-label">{k[0].toUpperCase() + k.slice(1)}</div><div className="ak-kpi-value">{v}</div></div>
          ))}
          {all.length === 0 && <div className="ak-kpi"><div className="ak-kpi-label">Events</div><div className="ak-kpi-value is-na">Being collected</div></div>}
        </div>
      </section>
      <EventsTable events={all} />
    </main>
  );
}
