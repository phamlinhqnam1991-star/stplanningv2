import { PageHeader } from "@/components/PageHeader";
import { BatchWorkbench } from "@/components/BatchWorkbench";

export default function BatchesPage(){
  return <div className="page"><PageHeader code="BAT-30" title="Batch Planning" description="Config-driven Candidate Jobs, Batch Key, capacity validation and Draft Batch creation based on the current route, Main Operation, Recipe and Process Time engines."/><BatchWorkbench/></div>;
}
