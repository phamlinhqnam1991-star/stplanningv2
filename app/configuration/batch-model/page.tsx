import { PageHeader } from "@/components/PageHeader";
import { BatchModelConsole } from "@/components/BatchModelConsole";

export default function BatchModelPage(){
  return <div className="page"><PageHeader code="CFG-93" title="Batch Model" description="Configure Batch Key fields, grouping/capacity rules, numbering, lifecycle status and future split criteria without hard-coded planning logic."/><BatchModelConsole/></div>;
}
