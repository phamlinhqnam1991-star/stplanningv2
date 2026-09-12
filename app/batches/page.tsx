import { PageHeader } from "@/components/PageHeader";
import { BatchWorkbench } from "@/components/BatchWorkbench";

export default function BatchesPage(){
  return <div className="page"><PageHeader code="BAT-30" title="Batch Planning" description="ERP v026.2 adds occurrence trace, an active Job/Main Commitment Ledger, configurable lifecycle transitions, optimistic version checks and append-only audit events while preserving the existing Batch Key, Recipe and capacity rules."/><BatchWorkbench/></div>;
}
