import { PageHeader } from "@/components/PageHeader";
import { OutputModelConsole } from "@/components/OutputModelConsole";

export default function OutputModelPage(){
  return <div className="page"><PageHeader code="CFG-94" title="ST Output Model" description="Configure Final ST endpoint, daily cutoff, output metric, time-zone handling, unknown process-time policy and recommendation behavior without changing application code."/><OutputModelConsole/></div>;
}
