import { PageHeader } from "@/components/PageHeader";
import { StOutputWorkbench } from "@/components/StOutputWorkbench";

export default function StOutputPage(){
  return <div className="page"><PageHeader code="OUT-40" title="ST Output Target" description="Target-driven ST planning from current NextOperation/WIP to FINSST, with forward/backward timing plus finite-capacity trial scheduling. Recommended work is converted into route-linked proposed batches, placed on finite-capacity resources, and optionally trial-split when a late Job subset blocks target recovery. The complete dependency graph validates whether the dm² target is achievable before cutoff; v022 also ranks critical-path bottlenecks and runs non-destructive recovery re-simulations."/><StOutputWorkbench/></div>;
}
