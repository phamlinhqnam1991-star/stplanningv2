import { PageHeader } from "@/components/PageHeader";
import { PlanningTable } from "@/components/PlanningTable";

export default function PlanningPage() {
  return <div className="page"><PageHeader code="PLAN-10" title="Planning" description="Phase 2 operational Planning: server filters, sorting, column control, saved views, priority visibility and ST operation visibility. RAW source remains preserved." /><PlanningTable /></div>;
}
