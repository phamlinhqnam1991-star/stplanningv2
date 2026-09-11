import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { StatusOverview } from "@/components/StatusOverview";

export default function HomePage() {
  return (
    <div className="page">
      <PageHeader code="SYS-00" title="Operations Overview" description="Clean Planning, Job Routing and Scheduling foundation built from three controlled source datasets." actions={<Link className="button primary" href="/import">Import Workbook</Link>} />
      <StatusOverview />
      <div className="module-grid">
        <Link className="module-card routing" href="/routing"><span>ROUTE-05</span><h3>Job Routing</h3><p>Authoritative JobNum route: Op.1–36, OprSeq, completion and NextOperation.</p></Link>
        <Link className="module-card planning" href="/planning"><span>PLAN-10</span><h3>Planning</h3><p>Phase 2: filters, saved views, priority and ST operation visibility.</p></Link>
        <Link className="module-card scheduling" href="/scheduling"><span>SCH-20</span><h3>Scheduling</h3><p>Phase 3: table + resource timeline with timing and status visibility.</p></Link>
      </div>
    </div>
  );
}
