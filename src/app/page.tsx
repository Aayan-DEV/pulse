import { Clock3 } from "lucide-react";
import PageHead from "@/components/PageHead";
import ShiftView, { type ShiftData } from "@/components/shift/ShiftView";
import { today, hh } from "@/lib/shift/today";
import { VENUES } from "@/lib/whatif";

export const dynamic = "force-dynamic";

export default async function ShiftPage() {
  const t = await today();
  const cur = t.cur;
  const data: ShiftData = {
    updated: hh(t.now), demoClock: t.demoClock, status: t.status, alarms: t.alarms,
    inventory: t.stock.items, pace: t.stock.pacePerHour, cards: t.cards,
    current: cur ? { label: hh(cur.time), soFar: cur.soFar ?? 0, projected: cur.projected ?? 0, p50: cur.p50, p90: cur.p90, open: cur.open } : null,
  };
  return (
    <main className="adm-content shift">
      <PageHead crumb="Shift" title="Shift" icon={Clock3} finding={<>What you need right now. Sales here are a <b>simulated live stream</b> (no till connected yet); stock levels use assumed per-order ratios.</>} />
      <ShiftView data={data} venues={VENUES} />
    </main>
  );
}
