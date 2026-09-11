import { PageHeader } from "@/components/PageHeader";
import { StOutputWorkbench } from "@/components/StOutputWorkbench";

export default function StOutputPage(){
  return <div className="page"><PageHeader code="OUT-40" title="ST Output Target" description="Target-driven ST planning from current NextOperation/WIP to FINSST, with forward/backward timing plus finite-capacity trial scheduling. Recommended work can be converted into proposed batches and placed on configured Flybar, Cabin and resource lanes to validate whether the dm² target is actually achievable before cutoff."/><StOutputWorkbench/></div>;
}
