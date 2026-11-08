import { BookOpen } from "lucide-react";
import PageHead from "@/components/PageHead";
import Doc from "@/components/Doc";

export const dynamic = "force-dynamic";

export default function MethodPage() {
  return (
    <main className="adm-content">
      <PageHead crumb="Model / Method" title="Method" icon={BookOpen}
        finding={<>How the model and the staffing plan work, <b>what is real and what is simulated</b>, and every source behind each number.</>} />
      <div className="ak-grid">
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Demand model</h2><p className="ak-note">docs/model.md</p></div></div>
          <div className="ak-panel-body"><Doc file="model.md" missing="The model notes are being written." /></div>
        </section>
        <section className="ak-panel">
          <div className="ak-panel-head"><div><h2 className="ak-h">Staffing method</h2><p className="ak-note">docs/staffing-method.md</p></div></div>
          <div className="ak-panel-body"><Doc file="staffing-method.md" missing="The staffing method is being written." /></div>
        </section>
      </div>
    </main>
  );
}
