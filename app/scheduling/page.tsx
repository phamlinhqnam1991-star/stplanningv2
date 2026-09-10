import { PageHeader } from "@/components/PageHeader";
import { SchedulingTable } from "@/components/SchedulingTable";

export default function SchedulingPage() {
  return <div className="page"><PageHeader code="SCH-20" title="Scheduling" description="Normalized schedule blocks and resource-lane assignments from Main Planning. No scheduling rules are added yet." /><SchedulingTable /></div>;
}
