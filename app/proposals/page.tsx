import { PageHeader } from "@/components/PageHeader";
import { ProposedPlanWorkbench } from "@/components/ProposedPlanWorkbench";
export default function ProposedPlanPage(){return <div className="page"><PageHeader code="OUT-45" title="Proposed Plan Approval" description="v026.7 freezes a What-if scenario, revalidates it against live ERP commitments and exact finite-resource reservations, then accepts Existing-Unscheduled and New Proposed batches atomically with no silent rescheduling."/><ProposedPlanWorkbench/></div>;}
