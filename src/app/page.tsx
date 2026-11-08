import { LayoutGrid } from "lucide-react";
import PageHead from "@/components/PageHead";
import Overview from "@/components/Overview";

export default function Home() {
  return (
    <main className="adm-content">
      <PageHead crumb="Store / Overview" title="Overview" icon={LayoutGrid} />
      <Overview />
    </main>
  );
}
