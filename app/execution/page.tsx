import { PageHeader } from "@/components/PageHeader";
import { ExecutionInspectionWorkbench } from "@/components/ExecutionInspectionWorkbench";
export default function ExecutionPage(){return <div className="page"><PageHeader code="EXEC-25" title="Execution & Inspection" description="v026.4 actual execution ledger at Job/Main occurrence level plus Intermediate / Final Inspection actual. This is the factual layer used by Output Target, exception handling and predictive ETA."/><ExecutionInspectionWorkbench/></div>;}
