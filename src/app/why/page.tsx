import { Search } from "lucide-react";
import PageHead from "@/components/PageHead";
import { readData } from "@/lib/data";
import SpikeExplorer, { type Spike } from "@/components/SpikeExplorer";

export const dynamic = "force-dynamic";

export default function WhyPage() {
  const spikes = readData<Spike[]>("model/spikes.json", []);
  const bench = readData<{ spikeFinder?: { top1: number; top3: number; spikeDaysEvaluated: number } } | null>("model/benchmark.json", null);
  const sf = bench?.spikeFinder;
  return (
    <main className="adm-content">
      <PageHead crumb="Store / Why it spiked" title="Why it spiked" icon={Search}
        finding={<>Days where sales went above the top of the likely range. For each one, Pulse searches every event, train problem, cruise call and calendar reason nearby and ranks them.
          {sf && <> On the test year it named the true cause first on <b>{Math.round(sf.top1 * 100)}%</b> of {sf.spikeDaysEvaluated} spike days, and in the top three on <b>{Math.round(sf.top3 * 100)}%</b>.</>} When nothing fits, it says so and asks you.</>} />
      {spikes.length === 0 ? <div className="ak-empty">The spike finder has not run yet.</div> : <SpikeExplorer spikes={spikes} />}
    </main>
  );
}
