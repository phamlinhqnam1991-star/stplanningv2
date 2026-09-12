import type { StOutputJobAssessment } from "@/lib/st-output-engine";
import type { CapacityJobResult } from "@/lib/finite-capacity-scheduler";

export type OutputLedgerSource = "ACTUAL_FINAL" | "EXISTING_SCHEDULE" | "EXISTING_UNSCHEDULED" | "NEW_PROPOSED";
export type OutputLedgerStatus = "COUNTED" | "LATE" | "TIME_UNKNOWN" | "BLOCKED" | "NOT_REACHED" | "REVIEW";

export type CanonicalOutputLedgerLine = {
  outputKey:string;
  jobNum:string;
  surfaceDm2:number;
  finalGateCode:string|null;
  finalGateOccurrence:number|null;
  finalReadyAt:string|null;
  source:OutputLedgerSource;
  status:OutputLedgerStatus;
  basis:string;
  selectedForTarget:boolean;
  batchNos:string[];
};

export type CanonicalOutputLedgerSummary={
  countedSurfaceDm2:number;actualFinalSurfaceDm2:number;existingScheduledSurfaceDm2:number;existingUnscheduledSurfaceDm2:number;proposedSurfaceDm2:number;
  lateSurfaceDm2:number;blockedSurfaceDm2:number;timeUnknownSurfaceDm2:number;countedJobs:number;lateJobs:number;blockedJobs:number;timeUnknownJobs:number;
};

const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:0;};
function sourcePriority(source:OutputLedgerSource){return source==="ACTUAL_FINAL"?4:source==="EXISTING_SCHEDULE"?3:source==="EXISTING_UNSCHEDULED"?2:1;}
function statusPriority(status:OutputLedgerStatus){return status==="COUNTED"?6:status==="LATE"?5:status==="BLOCKED"?4:status==="TIME_UNKNOWN"?3:status==="REVIEW"?2:1;}

export function dedupeOutputLedger(lines:CanonicalOutputLedgerLine[]){
  const map=new Map<string,CanonicalOutputLedgerLine>();
  for(const line of lines){
    const prev=map.get(line.outputKey);
    if(!prev||statusPriority(line.status)>statusPriority(prev.status)||(line.status===prev.status&&sourcePriority(line.source)>sourcePriority(prev.source)))map.set(line.outputKey,line);
  }
  return [...map.values()].sort((a,b)=>(a.finalReadyAt||"9999").localeCompare(b.finalReadyAt||"9999")||a.jobNum.localeCompare(b.jobNum));
}

export function buildStOutputLedger(rows:StOutputJobAssessment[]):CanonicalOutputLedgerLine[]{
  return dedupeOutputLedger(rows.map((row)=>{
    let source:OutputLedgerSource="NEW_PROPOSED";
    if(row.outputBucket==="ALREADY_REACHED_FINAL")source="ACTUAL_FINAL";
    else if(row.outputBucket==="EXISTING_PLAN_FORECAST")source=row.existingScheduledCount>0?"EXISTING_SCHEDULE":"EXISTING_UNSCHEDULED";
    let status:OutputLedgerStatus="NOT_REACHED";
    if(["OUTPUT","COMMITTED","PLANNED"].includes(row.outputStatus)||(row.selectedForTarget&&row.outputStatus==="NEED_PLAN"&&row.projectedFinsstAt))status="COUNTED";
    else if(row.outputStatus==="AT_RISK"||row.outputBucket==="LATE")status="LATE";
    else if(row.outputBucket==="BLOCKED")status="BLOCKED";
    else if(row.outputBucket==="TIME_UNKNOWN")status="TIME_UNKNOWN";
    else if(row.outputStatus==="REVIEW")status="REVIEW";
    return{outputKey:row.outputKey,jobNum:row.jobNum,surfaceDm2:n(row.surfaceDm2),finalGateCode:row.finalGateCode,finalGateOccurrence:row.finalGateOccurrence,finalReadyAt:row.projectedFinsstAt,source,status,basis:row.outputBasis,selectedForTarget:row.selectedForTarget,batchNos:[...new Set(row.steps.map(s=>s.batchNo).filter((x):x is string=>Boolean(x))) ]};
  }));
}

export function buildCapacityOutputLedger(jobs:CapacityJobResult[],endpointOperation:string):CanonicalOutputLedgerLine[]{
  return dedupeOutputLedger(jobs.map((job)=>{
    let source:OutputLedgerSource="NEW_PROPOSED";
    if(job.sourceStatus==="OUTPUT")source="ACTUAL_FINAL";
    else if(["COMMITTED","PLANNED"].includes(job.sourceStatus))source=job.existingScheduledCount>0?"EXISTING_SCHEDULE":"EXISTING_UNSCHEDULED";
    const status:OutputLedgerStatus=job.contributes?"COUNTED":job.finiteStatus==="LATE"?"LATE":job.finiteStatus==="UNSCHEDULED"?"BLOCKED":job.finiteStatus==="REVIEW"?"TIME_UNKNOWN":"NOT_REACHED";
    return{outputKey:job.outputKey||`${job.jobNum}|CAPACITY|${endpointOperation}#1`,jobNum:job.jobNum,surfaceDm2:n(job.surfaceDm2),finalGateCode:job.finalGateCode||endpointOperation,finalGateOccurrence:job.finalGateOccurrence||1,finalReadyAt:job.finishAt,source,status,basis:job.reason||`Finite capacity ${job.finiteStatus}`,selectedForTarget:source==="NEW_PROPOSED",batchNos:[]};
  }));
}

export function summarizeOutputLedger(lines:CanonicalOutputLedgerLine[]):CanonicalOutputLedgerSummary{
  const unique=dedupeOutputLedger(lines);const sum=(predicate:(x:CanonicalOutputLedgerLine)=>boolean)=>unique.filter(predicate).reduce((a,b)=>a+n(b.surfaceDm2),0);
  return{
    countedSurfaceDm2:sum(x=>x.status==="COUNTED"),actualFinalSurfaceDm2:sum(x=>x.status==="COUNTED"&&x.source==="ACTUAL_FINAL"),existingScheduledSurfaceDm2:sum(x=>x.status==="COUNTED"&&x.source==="EXISTING_SCHEDULE"),existingUnscheduledSurfaceDm2:sum(x=>x.status==="COUNTED"&&x.source==="EXISTING_UNSCHEDULED"),proposedSurfaceDm2:sum(x=>x.status==="COUNTED"&&x.source==="NEW_PROPOSED"),lateSurfaceDm2:sum(x=>x.status==="LATE"),blockedSurfaceDm2:sum(x=>x.status==="BLOCKED"),timeUnknownSurfaceDm2:sum(x=>x.status==="TIME_UNKNOWN"||x.status==="REVIEW"),countedJobs:unique.filter(x=>x.status==="COUNTED").length,lateJobs:unique.filter(x=>x.status==="LATE").length,blockedJobs:unique.filter(x=>x.status==="BLOCKED").length,timeUnknownJobs:unique.filter(x=>x.status==="TIME_UNKNOWN"||x.status==="REVIEW").length,
  };
}
