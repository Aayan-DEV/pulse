import { CalendarDays } from "lucide-react";
import PageHead from "@/components/PageHead";
import { readData } from "@/lib/data";
import type { CityEvent } from "@/lib/types";
import { STORE } from "@/lib/types";
import { employeeEvents } from "@/lib/shift/employeeEvents";
import { haversineKm } from "@/lib/model/features";
import { getView } from "@/lib/view";
import EventsTable from "@/components/EventsTable";

export const dynamic = "force-dynamic";

const NEAR_KM = 2;
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short" });
/** The next Oslo midnight, so "today" is right in summer and winter time. */
function endOfOsloDay(now: number) {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now).split(":").map(Number);
  return now + (24 * 60 - (h * 60 + m)) * 60_000;
}

type Row = CityEvent & { distanceM: number; employee?: boolean };

function crowd(n?: number): { text: string; tone: "neg" | "warn" | "" } | null {
  if (!n) return null;
  if (n >= 10000) return { text: `Very big crowd, ${n.toLocaleString("en")}`, tone: "neg" };
  if (n >= 2000) return { text: `Big crowd, ${n.toLocaleString("en")}`, tone: "warn" };
  return { text: `${n.toLocaleString("en")} people`, tone: "" };
}

function when(e: Row, now: number) {
  const s = Date.parse(e.start), en = Date.parse(e.end);
  if (en - s > 12 * 3600_000) return `All day, until ${day(e.end)}`;
  if (s <= now) return `Now, until ${hm(e.end)}`;
  return `${hm(e.start)} to ${hm(e.end)}`;
}

function EventRow({ e, now, showDay }: { e: Row; now: number; showDay?: boolean }) {
  const c = crowd(e.expectedAttendance);
  const walk = Math.max(1, Math.round(e.distanceM / 80));
  const live = Date.parse(e.start) <= now && Date.parse(e.end) > now;
  return (
    <div className="ak-row">
      <div>
        <div className="ak-row-title">{live && <span className="ak-pill ak-pill--pos" style={{ marginRight: 8 }}>Now</span>}{e.title}</div>
        <div className="ak-row-why">{showDay ? `${day(e.start)}, ` : ""}{when(e, now)} · {walk} min walk{e.employee ? " · logged by staff" : ""}</div>
      </div>
      {c && <span className={`ak-pill${c.tone ? ` ak-pill--${c.tone}` : ""}`}>{c.text}</span>}
    </div>
  );
}

export default async function EventsPage() {
  const view = await getView();
  const now = Date.now();
  const hist = readData<CityEvent[]>("events-history.json", []);
  const up = readData<CityEvent[]>("events-upcoming.json", []);
  const cal = readData<CityEvent[]>("events-calendar.json", []);
  const emp = employeeEvents().map((e) => ({ ...e, employee: true, note: `Employee-reported ${new Date(e.reportedAt).toLocaleString("en-GB", { timeZone: "Europe/Oslo" })}` }));
  const seen = new Set<string>();
  const all: Row[] = [...emp, ...up, ...hist, ...cal].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .map((e) => ({ ...e, distanceM: Math.round(1000 * haversineKm(STORE.lat, STORE.lon, e.lat, e.lon)) }))
    .sort((a, b) => b.start.localeCompare(a.start));

  // Today = from now until the end of the Oslo day. Biggest crowds first, then by start time.
  const endToday = endOfOsloDay(now);
  const near = all.filter((e) => e.distanceM <= NEAR_KM * 1000);
  const bySize = (a: Row, b: Row) => (b.expectedAttendance ?? 0) - (a.expectedAttendance ?? 0) || a.start.localeCompare(b.start);
  const todays = near.filter((e) => Date.parse(e.end) > now && Date.parse(e.start) <= endToday).sort(bySize);
  const week = near.filter((e) => Date.parse(e.start) > endToday && Date.parse(e.start) < endToday + 7 * 86400_000)
    .sort((a, b) => a.start.localeCompare(b.start));
  const big = todays.filter((e) => (e.expectedAttendance ?? 0) >= 2000);

  const cats = all.reduce<Record<string, number>>((m, e) => ((m[e.category] = (m[e.category] ?? 0) + 1), m), {});
  return (
    <main className="adm-content">
      <PageHead crumb="Today / Events" title="Events" icon={CalendarDays}
        finding={<>Things happening within a {Math.round((NEAR_KM * 1000) / 80)}-minute walk. Big crowds mean more people walking past the store.</>} />

      <section className={`tr-hero${big.length ? " tr-hero--yellow" : ""}`}>
        <span className={`sh-dot sh-dot--${big.length ? "yellow" : "green"}`} aria-hidden />
        <div>
          <h2>{todays.length === 0 ? "Nothing nearby today" : `${todays.length} event${todays.length > 1 ? "s" : ""} nearby today`}</h2>
          <p>{big.length ? `Biggest: ${big[0].title} (${when(big[0], now).toLowerCase()}). Expect more people before and after.` : "No big crowds today. A normal day."}</p>
        </div>
      </section>

      <div className="ak-grid" style={{ marginTop: 12 }}>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Today</h2><p className="ak-note">Biggest first</p></div></div>
          {todays.length === 0 && <div className="ak-empty">Nothing nearby today.</div>}
          {todays.slice(0, 10).map((e) => <EventRow key={e.id} e={e} now={now} />)}
        </section>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Next 7 days</h2><p className="ak-note">In date order</p></div></div>
          {week.length === 0 && <div className="ak-empty">Nothing nearby this week.</div>}
          {week.slice(0, 12).map((e) => <EventRow key={e.id} e={e} now={now} showDay />)}
        </section>
      </div>

      {view === "employer" && (
        <>
          <h2 className="tr-section">Event library</h2>
          <section className="ak-panel">
            <div className="ak-kpis">
              {Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => (
                <div className="ak-kpi" key={k}><div className="ak-kpi-label">{k[0].toUpperCase() + k.slice(1)}</div><div className="ak-kpi-value">{v}</div></div>
              ))}
            </div>
          </section>
          <EventsTable events={all} />
        </>
      )}
    </main>
  );
}
