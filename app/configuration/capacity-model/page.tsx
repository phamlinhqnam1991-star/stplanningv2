import { PageHeader } from "@/components/PageHeader";
import { CapacityModelConsole } from "@/components/CapacityModelConsole";

export default function CapacityModelPage(){
  return <div className="page"><PageHeader code="CFG-95" title="Finite Capacity Model" description="Configure Flybar segments, wet-paint CAB1–CAB4 eligibility/stages, Masking/Unmasking manpower, Main Batch prerequisite gates, physical resource slots and finite-capacity policy used to validate ST Output targets."/><CapacityModelConsole/></div>;
}
