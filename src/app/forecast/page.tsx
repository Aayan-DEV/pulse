import { TrendingUp } from "lucide-react";
import PageHead from "@/components/PageHead";
import { getForecast } from "@/lib/forecast";
import { readData } from "@/lib/data";
import type { ForecastHour } from "@/lib/types";
import ForecastView from "@/components/ForecastView";

export const dynamic = "force-dynamic";

export default async function ForecastPage() {
  let fc = null, err: string | null = null;
  try { fc = await getForecast(7); } catch (e) { err = e instanceof Error ? e.message : "Forecast failed"; }
  const hist = readData<{ hourly: ForecastHour[]; note: string } | null>("model/history.json", null);
  return (
    <main className="adm-content">
      <PageHead crumb="Store / Forecast" title="Forecast" icon={TrendingUp}
        finding={<>Orders per hour for the next 7 days from the trained model, with the reasons behind each hour. Inputs: <b>live met.no weather</b>, <b>live Entur disruptions</b>, sourced events and cruise calls, Norwegian holidays and school breaks.</>} />
      {err && <div className="ak-error">{err}</div>}
      {fc && <ForecastView hours={fc.hours} errors={fc.errors} history={hist?.hourly.slice(-24 * 14) ?? []} historyNote={hist?.note ?? ""} />}
    </main>
  );
}
