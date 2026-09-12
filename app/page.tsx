import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ErpControlTower } from "@/components/ErpControlTower";
import { StatusOverview } from "@/components/StatusOverview";

export default function HomePage() {
  return (
    <div className="page">
      <PageHeader code="SYS-00" title="ERP Operations Control Tower" description="v026.6 exception-driven ST ERP view across Job state, Batch commitments, transactional Scheduling, actual Execution, Inspection and canonical Final Output." actions={<Link className="button primary" href="/import">Import Workbook</Link>} />
      <ErpControlTower />
      <StatusOverview />
      <div className="module-grid">
        <Link className="module-card routing" href="/routing"><span>ROUTE-05</span><h3>Job Routing</h3><p>Occurrence-aware physical route, current suffix, rework and Final Gate.</p></Link>
        <Link className="module-card planning" href="/planning"><span>PLAN-10</span><h3>Planning</h3><p>ERP State Kernel, candidate logic and explainable READY / WAIT.</p></Link>
        <Link className="module-card planning" href="/batches"><span>BAT-30</span><h3>Batch Planning</h3><p>Commitment ledger, lifecycle, concurrency protection and audit trail.</p></Link>
        <Link className="module-card scheduling" href="/scheduling"><span>SCH-20</span><h3>Scheduling</h3><p>Transactional resource reservations with overlap and stale-write protection.</p></Link>
        <Link className="module-card planning" href="/execution"><span>EXEC-25</span><h3>Execution & Inspection</h3><p>Actual Job/Main execution and occurrence-level inspection facts.</p></Link>
        <Link className="module-card planning" href="/st-output"><span>OUT-40</span><h3>ST Output Target</h3><p>Canonical Output Ledger, Final ETA, What-if, proposed plan and predictive risk.</p></Link>
      </div>
    </div>
  );
}
