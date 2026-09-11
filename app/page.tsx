import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { StatusOverview } from "@/components/StatusOverview";

export default function HomePage() {
  return (
    <div className="page">
      <PageHeader code="SYS-00" title="Operations Overview" description="Clean Planning & Scheduling foundation built from the two approved Excel source sheets." actions={<Link className="button primary" href="/import">Import Workbook</Link>} />
      <StatusOverview />
      <div className="module-grid">
        <Link className="module-card planning" href="/planning"><span>PLAN-10</span><h3>Planning</h3><p>Phase 2: filters, saved views, priority and ST operation visibility.</p></Link>
        <Link className="module-card scheduling" href="/scheduling"><span>SCH-20</span><h3>Scheduling</h3><p>Phase 3: table + resource timeline with timing and status visibility.</p></Link>
      </div>
    </div>
  );
}
