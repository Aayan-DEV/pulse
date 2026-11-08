import { FlaskConical } from "lucide-react";
import PageHead from "@/components/PageHead";
import WhatIf from "@/components/WhatIf";
import { VENUES } from "@/lib/whatif";

export const dynamic = "force-dynamic";

export default function WhatIfPage() {
  return (
    <main className="adm-content">
      <PageHead crumb="Plan / What if" title="What if" icon={FlaskConical}
        finding={<>Tap a scenario. See what changes.</>} />
      <WhatIf venues={VENUES} />
    </main>
  );
}
