import { PageHeader } from "@/components/PageHeader";
import { StOutputWorkbench } from "@/components/StOutputWorkbench";

export default function StOutputPage(){
  return <div className="page"><PageHeader code="OUT-40" title="ST Output Target" description="Target-driven ST planning from current NextOperation/WIP to FINSST. The engine calculates remaining route and process time, forward ETA, backward latest-start requirements, already-planned output and additional jobs/areas/recipes required to achieve the daily dm² target before cutoff."/><StOutputWorkbench/></div>;
}
