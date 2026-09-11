import { PageHeader } from "@/components/PageHeader";
import { SchedulingTable } from "@/components/SchedulingTable";

export default function SchedulingPage() {
  return <div className="page"><PageHeader code="SCH-20" title="Scheduling" description="Phase 3 Scheduling: resource lanes, batch and timing visibility, filters, status control and an auto-scaled timeline. No scheduling rule is added." /><SchedulingTable /></div>;
}
