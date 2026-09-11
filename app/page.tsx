import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { StatusOverview } from "@/components/StatusOverview";

export default function HomePage() {
  return (
    <div className="page">
      <PageHeader code="SYS-00" title="Operations Overview" description="Clean Planning, Job Routing, Batch and ST Output Target foundation built from controlled source datasets and configuration-driven business logic." actions={<Link className="button primary" href="/import">Import Workbook</Link>} />
      <StatusOverview />
      <div className="module-grid">
        <Link className="module-card routing" href="/routing"><span>ROUTE-05</span><h3>Job Routing</h3><p>Authoritative JobNum route: Op.1–36, OprSeq, completion and NextOperation.</p></Link>
        <Link className="module-card planning" href="/planning"><span>PLAN-10</span><h3>Planning</h3><p>Phase 2: filters, saved views, priority and ST operation visibility.</p></Link>
        <Link className="module-card planning" href="/batches"><span>BAT-30</span><h3>Batch Planning</h3><p>Config-driven Candidate Jobs, Batch Key, capacity validation and Draft Batch creation.</p></Link>
        <Link className="module-card planning" href="/st-output"><span>OUT-40</span><h3>ST Output Target</h3><p>FINSST cutoff forecast, planned-vs-gap analysis and backward plan requirements by Area, Operation and Recipe.</p></Link>
        <Link className="module-card scheduling" href="/scheduling"><span>SCH-20</span><h3>Scheduling</h3><p>Phase 3: table + resource timeline with timing and status visibility.</p></Link>
      </div>
    </div>
  );
}
