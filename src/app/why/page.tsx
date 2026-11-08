import { Search } from "lucide-react";
import PageHead from "@/components/PageHead";
import { readData } from "@/lib/data";
import SpikeExplorer, { type Spike } from "@/components/SpikeExplorer";

export const dynamic = "force-dynamic";

export default function WhyPage() {
  const spikes = readData<Spike[]>("model/spikes.json", []);
  return (
    <main className="adm-content">
      <PageHead crumb="Plan / Why it spiked" title="Why it spiked" icon={Search}
        finding={<>Days that sold far more than expected, and the most likely cause.</>} />
      {spikes.length === 0 ? <div className="ak-empty">The spike finder has not run yet.</div> : <SpikeExplorer spikes={spikes} />}
    </main>
  );
}
