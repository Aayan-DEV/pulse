import { Database } from "lucide-react";
import PageHead from "@/components/PageHead";
import Doc from "@/components/Doc";

export const dynamic = "force-dynamic";

export default function SourcesPage() {
  return (
    <main className="adm-content">
      <PageHead crumb="Signals / Data sources" title="Data sources" icon={Database}
        finding={<>Every live feed and every historic record, with its licence and <b>how it was checked to be real</b>.</>} />
      <section className="ak-panel">
        <div className="ak-panel-body"><Doc file="data-sources.md" missing="The source list is being written." /></div>
      </section>
    </main>
  );
}
