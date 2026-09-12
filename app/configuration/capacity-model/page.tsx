import { PageHeader } from "@/components/PageHeader";
import { CapacityModelConsole } from "@/components/CapacityModelConsole";

export default function CapacityModelPage(){
  return <div className="page"><PageHeader code="CFG-95" title="Finite Capacity Model" description="Configure Flybar segments, wet-paint CAB1–CAB4 eligibility/stages, Masking/Unmasking manpower, full-route batch dependencies, Smart Batch Split thresholds, physical resource slots and finite-capacity target policy."/><CapacityModelConsole/></div>;
}
