import { PageHeader } from "@/components/PageHeader";
import { TransactionalSchedulingPanel } from "@/components/TransactionalSchedulingPanel";
import { SchedulingTable } from "@/components/SchedulingTable";

export default function SchedulingPage() {
  return <div className="page"><PageHeader code="SCH-20" title="Scheduling" description="v026.3 Transactional Scheduling combines the new ERP Resource Reservation Ledger with the legacy imported schedule as a read-only baseline. Resource overlaps, stale Batch versions and invalid lifecycle transitions are rejected server-side."/><TransactionalSchedulingPanel/><SchedulingTable /></div>;
}
