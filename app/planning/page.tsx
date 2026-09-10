import { PageHeader } from "@/components/PageHeader";
import { PlanningTable } from "@/components/PlanningTable";

export default function PlanningPage() {
  return <div className="page"><PageHeader code="PLAN-10" title="Planning" description="Operational view normalized from SirusClean_Painting_MasterList. All 148 source columns remain preserved in the RAW layer." /><PlanningTable /></div>;
}
