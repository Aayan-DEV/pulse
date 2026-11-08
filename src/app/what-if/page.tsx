import { FlaskConical } from "lucide-react";
import PageHead from "@/components/PageHead";
import WhatIf from "@/components/WhatIf";
import { VENUES } from "@/lib/whatif";

export const dynamic = "force-dynamic";

export default function WhatIfPage() {
  return (
    <main className="adm-content">
      <PageHead crumb="Store / What if" title="What if" icon={FlaskConical}
        finding={<>Add an event or switch on a scenario and the <b>real model</b> runs again with those inputs. Everything is compared with the normal forecast for the same day.</>} />
      <WhatIf venues={VENUES} />
    </main>
  );
}
