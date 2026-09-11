import { PageHeader } from "@/components/PageHeader";
import { CapacityModelConsole } from "@/components/CapacityModelConsole";

export default function CapacityModelPage(){
  return <div className="page"><PageHeader code="CFG-95" title="Finite Capacity Model" description="Configure physical resource slots, shared concurrency, planning horizon, existing-schedule occupancy and finite-capacity policy used to validate ST Output targets."/><CapacityModelConsole/></div>;
}
