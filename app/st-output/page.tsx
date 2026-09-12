import { PageHeader } from "@/components/PageHeader";
import { StOutputWorkbench } from "@/components/StOutputWorkbench";

export default function StOutputPage(){
  return <div className="page"><PageHeader code="OUT-40" title="ST Output Target" description="ST Output Target v025.5 uses the real active Job route, existing Batch/Schedule state and intermediate inspections to project the applicable Final Gate (FINSST / CFINM-VN). Output dm² is credited once per unique Job/Final-Gate occurrence and split into Already Reached Final, Existing Plan Forecast, Proposed Additional, Late, Blocked and Time Unknown before the selected cutoff."/><StOutputWorkbench/></div>;
}
