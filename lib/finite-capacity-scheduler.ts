import { query } from "@/lib/db";
import { getConfigBootstrap } from "@/lib/config";
import { aggregateProcessTime, getBatchModel, resolveBatchProposal, type BatchProposal } from "@/lib/batch-model";
import { getCapacityModel, capacityInstanceCodes, capacityResource, type CapacityModel, type CapacityResourceDefinition } from "@/lib/capacity-model";
import { getPlanningModel, type MainOperationDefinition, type PlanningModel } from "@/lib/planning-model";
import { calculateStOutputTarget, type StOutputJobAssessment, type StOutputStep } from "@/lib/st-output-engine";
import { getRecipeModel, type RecipeModel } from "@/lib/recipe-model";

export type FiniteCapacityOptions = {
  targetDate: string;
  cutoffTime: string;
  targetValue: number;
};

export type CapacitySegmentKind = "BLOCK" | "LOADING" | "PROCESS" | "WAIT_NDT" | "NDT" | "UNLOADING" | "PAINT_SETUP" | "PAINT_APPLICATION" | "PAINT_FLASH" | "PAINT_CURE" | "PAINT_RELEASE" | "MANUAL_SETUP" | "MANUAL_WORK" | "MANUAL_RELEASE";

export type CapacityBatchSegment = {
  kind: CapacitySegmentKind;
  label: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  occupiesCapacity: boolean;
};

export type CapacityTimelineEntry = {
  id: string;
  batchNo: string;
  sourceKind: "EXISTING_SCHEDULE" | "EXISTING_BATCH" | "PROPOSED_BATCH";
  baseResourceCode: string;
  resourceInstance: string;
  resourceLabel: string;
  mainOperationCode: string | null;
  recipeNo: string | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  segmentKind: CapacitySegmentKind;
  segmentLabel: string;
  status: string;
  jobs: string[];
  surfaceDm2: number;
  occupiesCapacity: boolean;
  capacityUnits: number;
};

export type CapacityBatchPrerequisite = {
  batchNo: string;
  mainOperationCode: string;
  operationCodes: string[];
  jobs: string[];
  loadMinutes: number;
  elapsedMinutes: number | null;
  startAt: string | null;
  endAt: string | null;
};

export type CapacityBatchDependency = {
  batchNo: string;
  mainOperationCode: string;
  operationCodes: string[];
  jobs: string[];
  completeAt: string | null;
  readyAt: string | null;
};

export type CapacityDependencyEdge = {
  fromBatchNo: string;
  toBatchNo: string;
  jobNum: string;
  fromMainOperationCode: string;
  toMainOperationCode: string;
  fromOperationCode: string;
  toOperationCode: string;
  fromRoutePosition: number | null;
  toRoutePosition: number | null;
  lagMinutes: number;
  readyAt: string | null;
  blocking: boolean;
};

export type ProposedCapacityBatch = {
  id: string;
  batchNo: string;
  sourceKind: "EXISTING_BATCH" | "PROPOSED_BATCH" | "FIXED_SCHEDULE";
  mainOperationCode: string;
  mainOperationLabel: string;
  batchKey: string | null;
  recipeNo: string | null;
  recipeName: string | null;
  jobCount: number;
  jobs: string[];
  totalQty: number;
  totalSurfaceDm2: number;
  durationMinutes: number;
  batchRuleCode: string | null;
  resourceBase: string | null;
  resourceInstance: string | null;
  startAt: string | null;
  endAt: string | null;
  mustStartBy: string | null;
  batchReadyAt: string | null;
  prerequisiteManualBatchCount: number;
  prerequisiteManualJobCount: number;
  prerequisiteManualLoadMinutes: number;
  prerequisiteManualCompleteAt: string | null;
  prerequisiteManualBatches: CapacityBatchPrerequisite[];
  dependencyBatchCount: number;
  dependencyJobCount: number;
  dependencyBatches: CapacityBatchDependency[];
  blockingJobs: string[];
  smartSplitApplied: boolean;
  splitParentKey: string | null;
  splitPartIndex: number | null;
  splitPartCount: number | null;
  splitReason: string | null;
  status: "FIXED" | "ON_TIME" | "LATE_START" | "UNSCHEDULED" | "DEPENDENCY_CONFLICT";
  reason: string | null;
  warnings: string[];
  segments: CapacityBatchSegment[];
};

export type CapacityJobResult = {
  jobNum: string;
  planningJobId: number;
  sourceStatus: string;
  surfaceDm2: number;
  finishAt: string | null;
  cutoffAt: string;
  finiteStatus: "ON_TIME" | "LATE" | "UNSCHEDULED" | "REVIEW";
  contributes: boolean;
  capacityReview: boolean;
  reason: string | null;
};

export type CapacityResourceSummary = {
  baseResourceCode: string;
  label: string;
  instanceCount: number;
  maxConcurrent: number;
  existingMinutes: number;
  simulatedMinutes: number;
  availableMinutes: number;
  utilizationPct: number;
  processMaxConcurrent: number | null;
  processExistingMinutes: number;
  processSimulatedMinutes: number;
  processAvailableMinutes: number;
  processUtilizationPct: number | null;
  lateOrUnscheduledBatches: number;
};

export type FiniteCapacityResult = {
  targetDate: string;
  cutoffTime: string;
  cutoffAt: string;
  targetValue: number;
  scenarioStartAt: string;
  horizonEndAt: string;
  endpointOperation: string;
  targetFeasibility: "CONFIRMED" | "PROVISIONAL" | "NOT_FEASIBLE";
  summary: {
    actualSurface: number;
    committedSurface: number;
    finitePlannedSurface: number;
    finiteRecommendedSurface: number;
    selectedCandidateSurface: number;
    processTimeForecastSurface: number;
    finiteCapacityForecastSurface: number;
    baselineFiniteCapacityForecastSurface: number;
    splitRecoveredSurface: number;
    dependencyEdgeCount: number;
    splitBatchCount: number;
    splitSourceBatchCount: number;
    remainingGap: number;
    achievementPct: number;
    proposedBatchCount: number;
    existingBatchToScheduleCount: number;
    lateBatchCount: number;
    unscheduledBatchCount: number;
    capacityReviewJobCount: number;
  };
  selectedJobNums: string[];
  finiteRecommendedJobNums: string[];
  batches: ProposedCapacityBatch[];
  jobs: CapacityJobResult[];
  timeline: CapacityTimelineEntry[];
  resources: CapacityResourceSummary[];
  dependencies: CapacityDependencyEdge[];
  warnings: string[];
};

type RawContext = { partCluster: string | null; rawRow: unknown };
type MemberDraft = {
  key: string;
  row: StOutputJobAssessment;
  step: StOutputStep;
  stepIndex: number;
  previousMemberKey: string | null;
  lagBeforeMinutes: number;
  proposal: BatchProposal | null;
  groupKey: string;
  raw: RawContext;
};
type JobChain = { row: StOutputJobAssessment; members: MemberDraft[]; tailLagMinutes: number; capacityReview: boolean; blockedReason: string | null };
type BatchSegment = { kind: CapacitySegmentKind; label: string; start: number; end: number; occupiesCapacity: boolean; laborResourceCode?: string | null; laborUnits?: number };

type BatchPrerequisiteInternal = {
  nodeId: string;
  batchNo: string;
  mainOperationCode: string;
  operationCodes: string[];
  jobs: string[];
  loadMinutes: number;
  start: number | null;
  end: number | null;
};
type BatchDependencyInternal = {
  nodeId: string;
  batchNo: string;
  mainOperationCode: string;
  operationCodes: string[];
  jobs: string[];
  completeAt: number | null;
  readyAt: number | null;
};
type SplitAssignment = { partIndex: number; partCount: number; reason: string; parentGroupKey: string };

type BatchNode = {
  id: string;
  sourceKind: "FIXED_SCHEDULE" | "EXISTING_BATCH" | "PROPOSED_BATCH";
  batchNo: string;
  batchKey: string | null;
  mainOperation: MainOperationDefinition;
  recipeNo: string | null;
  recipeName: string | null;
  members: MemberDraft[];
  durationMinutes: number;
  ruleCode: string | null;
  resourceOptions: string[];
  fixedStart: number | null;
  fixedEnd: number | null;
  start: number | null;
  end: number | null;
  resourceBase: string | null;
  resourceInstance: string | null;
  mustStartBy: number | null;
  batchReadyAt: number | null;
  prerequisiteManualLoadMinutes: number;
  prerequisiteManualCompleteAt: number | null;
  prerequisiteManualBatches: BatchPrerequisiteInternal[];
  dependencyBatches: BatchDependencyInternal[];
  blockingJobs: string[];
  sourceGroupKey: string;
  splitParentKey: string | null;
  splitPartIndex: number | null;
  splitPartCount: number | null;
  splitReason: string | null;
  status: ProposedCapacityBatch["status"];
  reason: string | null;
  warnings: string[];
  segments: BatchSegment[];
};
type OccupancyInterval = {
  id: string;
  batchRef: string;
  sourceKind: CapacityTimelineEntry["sourceKind"];
  baseResourceCode: string;
  resourceInstance: string;
  recipeNo: string | null;
  start: number;
  end: number;
  status: string;
  mainOperationCode: string | null;
  jobs: string[];
  surfaceDm2: number;
  segmentKind: CapacitySegmentKind;
  segmentLabel: string;
  occupiesCapacity: boolean;
  capacityUnits?: number;
};
type OccupancyState = { intervals: OccupancyInterval[] };
type Simulation = {
  nodes: BatchNode[];
  chains: JobChain[];
  memberNode: Map<string,string>;
  dependencies: CapacityDependencyEdge[];
  jobs: CapacityJobResult[];
  timeline: CapacityTimelineEntry[];
  resources: CapacityResourceSummary[];
  feasiblePlannedSurface: number;
  feasibleCandidateSurface: number;
  selectedCandidateSurface: number;
  warnings: string[];
};

const DAY = 86_400_000;
function key(v: unknown): string { return v == null ? "" : String(v).trim().toUpperCase(); }
function n(v: unknown, fallback = 0): number { const x = Number(v); return Number.isFinite(x) ? x : fallback; }
function wallDateTime(date: string, time: string): number {
  const [y,m,d] = date.split("-").map(Number); const [hh,mm,ss] = time.split(":").map(Number);
  return Date.UTC(y || 1970, Math.max(0,(m || 1)-1), d || 1, hh || 0, mm || 0, ss || 0, 0);
}
function wallIso(ms: number | null): string | null { return ms == null || !Number.isFinite(ms) ? null : new Date(ms).toISOString().slice(0,16); }
function isoDate(ms: number): string { return new Date(ms).toISOString().slice(0,10); }
function parseWall(value: string | null | undefined): number | null {
  if (!value) return null; const text = value.replace(" ", "T"); const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(text);
  return m ? wallDateTime(m[1],m[2]) : null;
}
function addDays(date: string, days: number): string { return isoDate(wallDateTime(date,"00:00") + days*DAY); }
function overlap(a0:number,a1:number,b0:number,b1:number){ return a0 < b1 && b0 < a1; }
function sumSurface(rows: StOutputJobAssessment[]): number { return rows.reduce((s,x)=>s+x.surfaceDm2,0); }
function minDate(values: Array<number | null>): number | null { const a=values.filter((x):x is number=>x!=null); return a.length?Math.min(...a):null; }
function maxDate(values: Array<number | null>): number | null { const a=values.filter((x):x is number=>x!=null); return a.length?Math.max(...a):null; }
function clipMinutes(start:number,end:number,lo:number,hi:number){ return Math.max(0,Math.min(end,hi)-Math.max(start,lo))/60_000; }

function candidateSort(rows: StOutputJobAssessment[]): StOutputJobAssessment[] {
  return [...rows].sort((a,b)=>(a.projectedFinsstAt||"9999").localeCompare(b.projectedFinsstAt||"9999") || (a.remainingProcessMinutes??999999)-(b.remainingProcessMinutes??999999) || b.surfaceDm2-a.surfaceDm2 || a.jobNum.localeCompare(b.jobNum));
}

async function loadRawContexts(ids: number[], planningSheet: string): Promise<Map<number,RawContext>> {
  const out=new Map<number,RawContext>(); if(!ids.length)return out;
  const r=await query(`
    SELECT p.id,p.part_cluster,rr.row_data
    FROM v_active_planning_jobs p
    LEFT JOIN raw_sheet_rows rr ON rr.import_id=p.import_id AND rr.sheet_name=$1 AND rr.source_row_no=p.source_row_no
    WHERE p.id=ANY($2::bigint[])`,[planningSheet,ids]);
  for(const x of r.rows as Record<string,unknown>[])out.set(Number(x.id),{partCluster:x.part_cluster==null?null:String(x.part_cluster),rawRow:x.row_data});
  return out;
}

function inferBaseResource(code:string, model:CapacityModel): {base:string;def:CapacityResourceDefinition;instance:string|null} {
  const exact=capacityResource(model,code); if(key(exact.baseResourceCode)===key(code) || model.resources[key(code)]) return {base:exact.baseResourceCode,def:exact,instance:exact.instanceCount===1?exact.baseResourceCode:null};
  for(const def of model.resourceList){
    if(def.instanceCount<=1)continue;
    const rx=new RegExp(`^${def.instancePrefix.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(\\d+)$`,`i`);
    if(rx.test(code))return {base:def.baseResourceCode,def,instance:code};
  }
  return {base:code,def:capacityResource(model,code),instance:code};
}

function chooseFixedInstance(def:CapacityResourceDefinition,start:number,end:number,state:OccupancyState):string{
  const instances=capacityInstanceCodes(def);
  for(const inst of instances){if(!state.intervals.some(x=>x.occupiesCapacity&&x.baseResourceCode===def.baseResourceCode&&x.resourceInstance===inst&&overlap(start,end,x.start,x.end)))return inst;}
  return instances[0] || def.baseResourceCode;
}

async function loadExistingOccupancy(model:CapacityModel,startAt:number,horizonEnd:number):Promise<OccupancyState>{
  const state:OccupancyState={intervals:[]}; if(!model.includeExistingSchedule)return state;
  const from=addDays(isoDate(startAt),-1), to=addDays(isoDate(horizonEnd),1);
  const r=await query(`
    SELECT s.id,s.batch_ref,s.recipe_no,s.schedule_date,s.start_time,s.end_time,s.duration_minutes,s.status,a.resource_code
    FROM v_active_schedule_blocks s
    JOIN v_active_schedule_resource_assignments a ON a.schedule_block_id=s.id
    WHERE s.schedule_date BETWEEN $1::date AND $2::date
    ORDER BY s.schedule_date,s.start_time,s.source_row_no,a.resource_order`,[from,to]);
  for(const x of r.rows as Record<string,unknown>[]){
    if(!x.schedule_date||!x.start_time)continue;
    const date=String(x.schedule_date).slice(0,10), start=wallDateTime(date,String(x.start_time).slice(0,8));
    let end=x.end_time?wallDateTime(date,String(x.end_time).slice(0,8)):start+n(x.duration_minutes)*60_000; if(end<start)end+=DAY;
    if(end<=startAt||start>=horizonEnd)continue;
    const resourceCode=String(x.resource_code||"UNASSIGNED"); const inf=inferBaseResource(resourceCode,model);
    const instance=inf.instance || chooseFixedInstance(inf.def,start,end,state);
    state.intervals.push({id:`S:${x.id}:${resourceCode}`,batchRef:String(x.batch_ref||""),sourceKind:"EXISTING_SCHEDULE",baseResourceCode:inf.base,resourceInstance:instance,recipeNo:x.recipe_no==null?null:String(x.recipe_no),start,end,status:String(x.status||""),mainOperationCode:null,jobs:[],surfaceDm2:0,segmentKind:"BLOCK",segmentLabel:"Existing Schedule",occupiesCapacity:true});
  }
  return state;
}

function timeMinutes(value:string|null, fallback:number):number{
  if(!value)return fallback;const m=/^(\d{1,2}):(\d{2})/.exec(value);return m?Number(m[1])*60+Number(m[2]):fallback;
}
function alignWindow(t:number,duration:number,def:CapacityResourceDefinition):number|null{
  if(def.calendarMode!=="WINDOW")return t;
  const ws=timeMinutes(def.windowStart,0), weRaw=timeMinutes(def.windowEnd,1440); const span=weRaw>ws?weRaw-ws:weRaw+1440-ws;
  if(duration>span*60_000)return null;
  for(let delta=-1;delta<=8;delta++){
    const day=Math.floor(t/DAY)*DAY+delta*DAY;const start=day+ws*60_000;const end=start+span*60_000;
    const c=Math.max(t,start);if(c+duration<=end)return c;
  }
  return null;
}
function instanceConflictJump(state:OccupancyState,base:string,instance:string,start:number,end:number,changeover:number,recipe:string|null):number|null{
  const list=state.intervals.filter(x=>x.occupiesCapacity&&key(x.baseResourceCode)===key(base)&&key(x.resourceInstance)===key(instance)).sort((a,b)=>a.start-b.start);
  let prior:OccupancyInterval|null=null;
  for(const x of list){if(x.end<=start){if(!prior||x.end>prior.end)prior=x;continue;}if(overlap(start,end,x.start,x.end))return x.end;}
  if(prior&&changeover>0&&key(prior.recipeNo)!==key(recipe)&&start<prior.end+changeover*60_000)return prior.end+changeover*60_000;
  return null;
}
function concurrencyJump(state:OccupancyState,base:string,start:number,end:number,maxConcurrent:number):number|null{
  if(maxConcurrent<=0)return start;
  const list=state.intervals.filter(x=>x.occupiesCapacity&&key(x.baseResourceCode)===key(base)&&overlap(start,end,x.start,x.end)); if(list.length<maxConcurrent)return null;
  const points=[start,end,...list.flatMap(x=>[Math.max(start,x.start),Math.min(end,x.end)])].sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++){
    if(points[i+1]<=points[i])continue;const mid=(points[i]+points[i+1])/2;const active=list.filter(x=>x.start<mid&&x.end>mid);
    if(active.length>=maxConcurrent)return Math.min(...active.map(x=>x.end));
  }
  return null;
}
function capacityUnitsJump(state:OccupancyState,base:string,start:number,end:number,maxUnits:number,requestedUnits:number):number|null{
  const request=Math.max(1,requestedUnits);if(maxUnits<=0||request>maxUnits)return start;
  const list=state.intervals.filter(x=>x.occupiesCapacity&&key(x.baseResourceCode)===key(base)&&overlap(start,end,x.start,x.end));
  if(!list.length)return null;
  const points=[start,end,...list.flatMap(x=>[Math.max(start,x.start),Math.min(end,x.end)])].sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++){
    if(points[i+1]<=points[i])continue;const mid=(points[i]+points[i+1])/2;const active=list.filter(x=>x.start<mid&&x.end>mid);
    const used=active.reduce((sum,x)=>sum+Math.max(1,x.capacityUnits||1),0);
    if(used+request>maxUnits)return Math.min(...active.map(x=>x.end));
  }
  return null;
}
function findSlot(state:OccupancyState,def:CapacityResourceDefinition,instance:string,readyAt:number,durationMinutes:number,recipeNo:string|null,horizonEnd:number):{start:number;end:number}|null{
  const dur=Math.max(0,durationMinutes)*60_000;let t=readyAt;
  for(let guard=0;guard<1000&&t+dur<=horizonEnd;guard++){
    const aligned=alignWindow(t,dur,def);if(aligned==null)return null;t=aligned;const end=t+dur;
    const iJump=instanceConflictJump(state,def.baseResourceCode,instance,t,end,def.changeoverMinutes,recipeNo);if(iJump!=null&&iJump>t){t=iJump;continue;}
    const cJump=concurrencyJump(state,def.baseResourceCode,t,end,def.maxConcurrent);if(cJump!=null&&cJump>t){t=cJump;continue;}
    return{start:t,end};
  }
  return null;
}

function jsonRecord(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function normRecipe(value:unknown):string{const text=value==null?"":String(value).trim();return /^\d+$/.test(text)?String(Number(text)):key(text);}
function chemicalTier(totalQty:number,totalSurface:number,normal:number,heavy:number,qtyThreshold:number,surfaceThreshold:number):number{
  return totalQty>=qtyThreshold||totalSurface>=surfaceThreshold?heavy:normal;
}
function chemicalDurations(node:BatchNode,model:CapacityModel):{loading:number;process:number;ndt:number;unloading:number}{
  const cfg=model.chemicalLine;
  const totalQty=node.members.reduce((sum,m)=>sum+n(m.row.qty),0);
  const totalSurface=node.members.reduce((sum,m)=>sum+m.row.surfaceDm2,0);
  const loading=chemicalTier(totalQty,totalSurface,cfg.loadingDefaultMinutes,cfg.loadingHeavyMinutes,cfg.loadingQtyThreshold,cfg.loadingSurfaceThresholdDm2);
  const unloading=chemicalTier(totalQty,totalSurface,cfg.unloadingDefaultMinutes,cfg.unloadingHeavyMinutes,cfg.unloadingQtyThreshold,cfg.unloadingSurfaceThresholdDm2);
  const details=node.members.map((m)=>jsonRecord(m.step.processTime.details));
  const recipeProcess=details.map((d)=>n(d.recipeMinutes,Number.NaN)).filter(Number.isFinite);
  const configuredNdt=cfg.ndtRecipeNos.map(normRecipe).includes(normRecipe(node.recipeNo))?cfg.ndtMinutes:0;
  const sourceNdt=details.map((d)=>n(d.ndtMinutes,0)).reduce((a,b)=>Math.max(a,b),0);
  const ndt=Math.max(configuredNdt,sourceNdt);
  const process=recipeProcess.length?Math.max(...recipeProcess):Math.max(0,node.durationMinutes-loading-unloading-ndt);
  return{loading,process,ndt,unloading};
}
function chemicalProcessIntervals(state:OccupancyState,model:CapacityModel,base:string):OccupancyInterval[]{
  return state.intervals.filter((x)=>x.occupiesCapacity&&key(x.baseResourceCode)===key(base)&&(x.segmentKind==="PROCESS"||(x.segmentKind==="BLOCK"&&x.sourceKind==="EXISTING_SCHEDULE"&&model.chemicalLine.existingSchedulePolicy==="CONSERVATIVE_PROCESS_BLOCK")));
}
function chemicalProcessConcurrencyJump(state:OccupancyState,model:CapacityModel,base:string,start:number,end:number):number|null{
  const maxConcurrent=model.chemicalLine.processMaxConcurrent;if(maxConcurrent<=0)return start;
  const list=chemicalProcessIntervals(state,model,base).filter((x)=>overlap(start,end,x.start,x.end));if(list.length<maxConcurrent)return null;
  const points=[start,end,...list.flatMap((x)=>[Math.max(start,x.start),Math.min(end,x.end)])].sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++){if(points[i+1]<=points[i])continue;const mid=(points[i]+points[i+1])/2;const active=list.filter((x)=>x.start<mid&&x.end>mid);if(active.length>=maxConcurrent)return Math.min(...active.map((x)=>x.end));}
  return null;
}
function nextNdtStart(state:OccupancyState,base:string,ready:number,spacingMinutes:number):number{
  const spacing=Math.max(0,spacingMinutes)*60_000;if(!spacing)return ready;
  const starts=state.intervals.filter((x)=>key(x.baseResourceCode)===key(base)&&x.segmentKind==="NDT").map((x)=>x.start).sort((a,b)=>a-b);
  let candidate=ready;
  for(let guard=0;guard<1000;guard++){const conflict=starts.find((x)=>Math.abs(candidate-x)<spacing);if(conflict==null)return candidate;candidate=conflict+spacing;}
  return candidate;
}
type ChemicalSlot={start:number;end:number;segments:BatchSegment[]};
function findChemicalSlot(state:OccupancyState,model:CapacityModel,def:CapacityResourceDefinition,instance:string,readyAt:number,node:BatchNode,horizonEnd:number):ChemicalSlot|null{
  const d=chemicalDurations(node,model);let t=readyAt;
  for(let guard=0;guard<2000&&t<=horizonEnd;guard++){
    const loadStart=t,loadEnd=loadStart+d.loading*60_000;
    const processStart=loadEnd,processEnd=processStart+d.process*60_000;
    const processJump=chemicalProcessConcurrencyJump(state,model,def.baseResourceCode,processStart,processEnd);
    if(processJump!=null&&processJump>processStart){t+=processJump-processStart;continue;}
    const ndtStart=d.ndt>0?nextNdtStart(state,def.baseResourceCode,processEnd,model.chemicalLine.ndtStartSpacingMinutes):processEnd;
    const ndtEnd=ndtStart+d.ndt*60_000;
    const unloadStart=ndtEnd,unloadEnd=unloadStart+d.unloading*60_000;
    if(unloadEnd>horizonEnd)return null;
    const aligned=alignWindow(t,unloadEnd-t,def);if(aligned==null)return null;if(aligned>t){t=aligned;continue;}
    const conflictJump=instanceConflictJump(state,def.baseResourceCode,instance,t,unloadEnd,def.changeoverMinutes,node.recipeNo);
    if(conflictJump!=null&&conflictJump>t){t=conflictJump;continue;}
    const segments:BatchSegment[]=[
      {kind:"LOADING",label:"Loading",start:loadStart,end:loadEnd,occupiesCapacity:true},
      {kind:"PROCESS",label:"Process",start:processStart,end:processEnd,occupiesCapacity:true},
    ];
    if(ndtStart>processEnd)segments.push({kind:"WAIT_NDT",label:"Wait for NDT slot",start:processEnd,end:ndtStart,occupiesCapacity:true});
    if(d.ndt>0)segments.push({kind:"NDT",label:"NDT",start:ndtStart,end:ndtEnd,occupiesCapacity:true});
    segments.push({kind:"UNLOADING",label:"Unloading",start:unloadStart,end:unloadEnd,occupiesCapacity:true});
    return{start:t,end:unloadEnd,segments};
  }
  return null;
}

function paintList(value:unknown):string[]{return Array.isArray(value)?value.map((x)=>String(x).trim()).filter(Boolean):[];}
function paintBool(value:unknown,fallback:boolean):boolean{return typeof value==="boolean"?value:fallback;}
function paintNum(value:unknown,fallback:number):number{const x=Number(value);return Number.isFinite(x)?Math.max(0,x):fallback;}
function isPaintingNode(node:BatchNode,model:CapacityModel):boolean{return model.painting.enabled&&model.painting.mainOperationCodes.some((x)=>key(x)===key(node.mainOperation.code));}
function matchingPaintRule(node:BatchNode,model:CapacityModel){
  const main=key(node.mainOperation.code),recipe=normRecipe(node.recipeNo);
  return model.painting.rules.find((rule)=>{
    const c=rule.condition;const exactMain=c.mainOperation==null?"":key(c.mainOperation);const mains=paintList(c.mainOperationIn).map(key);
    const exactRecipe=c.recipeNo==null?"":normRecipe(c.recipeNo);const recipes=paintList(c.recipeNoIn).map(normRecipe);
    if(exactMain&&exactMain!==main)return false;if(mains.length&&!mains.includes(main))return false;
    if(exactRecipe&&exactRecipe!==recipe)return false;if(recipes.length&&!recipes.includes(recipe))return false;return true;
  })||null;
}
function paintingResourceOptions(node:BatchNode,model:CapacityModel,recipeModel:RecipeModel):string[]{
  const rule=matchingPaintRule(node,model);const action=rule?.action||{};const configured=paintList(action.allowedResources);
  const recipe=node.recipeNo?recipeModel.recipeByCode.get(key(node.recipeNo)):null;const recipeResources=paintList(recipe?.data.allowedResources);
  const base=configured.length?configured:recipeResources.length?recipeResources:node.resourceOptions.length?node.resourceOptions:model.painting.defaultResources;
  const blocked=new Set(paintList(action.disallowedResources).map(key));return [...new Set(base)].filter((x)=>!blocked.has(key(x)));
}
type PaintProfile={setup:number;application:number;flash:number;cure:number;release:number;flashOccupies:boolean;cureOccupies:boolean;releaseOccupies:boolean;ruleCode:string|null};
function paintingProfile(node:BatchNode,model:CapacityModel,recipeModel:RecipeModel):PaintProfile{
  const rule=matchingPaintRule(node,model);const action=rule?.action||{};const recipe=node.recipeNo?recipeModel.recipeByCode.get(key(node.recipeNo)):null;
  const stages=recipe?.stagesMinutes||{};let stageFlash=0,stageCure=0;
  if(model.painting.useRecipeStages){for(const [name,value] of Object.entries(stages)){const minutes=Number(value);if(!Number.isFinite(minutes)||minutes<=0)continue;const k=key(name);if(k.includes("DEGAS")||k.includes("FLASH")||k.includes("WAIT"))stageFlash+=minutes;else if(k.includes("CUR")||k.includes("BAKE")||k.includes("OVEN"))stageCure+=minutes;}}
  let setup=paintNum(action.setupMinutes,model.painting.setupMinutes);let flash=paintNum(action.flashMinutes,stageFlash>0?stageFlash:model.painting.flashMinutes);let cure=paintNum(action.cureMinutes,stageCure>0?stageCure:model.painting.cureMinutes);let release=paintNum(action.releaseMinutes,model.painting.releaseMinutes);
  const total=Math.max(0,node.durationMinutes);const fixed=setup+flash+cure+release;let application=Math.max(0,total-fixed);
  if(total>0&&fixed>total){const scale=total/fixed;setup*=scale;flash*=scale;cure*=scale;release*=scale;application=0;}
  return{setup,application,flash,cure,release,flashOccupies:paintBool(action.flashOccupiesCabin,model.painting.flashOccupiesCabin),cureOccupies:paintBool(action.cureOccupiesCabin,model.painting.cureOccupiesCabin),releaseOccupies:paintBool(action.releaseOccupiesCabin,model.painting.releaseOccupiesCabin),ruleCode:rule?.code||null};
}
type PaintSlot={start:number;end:number;segments:BatchSegment[];ruleCode:string|null};
function findPaintingSlot(state:OccupancyState,model:CapacityModel,recipeModel:RecipeModel,def:CapacityResourceDefinition,instance:string,readyAt:number,node:BatchNode,horizonEnd:number):PaintSlot|null{
  const p=paintingProfile(node,model,recipeModel);const durations:[CapacitySegmentKind,string,number,boolean][]=[
    ["PAINT_SETUP","Setup",p.setup,true],["PAINT_APPLICATION","Application",p.application,true],["PAINT_FLASH","Flash / Wait",p.flash,p.flashOccupies],["PAINT_CURE","Cure",p.cure,p.cureOccupies],["PAINT_RELEASE","Release",p.release,p.releaseOccupies],
  ];const elapsed=durations.reduce((sum,x)=>sum+x[2],0)*60_000;let t=readyAt;
  for(let guard=0;guard<2000&&t+elapsed<=horizonEnd;guard++){
    const aligned=alignWindow(t,elapsed,def);if(aligned==null)return null;t=aligned;let cursor=t;const segments:BatchSegment[]=[];
    for(const [kind,label,minutes,occupiesCapacity] of durations){const end=cursor+Math.max(0,minutes)*60_000;if(end>cursor)segments.push({kind,label,start:cursor,end,occupiesCapacity});cursor=end;}
    let jump:number|null=null;let firstCapacity=true;
    for(const seg of segments){if(!seg.occupiesCapacity)continue;const changeover=firstCapacity?def.changeoverMinutes:0;firstCapacity=false;const iJump=instanceConflictJump(state,def.baseResourceCode,instance,seg.start,seg.end,changeover,node.recipeNo);if(iJump!=null&&iJump>seg.start){jump=t+(iJump-seg.start);break;}const cJump=concurrencyJump(state,def.baseResourceCode,seg.start,seg.end,def.maxConcurrent);if(cJump!=null&&cJump>seg.start){jump=t+(cJump-seg.start);break;}}
    if(jump!=null&&jump>t){t=jump;continue;}return{start:t,end:cursor,segments,ruleCode:p.ruleCode};
  }
  return null;
}

function manualStepKind(step:StOutputStep,model:CapacityModel):"MASKING"|"UNMASKING"|null{
  if(!model.manualWork.enabled)return null;
  const op=key(step.operationCode);
  // Source route operation wins. UNMASK must be tested first because codes such as UNMSKG contain MSKG.
  if(op.includes("UNMSK")||op.includes("UNMASK"))return "UNMASKING";
  if(op.includes("MSKG")||op.includes("MASK")||op.startsWith("MSK")||op.startsWith("FMSKG"))return "MASKING";
  const main=key(step.mainOperation?.code);
  if(main==="UNMASKING")return "UNMASKING";
  if(main==="MASKING"||main==="FMSKG_CM")return "MASKING";
  return null;
}
function isManualWorkStep(step:StOutputStep,model:CapacityModel):boolean{return manualStepKind(step,model)!=null;}
function isManualWorkNode(node:BatchNode,model:CapacityModel):boolean{return Boolean(node.members[0]&&isManualWorkStep(node.members[0].step,model));}
function manualRouteContext(steps:StOutputStep[],index:number,model:CapacityModel):string{
  if(!model.manualWork.routeAwareGrouping)return "";
  const source=key(steps[index]?.operationCode)||"UNKNOWN";
  if(model.manualWork.routeContextMode==="SOURCE_OPERATION_ONLY")return source;
  let prev="START",next="END";
  for(let i=index-1;i>=0;i--){if(!isManualWorkStep(steps[i],model)){prev=key(steps[i].mainOperation?.code)||key(steps[i].operationCode)||"START";break;}}
  for(let i=index+1;i<steps.length;i++){if(!isManualWorkStep(steps[i],model)){next=key(steps[i].mainOperation?.code)||key(steps[i].operationCode)||"END";break;}}
  return model.manualWork.routeContextMode==="NEXT_MAIN"?`${source}>${next}`:`${prev}>${source}>${next}`;
}
function matchingManualRule(node:BatchNode,model:CapacityModel){
  const main=key(node.mainOperation.code);const operation=key(node.members[0]?.step.operationCode);
  return model.manualWork.rules.find((rule)=>{
    const c=rule.condition;const exactMain=c.mainOperation==null?"":key(c.mainOperation);const mains=paintList(c.mainOperationIn).map(key);
    const exactOperation=c.operationCode==null?"":key(c.operationCode);const operations=paintList(c.operationCodeIn).map(key);
    if(exactMain&&exactMain!==main)return false;if(mains.length&&!mains.includes(main))return false;
    if(exactOperation&&exactOperation!==operation)return false;if(operations.length&&!operations.includes(operation))return false;return true;
  })||null;
}
function isUnmaskingNode(node:BatchNode,model:CapacityModel):boolean{return node.members[0]?manualStepKind(node.members[0].step,model)==="UNMASKING":key(node.mainOperation.code)==="UNMASKING";}
function manualResourceOptions(node:BatchNode,model:CapacityModel):string[]{
  const rule=matchingManualRule(node,model);const action=rule?.action||{};const configured=paintList(action.allowedResources);
  if(configured.length)return configured;
  if(node.resourceOptions.length)return node.resourceOptions;
  return [isUnmaskingNode(node,model)?model.manualWork.unmaskingResourceCode:model.manualWork.maskingResourceCode];
}
type ManualProfile={setup:number;workLaborMinutes:number;workElapsedMinutes:number;release:number;operators:number;effectiveOperators:number;laborResourceCode:string;ruleCode:string|null;parallelEfficiency:number};
function manualProfile(node:BatchNode,model:CapacityModel,laborPoolLimit:number):ManualProfile{
  const cfg=model.manualWork;const rule=matchingManualRule(node,model);const action=rule?.action||{};const unmask=isUnmaskingNode(node,model);
  const defaultSetup=unmask?cfg.unmaskingDefaultSetupMinutes:cfg.maskingDefaultSetupMinutes;
  const memberStats=node.members.map((m)=>{
    const details=jsonRecord(m.step.processTime.details);const setup=Math.max(0,n(details.setupMinutes,defaultSetup));const qty=Math.max(1,n(details.qty,n(m.row.qty,1)));const minPerPiece=n(details.minutesPerPiece,Number.NaN);const srcOperators=Math.max(1,n(details.operators,1));
    const labor=Number.isFinite(minPerPiece)?Math.max(0,minPerPiece*qty):Math.max(0,(Math.max(0,n(m.step.durationMinutes,0))-setup)*srcOperators);
    return{setup,labor};
  });
  const aggregation=key(action.setupAggregation)||cfg.setupAggregation;let setup:number;
  if(action.setupMinutes!=null)setup=paintNum(action.setupMinutes,defaultSetup);
  else if(aggregation==="SUM_MEMBER")setup=memberStats.reduce((sum,x)=>sum+x.setup,0);
  else if(aggregation==="FIXED")setup=defaultSetup;
  else setup=memberStats.length?Math.max(...memberStats.map(x=>x.setup)):defaultSetup;
  const workLaborMinutes=memberStats.reduce((sum,x)=>sum+x.labor,0);const parallelAllowed=paintBool(action.parallelAllowed,true);
  const maxOperators=Math.max(1,Math.min(Math.max(1,laborPoolLimit),Math.trunc(paintNum(action.maxOperators,cfg.defaultMaxOperatorsPerBatch))));
  const minOperators=Math.max(1,Math.min(maxOperators,Math.trunc(paintNum(action.minOperators,1))));const fixedOperators=Number(action.fixedOperators);
  const threshold=Math.max(1,paintNum(action.operator2ThresholdWorkMinutes,cfg.defaultOperator2ThresholdWorkMinutes));let operators=minOperators;
  if(Number.isFinite(fixedOperators)&&fixedOperators>0)operators=Math.max(minOperators,Math.min(maxOperators,Math.trunc(fixedOperators)));
  else if(parallelAllowed)operators=Math.max(minOperators,Math.min(maxOperators,Math.max(1,Math.ceil(workLaborMinutes/threshold))));
  const parallelEfficiency=Math.max(.1,Math.min(1,paintNum(action.parallelEfficiency,cfg.defaultParallelEfficiency)));const effectiveOperators=operators<=1?1:1+(operators-1)*parallelEfficiency;
  const workElapsedMinutes=workLaborMinutes/Math.max(1,effectiveOperators);const release=paintNum(action.releaseMinutes,cfg.defaultReleaseMinutes);
  const laborResourceCode=String(action.laborResourceCode|| (unmask?cfg.unmaskingLaborResourceCode:cfg.maskingLaborResourceCode));
  return{setup,workLaborMinutes,workElapsedMinutes,release,operators,effectiveOperators,laborResourceCode,ruleCode:rule?.code||null,parallelEfficiency};
}
type ManualSlot={start:number;end:number;segments:BatchSegment[];ruleCode:string|null;operators:number;laborResourceCode:string};
function findManualWorkSlot(state:OccupancyState,model:CapacityModel,def:CapacityResourceDefinition,instance:string,readyAt:number,node:BatchNode,horizonEnd:number):ManualSlot|null{
  const initialRule=matchingManualRule(node,model);const initialAction=initialRule?.action||{};const initialLaborCode=String(initialAction.laborResourceCode|| (isUnmaskingNode(node,model)?model.manualWork.unmaskingLaborResourceCode:model.manualWork.maskingLaborResourceCode));
  const laborDef=capacityResource(model,initialLaborCode);const p=manualProfile(node,model,laborDef.maxConcurrent);const durations:[CapacitySegmentKind,string,number,number][]=[
    ["MANUAL_SETUP","Setup",p.setup,1],["MANUAL_WORK",`Manual work · ${p.operators} operator${p.operators===1?"":"s"}`,p.workElapsedMinutes,p.operators],["MANUAL_RELEASE","Release",p.release,1],
  ];const elapsed=durations.reduce((sum,x)=>sum+x[2],0)*60_000;let t=readyAt;
  for(let guard=0;guard<2500&&t+elapsed<=horizonEnd;guard++){
    const aligned=alignWindow(t,elapsed,def);if(aligned==null)return null;t=aligned;let cursor=t;const segments:BatchSegment[]=[];
    for(const [kind,label,minutes,laborUnits] of durations){const end=cursor+Math.max(0,minutes)*60_000;if(end>cursor)segments.push({kind,label,start:cursor,end,occupiesCapacity:true,laborResourceCode:p.laborResourceCode,laborUnits});cursor=end;}
    const stationJump=instanceConflictJump(state,def.baseResourceCode,instance,t,cursor,def.changeoverMinutes,node.recipeNo);if(stationJump!=null&&stationJump>t){t=stationJump;continue;}
    const stationConcurrent=concurrencyJump(state,def.baseResourceCode,t,cursor,def.maxConcurrent);if(stationConcurrent!=null&&stationConcurrent>t){t=stationConcurrent;continue;}
    let jump:number|null=null;
    for(const seg of segments){const units=Math.max(1,seg.laborUnits||1);const j=capacityUnitsJump(state,p.laborResourceCode,seg.start,seg.end,laborDef.maxConcurrent,units);if(j!=null&&j>seg.start){jump=t+(j-seg.start);break;}}
    if(jump!=null&&jump>t){t=jump;continue;}
    return{start:t,end:cursor,segments,ruleCode:p.ruleCode,operators:p.operators,laborResourceCode:p.laborResourceCode};
  }
  return null;
}

function addNodeOccupancy(state:OccupancyState,node:BatchNode,base:string,instance:string):void{
  const sourceKind:CapacityTimelineEntry["sourceKind"]=node.sourceKind==="PROPOSED_BATCH"?"PROPOSED_BATCH":"EXISTING_BATCH";
  const jobs=node.members.map((x)=>x.row.jobNum);const surface=node.members.reduce((sum,x)=>sum+x.row.surfaceDm2,0);
  const segments=node.segments.length?node.segments:(node.start!=null&&node.end!=null?[{kind:"BLOCK" as const,label:"Process Block",start:node.start,end:node.end,occupiesCapacity:true}]:[]);
  for(let i=0;i<segments.length;i++){const seg=segments[i];if(seg.end<=seg.start)continue;state.intervals.push({id:`SIM:${node.id}:${i}`,batchRef:node.batchNo,sourceKind,baseResourceCode:base,resourceInstance:instance,recipeNo:node.recipeNo,start:seg.start,end:seg.end,status:node.status,mainOperationCode:node.mainOperation.code,jobs,surfaceDm2:surface,segmentKind:seg.kind,segmentLabel:seg.label,occupiesCapacity:seg.occupiesCapacity,capacityUnits:1});
    if(seg.laborResourceCode&&seg.laborUnits&&seg.laborUnits>0){state.intervals.push({id:`SIMLAB:${node.id}:${i}`,batchRef:node.batchNo,sourceKind,baseResourceCode:seg.laborResourceCode,resourceInstance:seg.laborResourceCode,recipeNo:null,start:seg.start,end:seg.end,status:node.status,mainOperationCode:node.mainOperation.code,jobs,surfaceDm2:surface,segmentKind:seg.kind,segmentLabel:`${seg.label} · labor`,occupiesCapacity:true,capacityUnits:seg.laborUnits});}
  }
}

function stepMain(step:StOutputStep):MainOperationDefinition|null{return step.mainOperation || null;}
function stepIsCapacityConstrained(step:StOutputStep):boolean{const m=stepMain(step);return Boolean(m?.scheduleEnabled&&m.resources.length);}

function buildChains(rows:StOutputJobAssessment[],rawMap:Map<number,RawContext>,planningModel:PlanningModel,batchModel:Awaited<ReturnType<typeof getBatchModel>>,capacityModel:CapacityModel):JobChain[]{
  const chains:JobChain[]=[];
  for(const row of rows){
    const raw=rawMap.get(row.planningJobId)||{partCluster:null,rawRow:{}};let lag=0;let prev:string|null=null;const members:MemberDraft[]=[];let capacityReview=false;let blockedReason:string|null=null;
    for(let i=0;i<row.steps.length;i++){
      const step=row.steps[i];const main=stepMain(step);const duration=Math.max(0,step.durationMinutes||0);
      if(!main?.scheduleEnabled){lag+=duration;continue;}
      const hasPaintDefault=capacityModel.painting.enabled&&capacityModel.painting.mainOperationCodes.some((x)=>key(x)===key(main.code))&&capacityModel.painting.defaultResources.length>0;
      const hasManualDefault=isManualWorkStep(step,capacityModel);
      if(!main.resources.length&&!hasPaintDefault&&!hasManualDefault){
        if(capacityModel.unmappedResourcePolicy==="BLOCK"){blockedReason=`NO_RESOURCE_MAPPING:${main.code}`;}
        else {capacityReview=true;lag+=duration;}
        continue;
      }
      let proposal:BatchProposal|null=null;let groupKey="";
      if(step.scheduled&&step.batchNo)groupKey=`FIX:${step.batchNo}`;
      else if(step.planned&&step.batchNo)groupKey=`EX:${step.batchNo}`;
      else{
        proposal=resolveBatchProposal({planningJobId:row.planningJobId,jobNum:row.jobNum,program:row.program,partCluster:raw.partCluster,part:row.part,revision:row.revision,nextOperation:step.operationCode,nextStOperation:step.operationCode,mainOperation:main,recipe:step.recipe,processTime:step.processTime,qty:row.qty,surfaceDm2:row.surfaceDm2,rawRow:raw.rawRow},batchModel);
        if(!proposal.eligible){blockedReason=proposal.eligibilityReason||`BATCH_RULE_BLOCK:${main.code}`;}
        const opPart=capacityModel.groupBySourceOperation?`|${key(step.operationCode)}`:"";
        const routePart=hasManualDefault&&capacityModel.manualWork.routeAwareGrouping?`|RCTX:${manualRouteContext(row.steps,i,capacityModel)}`:"";
        groupKey=`PROP:${key(main.code)}|${key(proposal.batchKey||main.code)}${opPart}${routePart}`;
      }
      const memberKey=`${row.planningJobId}:${step.routePosition}:${i}`;
      members.push({key:memberKey,row,step,stepIndex:i,previousMemberKey:prev,lagBeforeMinutes:lag,proposal,groupKey,raw});prev=memberKey;lag=0;
    }
    chains.push({row,members,tailLagMinutes:lag,capacityReview,blockedReason});
  }
  return chains;
}

function limitExceeded(current:MemberDraft[],next:MemberDraft,proposal:BatchProposal):boolean{
  if(!current.length)return false;const jobs=current.length+1;const qty=current.reduce((s,x)=>s+n(x.row.qty),0)+n(next.row.qty);const surface=current.reduce((s,x)=>s+x.row.surfaceDm2,0)+next.row.surfaceDm2;
  return (proposal.maxJobs!=null&&jobs>proposal.maxJobs)||(proposal.maxQty!=null&&qty>proposal.maxQty)||(proposal.maxSurfaceDm2!=null&&surface>proposal.maxSurfaceDm2);
}
function batchDuration(members:MemberDraft[],proposal:BatchProposal|null):number{
  const values=members.map(x=>x.step.durationMinutes);return aggregateProcessTime(values,proposal?.processTimeAggregation||"MAX") ?? Math.max(0,...values.map(x=>x||0));
}
function batchLatestStart(members:MemberDraft[]):number|null{return minDate(members.map(x=>parseWall(x.step.latestStart)));}

function buildNodes(chains:JobChain[],capacityModel:CapacityModel,splitAssignments:Map<string,SplitAssignment>|null=null):{nodes:BatchNode[];memberNode:Map<string,string>} {
  const groups=new Map<string,MemberDraft[]>();
  for(const c of chains){
    for(const m of c.members){
      const split=splitAssignments?.get(m.key);
      const groupKey=split&&m.groupKey.startsWith("PROP:")?`${m.groupKey}|SMART_SPLIT:${split.partIndex}/${split.partCount}`:m.groupKey;
      const a=groups.get(groupKey)||[];a.push(m);groups.set(groupKey,a);
    }
  }
  const nodes:BatchNode[]=[];const memberNode=new Map<string,string>();let seq=0;
  for(const [effectiveGroupKey,members0] of groups){
    const members=[...members0].sort((a,b)=>(a.step.latestStart||"9999").localeCompare(b.step.latestStart||"9999")||a.row.jobNum.localeCompare(b.row.jobNum));
    const firstSplit=splitAssignments?.get(members[0]?.key||"")||null;
    const sourceGroupKey=members[0]?.groupKey||effectiveGroupKey;
    const splitFields={
      sourceGroupKey,
      splitParentKey:firstSplit?.parentGroupKey||null,
      splitPartIndex:firstSplit?.partIndex??null,
      splitPartCount:firstSplit?.partCount??null,
      splitReason:firstSplit?.reason||null,
    };
    if(effectiveGroupKey.startsWith("FIX:")||effectiveGroupKey.startsWith("EX:")){
      const first=members[0];const main=first.step.mainOperation!;const fixed=effectiveGroupKey.startsWith("FIX:");const id=`N${++seq}`;
      const starts=members.map(x=>parseWall(x.step.scheduleStart)).filter((x):x is number=>x!=null);const ends=members.map(x=>parseWall(x.step.scheduleEnd)).filter((x):x is number=>x!=null);
      const node:BatchNode={id,sourceKind:fixed?"FIXED_SCHEDULE":"EXISTING_BATCH",batchNo:first.step.batchNo||effectiveGroupKey.slice(3),batchKey:null,mainOperation:main,recipeNo:first.step.recipe.recipeNo,recipeName:first.step.recipe.recipeName||first.step.recipe.sourceValue||null,members,durationMinutes:batchDuration(members,null),ruleCode:null,resourceOptions:main.resources.map(x=>x.code),fixedStart:fixed&&starts.length?Math.min(...starts):null,fixedEnd:fixed&&ends.length?Math.max(...ends):null,start:null,end:null,resourceBase:null,resourceInstance:null,mustStartBy:batchLatestStart(members),batchReadyAt:null,prerequisiteManualLoadMinutes:0,prerequisiteManualCompleteAt:null,prerequisiteManualBatches:[],dependencyBatches:[],blockingJobs:[],...splitFields,status:fixed?"FIXED":"UNSCHEDULED",reason:null,warnings:[],segments:[]};
      nodes.push(node);for(const m of members)memberNode.set(m.key,id);continue;
    }
    const proposal=members[0].proposal;let chunk:MemberDraft[]=[];let chunkNo=0;
    const flush=()=>{
      if(!chunk.length)return;
      const first=chunk[0],main=first.step.mainOperation!;const id=`N${++seq}`;const short=main.shortCode||main.code.slice(0,3);const batchNo=`${capacityModel.proposedBatchPrefix}_${short}_${String(++chunkNo).padStart(3,"0")}`;
      const splitPenalty=firstSplit?capacityModel.smartBatchSplit.splitPenaltyMinutes:0;
      const node:BatchNode={id,sourceKind:"PROPOSED_BATCH",batchNo,batchKey:proposal?.batchKey||null,mainOperation:main,recipeNo:first.step.recipe.recipeNo,recipeName:first.step.recipe.recipeName||first.step.recipe.sourceValue||null,members:chunk,durationMinutes:batchDuration(chunk,proposal)+splitPenalty,ruleCode:proposal?.ruleCode||null,resourceOptions:main.resources.map(x=>x.code),fixedStart:null,fixedEnd:null,start:null,end:null,resourceBase:null,resourceInstance:null,mustStartBy:batchLatestStart(chunk),batchReadyAt:null,prerequisiteManualLoadMinutes:0,prerequisiteManualCompleteAt:null,prerequisiteManualBatches:[],dependencyBatches:[],blockingJobs:[],...splitFields,status:"UNSCHEDULED",reason:null,warnings:[...(proposal?.warnings||[]),...(firstSplit?["SMART_BATCH_SPLIT",`SMART_SPLIT_PART:${firstSplit.partIndex}/${firstSplit.partCount}`,`SMART_SPLIT_PENALTY_MIN:${splitPenalty}`]:[])],segments:[]};
      nodes.push(node);for(const m of chunk)memberNode.set(m.key,id);chunk=[];
    };
    for(const m of members){
      const repeatsSameJob=chunk.some((x)=>x.row.planningJobId===m.row.planningJobId);
      if(repeatsSameJob||(proposal&&limitExceeded(chunk,m,proposal)))flush();
      chunk.push(m);
    }
    flush();
  }
  return{nodes,memberNode};
}

function predecessorReady(node:BatchNode,nodeMap:Map<string,BatchNode>,memberNode:Map<string,string>,scenarioStart:number):{ready:number;conflict:boolean}{
  let ready=scenarioStart;let conflict=false;
  for(const m of node.members){let r=scenarioStart+m.lagBeforeMinutes*60_000;if(m.previousMemberKey){const prevId=memberNode.get(m.previousMemberKey);const prev=prevId?nodeMap.get(prevId):null;if(prevId===node.id)continue;if(prev?.end!=null)r=prev.end+m.lagBeforeMinutes*60_000;else if(prev){return{ready:Number.POSITIVE_INFINITY,conflict:false};}}
    ready=Math.max(ready,r);
  }
  if(node.fixedStart!=null&&node.fixedStart<ready)conflict=true;return{ready,conflict};
}

function routeManualPrerequisites(node:BatchNode,nodeMap:Map<string,BatchNode>,memberNode:Map<string,string>,capacityModel:CapacityModel):BatchPrerequisiteInternal[]{
  const byNode=new Map<string,{node:BatchNode;jobs:Set<string>;ops:Set<string>}>();
  for(const member of node.members){
    let prevKey=member.previousMemberKey;
    const visited=new Set<string>();
    while(prevKey&&!visited.has(prevKey)){
      visited.add(prevKey);
      const prevId=memberNode.get(prevKey);
      if(!prevId||prevId===node.id)break;
      const prev=nodeMap.get(prevId);
      if(!prev||!isManualWorkNode(prev,capacityModel))break;
      let entry=byNode.get(prevId);
      if(!entry){entry={node:prev,jobs:new Set<string>(),ops:new Set<string>()};byNode.set(prevId,entry);}
      entry.jobs.add(member.row.jobNum);
      const prevMember=prev.members.find(pm=>pm.key===prevKey) || prev.members.find(pm=>pm.row.planningJobId===member.row.planningJobId);
      if(prevMember)entry.ops.add(prevMember.step.operationCode);
      prevKey=prevMember?.previousMemberKey||null;
    }
  }
  return [...byNode.entries()].map(([nodeId,entry])=>({
    nodeId,batchNo:entry.node.batchNo,mainOperationCode:entry.node.mainOperation.code,operationCodes:[...entry.ops].sort(),jobs:[...entry.jobs].sort(),
    loadMinutes:Math.max(0,entry.node.durationMinutes),start:entry.node.start,end:entry.node.end,
  })).sort((a,b)=>(a.end??Number.POSITIVE_INFINITY)-(b.end??Number.POSITIVE_INFINITY)||a.batchNo.localeCompare(b.batchNo));
}

function memberRouteReadyAt(member:MemberDraft,nodeMap:Map<string,BatchNode>,memberNode:Map<string,string>,scenarioStart:number):number|null{
  let ready=scenarioStart+member.lagBeforeMinutes*60_000;
  if(!member.previousMemberKey)return ready;
  const prevId=memberNode.get(member.previousMemberKey);
  if(!prevId)return ready;
  const prev=nodeMap.get(prevId);
  if(!prev||prev.end==null)return null;
  if(prev.id===memberNode.get(member.key))return ready;
  return prev.end+member.lagBeforeMinutes*60_000;
}

function routeBatchDependencies(node:BatchNode,nodeMap:Map<string,BatchNode>,memberNode:Map<string,string>,scenarioStart:number):BatchDependencyInternal[]{
  const grouped=new Map<string,{node:BatchNode;jobs:Set<string>;ops:Set<string>;ready:number|null}>();
  for(const member of node.members){
    if(!member.previousMemberKey)continue;
    const prevId=memberNode.get(member.previousMemberKey);
    if(!prevId||prevId===node.id)continue;
    const prev=nodeMap.get(prevId);if(!prev)continue;
    let entry=grouped.get(prevId);
    if(!entry){entry={node:prev,jobs:new Set<string>(),ops:new Set<string>(),ready:null};grouped.set(prevId,entry);}
    entry.jobs.add(member.row.jobNum);
    const prevMember=prev.members.find(pm=>pm.key===member.previousMemberKey)||prev.members.find(pm=>pm.row.planningJobId===member.row.planningJobId);
    if(prevMember)entry.ops.add(prevMember.step.operationCode);
    const ready=memberRouteReadyAt(member,nodeMap,memberNode,scenarioStart);
    if(ready!=null)entry.ready=entry.ready==null?ready:Math.max(entry.ready,ready);
  }
  return [...grouped.entries()].map(([nodeId,entry])=>({
    nodeId,batchNo:entry.node.batchNo,mainOperationCode:entry.node.mainOperation.code,operationCodes:[...entry.ops].sort(),jobs:[...entry.jobs].sort(),completeAt:entry.node.end,readyAt:entry.ready,
  })).sort((a,b)=>(a.readyAt??Number.POSITIVE_INFINITY)-(b.readyAt??Number.POSITIVE_INFINITY)||a.batchNo.localeCompare(b.batchNo));
}

function applyBatchGateAudit(node:BatchNode,nodeMap:Map<string,BatchNode>,memberNode:Map<string,string>,capacityModel:CapacityModel,ready:number,scenarioStart:number):void{
  node.batchReadyAt=Number.isFinite(ready)?ready:null;
  const dependencies=routeBatchDependencies(node,nodeMap,memberNode,scenarioStart);
  node.dependencyBatches=dependencies;
  const blocking=new Set<string>();
  for(const member of node.members){
    const memberReady=memberRouteReadyAt(member,nodeMap,memberNode,scenarioStart);
    if(memberReady!=null&&node.batchReadyAt!=null&&Math.abs(memberReady-node.batchReadyAt)<1000)blocking.add(member.row.jobNum);
  }
  node.blockingJobs=[...blocking].sort();
  const prerequisites=routeManualPrerequisites(node,nodeMap,memberNode,capacityModel);
  node.prerequisiteManualBatches=prerequisites;
  node.prerequisiteManualLoadMinutes=prerequisites.reduce((sum,x)=>sum+x.loadMinutes,0);
  node.prerequisiteManualCompleteAt=maxDate(prerequisites.map(x=>x.end));
  if(dependencies.length)node.warnings=[...new Set([...node.warnings,`ROUTE_DEPENDENCY_BATCHES:${dependencies.length}`,`BLOCKING_JOBS:${node.blockingJobs.length}`])];
  if(prerequisites.length){
    const jobs=new Set(prerequisites.flatMap(x=>x.jobs));
    node.warnings=[...new Set([...node.warnings,"ALL_BATCH_JOBS_READY_GATE",`MANUAL_PREREQ_BATCHES:${prerequisites.length}`,`MANUAL_PREREQ_JOBS:${jobs.size}`,`MANUAL_PREREQ_LOAD_MIN:${Math.round(node.prerequisiteManualLoadMinutes)}`])];
  }
}

function scheduleNodes(nodes:BatchNode[],memberNode:Map<string,string>,initial:OccupancyState,capacityModel:CapacityModel,recipeModel:RecipeModel,scenarioStart:number,horizonEnd:number):OccupancyState{
  const state:OccupancyState={intervals:initial.intervals.map(x=>({...x,jobs:[...x.jobs]}))};const map=new Map(nodes.map(x=>[x.id,x]));const pending=new Set(nodes.map(x=>x.id));
  let proposalSeq=0;
  while(pending.size){
    const readyNodes=[...pending].map(id=>map.get(id)!).filter(node=>node.members.every(m=>!m.previousMemberKey||memberNode.get(m.previousMemberKey)===node.id||!pending.has(memberNode.get(m.previousMemberKey)||"")));
    if(!readyNodes.length){for(const id of pending){const x=map.get(id)!;x.status="DEPENDENCY_CONFLICT";x.reason="CYCLIC_OR_UNRESOLVED_DEPENDENCY";}break;}
    readyNodes.sort((a,b)=>(a.mustStartBy??Number.POSITIVE_INFINITY)-(b.mustStartBy??Number.POSITIVE_INFINITY)||(a.sourceKind==="EXISTING_BATCH"?-1:1)-(b.sourceKind==="EXISTING_BATCH"?-1:1)||b.members.reduce((s,x)=>s+x.row.surfaceDm2,0)-a.members.reduce((s,x)=>s+x.row.surfaceDm2,0));
    const node=readyNodes[0];pending.delete(node.id);const dep=predecessorReady(node,map,memberNode,scenarioStart);applyBatchGateAudit(node,map,memberNode,capacityModel,dep.ready,scenarioStart);
    if(node.sourceKind==="FIXED_SCHEDULE"){
      node.start=node.fixedStart;node.end=node.fixedEnd;if(dep.conflict){node.status="DEPENDENCY_CONFLICT";node.reason="FIXED_SCHEDULE_STARTS_BEFORE_JOB_IS_READY";}else node.status="FIXED";
      const match=state.intervals.find(x=>key(x.batchRef)===key(node.batchNo)&&node.start!=null&&node.end!=null&&overlap(node.start,node.end,x.start,x.end));if(match){node.resourceBase=match.baseResourceCode;node.resourceInstance=match.resourceInstance;}
      if(node.start!=null&&node.end!=null)node.segments=[{kind:"BLOCK",label:"Existing Scheduled Block",start:node.start,end:node.end,occupiesCapacity:true}];
      continue;
    }
    if(!Number.isFinite(dep.ready)){node.status="DEPENDENCY_CONFLICT";node.reason="PREDECESSOR_NOT_SCHEDULED";continue;}
    let best:{start:number;end:number;base:string;instance:string;def:CapacityResourceDefinition;segments:BatchSegment[];paintRuleCode?:string|null;manualRuleCode?:string|null;manualOperators?:number}|null=null;
    const paintNode=isPaintingNode(node,capacityModel);const manualNode=isManualWorkNode(node,capacityModel);const resourceOptions=paintNode?paintingResourceOptions(node,capacityModel,recipeModel):manualNode?manualResourceOptions(node,capacityModel):node.resourceOptions;node.resourceOptions=resourceOptions;
    for(const resourceCode of resourceOptions){
      const def=capacityResource(capacityModel,resourceCode);
      for(const inst of capacityInstanceCodes(def)){
        if(capacityModel.chemicalLine.enabled&&key(def.baseResourceCode)===key(capacityModel.chemicalLine.resourceCode)){
          const slot=findChemicalSlot(state,capacityModel,def,inst,dep.ready,node,horizonEnd);
          if(slot&&(!best||slot.start<best.start||(slot.start===best.start&&def.sortOrder<best.def.sortOrder)))best={...slot,base:def.baseResourceCode,instance:inst,def};
        }else if(paintNode){
          const slot=findPaintingSlot(state,capacityModel,recipeModel,def,inst,dep.ready,node,horizonEnd);
          if(slot&&(!best||slot.start<best.start||(slot.start===best.start&&def.sortOrder<best.def.sortOrder)))best={...slot,base:def.baseResourceCode,instance:inst,def,paintRuleCode:slot.ruleCode};
        }else if(manualNode){
          const slot=findManualWorkSlot(state,capacityModel,def,inst,dep.ready,node,horizonEnd);
          if(slot&&(!best||slot.start<best.start||(slot.start===best.start&&def.sortOrder<best.def.sortOrder)))best={...slot,base:def.baseResourceCode,instance:inst,def,manualRuleCode:slot.ruleCode,manualOperators:slot.operators};
        }else{
          const slot=findSlot(state,def,inst,dep.ready,node.durationMinutes,node.recipeNo,horizonEnd);
          if(slot&&(!best||slot.start<best.start||(slot.start===best.start&&def.sortOrder<best.def.sortOrder)))best={...slot,base:def.baseResourceCode,instance:inst,def,segments:[{kind:"BLOCK",label:"Process Block",start:slot.start,end:slot.end,occupiesCapacity:true}]};
        }
      }
    }
    if(!best){node.status="UNSCHEDULED";node.reason=node.resourceOptions.length?"NO_FINITE_CAPACITY_SLOT_IN_HORIZON":"NO_RESOURCE_MAPPING";continue;}
    node.start=best.start;node.end=best.end;node.resourceBase=best.base;node.resourceInstance=best.instance;node.segments=best.segments;node.durationMinutes=Math.round((best.end-best.start)/60_000);node.status=node.mustStartBy!=null&&best.start>node.mustStartBy?"LATE_START":"ON_TIME";node.reason=node.status==="LATE_START"?"STARTS_AFTER_BACKWARD_LATEST_START":null;
    if(node.segments.some((seg)=>seg.kind==="WAIT_NDT"))node.warnings=[...new Set([...node.warnings,"NDT_START_SPACING_ADDED_WAIT"])];
    if(paintNode){node.warnings=[...new Set([...node.warnings,"PAINT_SEGMENTED_SCHEDULER"])] ;if(best.paintRuleCode)node.warnings=[...new Set([...node.warnings,`PAINT_RULE:${best.paintRuleCode}`])];}
    if(manualNode){
      const first=node.members[0];
      const routeContext=first?manualRouteContext(first.row.steps,first.stepIndex,capacityModel):"";
      node.warnings=[...new Set([...node.warnings,"MANUAL_WORKFORCE_SEGMENTED_SCHEDULER",`MANUAL_OPERATORS:${best.manualOperators||1}`,...(routeContext?[`MANUAL_ROUTE_CONTEXT:${routeContext}`]:[])])];
      if(best.manualRuleCode)node.warnings=[...new Set([...node.warnings,`MANUAL_RULE:${best.manualRuleCode}`])];
    }
    if(node.sourceKind==="PROPOSED_BATCH"){const short=node.mainOperation.shortCode||node.mainOperation.code.slice(0,3);node.batchNo=`${capacityModel.proposedBatchPrefix}_${short}_${String(++proposalSeq).padStart(3,"0")}`;}
    addNodeOccupancy(state,node,best.base,best.instance);
  }
  return state;
}

function evaluateJobs(chains:JobChain[],nodes:BatchNode[],memberNode:Map<string,string>,scenarioStart:number,cutoff:number):CapacityJobResult[]{
  const nodeMap=new Map(nodes.map(x=>[x.id,x]));const out:CapacityJobResult[]=[];
  for(const chain of chains){let cursor=scenarioStart;let unscheduled=false;let conflict=false;let reason=chain.blockedReason;for(const m of chain.members){cursor+=m.lagBeforeMinutes*60_000;const id=memberNode.get(m.key);const node=id?nodeMap.get(id):null;if(!node||node.start==null||node.end==null){unscheduled=true;reason=reason||node?.reason||"CAPACITY_BATCH_NOT_SCHEDULED";break;}if(node.start<cursor){conflict=true;reason=reason||"PRECEDENCE_CONFLICT";}cursor=Math.max(cursor,node.end);}if(!unscheduled)cursor+=chain.tailLagMinutes*60_000;
    let finiteStatus:CapacityJobResult["finiteStatus"]="ON_TIME";if(chain.blockedReason||unscheduled)finiteStatus="UNSCHEDULED";else if(conflict)finiteStatus="REVIEW";else if(cursor>cutoff)finiteStatus="LATE";else if(chain.capacityReview)finiteStatus="REVIEW";
    const contributes=!unscheduled&&!conflict&&cursor<=cutoff;
    out.push({jobNum:chain.row.jobNum,planningJobId:chain.row.planningJobId,sourceStatus:chain.row.outputStatus,surfaceDm2:chain.row.surfaceDm2,finishAt:unscheduled?null:wallIso(cursor),cutoffAt:wallIso(cutoff)!,finiteStatus,contributes,capacityReview:chain.capacityReview,reason});
  }
  return out;
}

function timelineRows(state:OccupancyState,model:CapacityModel,startAt:number,horizonEnd:number):CapacityTimelineEntry[]{
  return state.intervals.filter(x=>overlap(startAt,horizonEnd,x.start,x.end)).sort((a,b)=>a.start-b.start||a.resourceInstance.localeCompare(b.resourceInstance)).map(x=>({id:x.id,batchNo:x.batchRef,sourceKind:x.sourceKind,baseResourceCode:x.baseResourceCode,resourceInstance:x.resourceInstance,resourceLabel:capacityResource(model,x.baseResourceCode).label,mainOperationCode:x.mainOperationCode,recipeNo:x.recipeNo,startAt:wallIso(x.start)!,endAt:wallIso(x.end)!,durationMinutes:Math.round((x.end-x.start)/60_000),segmentKind:x.segmentKind,segmentLabel:x.segmentLabel,status:x.status,jobs:x.jobs,surfaceDm2:x.surfaceDm2,occupiesCapacity:x.occupiesCapacity,capacityUnits:Math.max(1,x.capacityUnits||1)}));
}
function resourceSummary(state:OccupancyState,nodes:BatchNode[],model:CapacityModel,startAt:number,cutoff:number):CapacityResourceSummary[]{
  const defs=[...model.resourceList];const usedCodes=new Set(state.intervals.map(x=>key(x.baseResourceCode)));for(const c of usedCodes)if(!defs.some(d=>key(d.baseResourceCode)===c))defs.push(capacityResource(model,c));
  return defs.sort((a,b)=>a.sortOrder-b.sortOrder||a.code.localeCompare(b.code)).map(def=>{
    const intervals=state.intervals.filter(x=>key(x.baseResourceCode)===key(def.baseResourceCode));const capacityIntervals=intervals.filter(x=>x.occupiesCapacity);
    const existing=capacityIntervals.filter(x=>x.sourceKind==="EXISTING_SCHEDULE").reduce((sum,x)=>sum+clipMinutes(x.start,x.end,startAt,cutoff)*Math.max(1,x.capacityUnits||1),0);
    const simulated=capacityIntervals.filter(x=>x.sourceKind!=="EXISTING_SCHEDULE").reduce((sum,x)=>sum+clipMinutes(x.start,x.end,startAt,cutoff)*Math.max(1,x.capacityUnits||1),0);
    const isChemical=model.chemicalLine.enabled&&key(def.baseResourceCode)===key(model.chemicalLine.resourceCode);
    const available=Math.max(0,(cutoff-startAt)/60_000*(isChemical?def.instanceCount:def.maxConcurrent));
    const processExisting=isChemical?intervals.filter(x=>x.sourceKind==="EXISTING_SCHEDULE"&&model.chemicalLine.existingSchedulePolicy==="CONSERVATIVE_PROCESS_BLOCK").reduce((sum,x)=>sum+clipMinutes(x.start,x.end,startAt,cutoff),0):0;
    const processSimulated=isChemical?intervals.filter(x=>x.sourceKind!=="EXISTING_SCHEDULE"&&x.segmentKind==="PROCESS").reduce((sum,x)=>sum+clipMinutes(x.start,x.end,startAt,cutoff),0):0;
    const processAvailable=isChemical?Math.max(0,(cutoff-startAt)/60_000*model.chemicalLine.processMaxConcurrent):0;
    const late=nodes.filter(x=>key(x.resourceBase)===key(def.baseResourceCode)&&(x.status==="LATE_START"||x.status==="UNSCHEDULED")).length;
    return{baseResourceCode:def.baseResourceCode,label:def.label,instanceCount:def.instanceCount,maxConcurrent:def.maxConcurrent,existingMinutes:existing,simulatedMinutes:simulated,availableMinutes:available,utilizationPct:available>0?Math.min(999,(existing+simulated)/available*100):0,processMaxConcurrent:isChemical?model.chemicalLine.processMaxConcurrent:null,processExistingMinutes:processExisting,processSimulatedMinutes:processSimulated,processAvailableMinutes:processAvailable,processUtilizationPct:isChemical&&processAvailable>0?Math.min(999,(processExisting+processSimulated)/processAvailable*100):null,lateOrUnscheduledBatches:late};
  });
}

function buildDependencyEdges(chains:JobChain[],nodes:BatchNode[],memberNode:Map<string,string>,scenarioStart:number,enabled:boolean):CapacityDependencyEdge[]{
  if(!enabled)return[];
  const nodeMap=new Map(nodes.map(x=>[x.id,x]));const memberByKey=new Map<string,MemberDraft>();
  for(const chain of chains)for(const member of chain.members)memberByKey.set(member.key,member);
  const edges:CapacityDependencyEdge[]=[];const seen=new Set<string>();
  for(const toNode of nodes){
    for(const member of toNode.members){
      if(!member.previousMemberKey)continue;
      const fromId=memberNode.get(member.previousMemberKey);if(!fromId||fromId===toNode.id)continue;
      const fromNode=nodeMap.get(fromId);const fromMember=memberByKey.get(member.previousMemberKey);if(!fromNode||!fromMember)continue;
      const ready=fromNode.end==null?null:fromNode.end+member.lagBeforeMinutes*60_000;
      const edgeKey=`${fromId}|${toNode.id}|${member.row.planningJobId}|${member.key}`;if(seen.has(edgeKey))continue;seen.add(edgeKey);
      edges.push({
        fromBatchNo:fromNode.batchNo,toBatchNo:toNode.batchNo,jobNum:member.row.jobNum,
        fromMainOperationCode:fromNode.mainOperation.code,toMainOperationCode:toNode.mainOperation.code,
        fromOperationCode:fromMember.step.operationCode,toOperationCode:member.step.operationCode,
        fromRoutePosition:fromMember.step.routePosition??null,toRoutePosition:member.step.routePosition??null,
        lagMinutes:member.lagBeforeMinutes,readyAt:wallIso(ready),
        blocking:ready!=null&&toNode.batchReadyAt!=null&&Math.abs(ready-toNode.batchReadyAt)<1000,
      });
    }
  }
  return edges.sort((a,b)=>(a.readyAt||"9999").localeCompare(b.readyAt||"9999")||a.toBatchNo.localeCompare(b.toBatchNo)||a.jobNum.localeCompare(b.jobNum));
}

function deriveSmartSplitAssignments(baseline:Simulation,capacityModel:CapacityModel,scenarioStart:number):Map<string,SplitAssignment>{
  const cfg=capacityModel.smartBatchSplit;const out=new Map<string,SplitAssignment>();if(!cfg.enabled)return out;
  const nodeMap=new Map(baseline.nodes.map(x=>[x.id,x]));const threshold=Math.max(0,cfg.delayThresholdMinutes)*60_000;
  for(const node of baseline.nodes){
    if(node.sourceKind!=="PROPOSED_BATCH"||node.members.length<=cfg.minReadyJobs)continue;
    const rows=node.members.map(member=>({member,ready:memberRouteReadyAt(member,nodeMap,baseline.memberNode,scenarioStart)})).filter((x):x is {member:MemberDraft;ready:number}=>x.ready!=null&&Number.isFinite(x.ready));
    if(rows.length!==node.members.length||rows.length<=cfg.minReadyJobs)continue;
    rows.sort((a,b)=>a.ready-b.ready||a.member.row.jobNum.localeCompare(b.member.row.jobNum));
    const spread=rows[rows.length-1].ready-rows[0].ready;if(spread<threshold||threshold<=0)continue;
    const parts:Array<typeof rows>=[];let current:Array<typeof rows[number]>=[];
    const qualifies=(items:Array<typeof rows[number]>)=>items.length>=cfg.minReadyJobs&&items.reduce((sum,x)=>sum+x.member.row.surfaceDm2,0)>=cfg.minReadySurfaceDm2;
    for(const row of rows){
      if(current.length&&parts.length<cfg.maxParts-1&&row.ready-current[current.length-1].ready>=threshold&&qualifies(current)){parts.push(current);current=[];}
      current.push(row);
    }
    if(current.length)parts.push(current);
    if(parts.length<2||!qualifies(parts[0]))continue;
    const reason=`ROUTE_READY_SPREAD_${Math.round(spread/60_000)}MIN`;
    for(let i=0;i<parts.length;i++)for(const row of parts[i])out.set(row.member.key,{partIndex:i+1,partCount:parts.length,reason,parentGroupKey:`${node.sourceGroupKey}|BASE:${node.id}`});
  }
  return out;
}

async function simulate(rows:StOutputJobAssessment[],candidateIds:Set<number>,rawMap:Map<number,RawContext>,planningModel:PlanningModel,batchModel:Awaited<ReturnType<typeof getBatchModel>>,capacityModel:CapacityModel,recipeModel:RecipeModel,baseOccupancy:OccupancyState,scenarioStart:number,cutoff:number,horizonEnd:number,splitAssignments:Map<string,SplitAssignment>|null=null):Promise<Simulation>{
  const chains=buildChains(rows,rawMap,planningModel,batchModel,capacityModel);
  const {nodes,memberNode}=buildNodes(chains,capacityModel,splitAssignments);
  const state=scheduleNodes(nodes,memberNode,baseOccupancy,capacityModel,recipeModel,scenarioStart,horizonEnd);
  const dependencies=buildDependencyEdges(chains,nodes,memberNode,scenarioStart,capacityModel.dependencyGraphEnabled);
  const jobs=evaluateJobs(chains,nodes,memberNode,scenarioStart,cutoff);
  const feasiblePlannedSurface=jobs.filter(x=>x.sourceStatus==="PLANNED"&&x.contributes).reduce((sum,x)=>sum+x.surfaceDm2,0);
  const feasibleCandidateSurface=jobs.filter(x=>candidateIds.has(x.planningJobId)&&x.contributes).reduce((sum,x)=>sum+x.surfaceDm2,0);
  const selectedCandidateSurface=jobs.filter(x=>candidateIds.has(x.planningJobId)).reduce((sum,x)=>sum+x.surfaceDm2,0);
  const warnings:string[]=[];
  if(chains.some(x=>x.capacityReview))warnings.push("UNMAPPED_AREA_CAPACITY_REVIEW");
  if(nodes.some(x=>x.status==="UNSCHEDULED"))warnings.push("ONE_OR_MORE_BATCHES_HAVE_NO_CAPACITY_SLOT");
  if(nodes.some(x=>x.status==="DEPENDENCY_CONFLICT"))warnings.push("SCHEDULE_PRECEDENCE_CONFLICT");
  if(capacityModel.chemicalLine.enabled&&baseOccupancy.intervals.some(x=>key(x.baseResourceCode)===key(capacityModel.chemicalLine.resourceCode))&&capacityModel.chemicalLine.existingSchedulePolicy==="CONSERVATIVE_PROCESS_BLOCK")warnings.push("EXISTING_CHEMICAL_SCHEDULE_IS_TREATED_AS_CONSERVATIVE_PROCESS_OCCUPANCY");
  if(capacityModel.manualWork.enabled&&nodes.some(x=>isManualWorkNode(x,capacityModel)))warnings.push("MASKING_UNMASKING_WORKSTATION_AND_LABOR_CAPACITY_ACTIVE");
  if(capacityModel.dependencyGraphEnabled&&dependencies.length)warnings.push(`FULL_ROUTE_DEPENDENCY_EDGES:${dependencies.length}`);
  if(nodes.some(x=>x.splitParentKey))warnings.push("SMART_BATCH_SPLIT_APPLIED");
  return{nodes,chains,memberNode,dependencies,jobs,timeline:timelineRows(state,capacityModel,scenarioStart,horizonEnd),resources:resourceSummary(state,nodes,capacityModel,scenarioStart,cutoff),feasiblePlannedSurface,feasibleCandidateSurface,selectedCandidateSurface,warnings};
}

function nodeToPublic(node:BatchNode):ProposedCapacityBatch{
  const prerequisiteJobs=[...new Set(node.prerequisiteManualBatches.flatMap(x=>x.jobs))];
  const dependencyJobs=[...new Set(node.dependencyBatches.flatMap(x=>x.jobs))];
  return{
    id:node.id,batchNo:node.batchNo,sourceKind:node.sourceKind,mainOperationCode:node.mainOperation.code,mainOperationLabel:node.mainOperation.label,batchKey:node.batchKey,
    recipeNo:node.recipeNo,recipeName:node.recipeName,jobCount:node.members.length,jobs:node.members.map(x=>x.row.jobNum),totalQty:node.members.reduce((sum,x)=>sum+n(x.row.qty),0),totalSurfaceDm2:node.members.reduce((sum,x)=>sum+x.row.surfaceDm2,0),
    durationMinutes:node.durationMinutes,batchRuleCode:node.ruleCode,resourceBase:node.resourceBase,resourceInstance:node.resourceInstance,startAt:wallIso(node.start),endAt:wallIso(node.end),mustStartBy:wallIso(node.mustStartBy),
    batchReadyAt:wallIso(node.batchReadyAt),prerequisiteManualBatchCount:node.prerequisiteManualBatches.length,prerequisiteManualJobCount:prerequisiteJobs.length,prerequisiteManualLoadMinutes:node.prerequisiteManualLoadMinutes,prerequisiteManualCompleteAt:wallIso(node.prerequisiteManualCompleteAt),
    prerequisiteManualBatches:node.prerequisiteManualBatches.map(x=>({batchNo:x.batchNo,mainOperationCode:x.mainOperationCode,operationCodes:x.operationCodes,jobs:x.jobs,loadMinutes:x.loadMinutes,elapsedMinutes:x.start!=null&&x.end!=null?Math.max(0,Math.round((x.end-x.start)/60_000)):null,startAt:wallIso(x.start),endAt:wallIso(x.end)})),
    dependencyBatchCount:node.dependencyBatches.length,dependencyJobCount:dependencyJobs.length,
    dependencyBatches:node.dependencyBatches.map(x=>({batchNo:x.batchNo,mainOperationCode:x.mainOperationCode,operationCodes:x.operationCodes,jobs:x.jobs,completeAt:wallIso(x.completeAt),readyAt:wallIso(x.readyAt)})),
    blockingJobs:node.blockingJobs,
    smartSplitApplied:Boolean(node.splitParentKey),splitParentKey:node.splitParentKey,splitPartIndex:node.splitPartIndex,splitPartCount:node.splitPartCount,splitReason:node.splitReason,
    status:node.status,reason:node.reason,warnings:node.warnings,segments:node.segments.map(seg=>({kind:seg.kind,label:seg.label,startAt:wallIso(seg.start)!,endAt:wallIso(seg.end)!,durationMinutes:Math.round((seg.end-seg.start)/60_000),occupiesCapacity:seg.occupiesCapacity}))
  };
}

export async function calculateFiniteCapacityTarget(options:FiniteCapacityOptions):Promise<FiniteCapacityResult>{
  const [base,planningModel,batchModel,capacityModel,recipeModel,bootstrap]=await Promise.all([
    calculateStOutputTarget({targetDate:options.targetDate,cutoffTime:options.cutoffTime,targetValue:options.targetValue}),
    getPlanningModel(),getBatchModel(),getCapacityModel(),getRecipeModel(),getConfigBootstrap(),
  ]);
  const cutoff=wallDateTime(options.targetDate,options.cutoffTime);
  const routeSnapshot=parseWall(base.routeSnapshotAt);
  const configuredStart=wallDateTime(addDays(options.targetDate,-capacityModel.lookbackDays),capacityModel.scenarioStartTime);
  const scenarioStart=Math.max(configuredStart,routeSnapshot||configuredStart);
  const horizonEnd=cutoff+capacityModel.spillHours*60*60_000;
  const plannedRows=base.rows.filter(x=>x.outputStatus==="PLANNED");
  const candidates=candidateSort(base.rows.filter(x=>x.outputStatus==="NEED_PLAN"&&!x.needsReview&&x.surfaceDm2>0));
  const candidateByJob=new Map(candidates.map(x=>[x.jobNum,x]));const selected:Set<number>=new Set();
  for(const job of base.recommendedJobNums){const row=candidateByJob.get(job);if(row)selected.add(row.planningJobId);if(selected.size>=capacityModel.maxCandidateJobs)break;}
  const potential=candidates.slice(0,capacityModel.maxCandidateJobs);
  const ids=[...new Set([...plannedRows,...potential].map(x=>x.planningJobId))];
  const planningProfile=bootstrap.sources.PLANNING;
  const rawMap=await loadRawContexts(ids,planningProfile.sheetName||planningProfile.displayName);
  const existing=await loadExistingOccupancy(capacityModel,scenarioStart,horizonEnd);
  let sim:Simulation|null=null;let iteration=0;let cursor=0;
  while(iteration++<8){
    const selectedRows=potential.filter(x=>selected.has(x.planningJobId));const capacityRows=[...plannedRows,...selectedRows];
    sim=await simulate(capacityRows,selected,rawMap,planningModel,batchModel,capacityModel,recipeModel,existing,scenarioStart,cutoff,horizonEnd);
    const forecast=base.summary.actualSurface+base.summary.committedSurface+sim.feasiblePlannedSurface+sim.feasibleCandidateSurface;
    if(forecast>=options.targetValue)break;
    const need=Math.max(0,options.targetValue-forecast)*capacityModel.candidateSurfaceMultiplier;let added=0;
    while(cursor<potential.length&&added<need&&selected.size<capacityModel.maxCandidateJobs){const row=potential[cursor++];if(selected.has(row.planningJobId))continue;selected.add(row.planningJobId);added+=row.surfaceDm2;}
    if(added<=0)break;
  }
  const finalSelectedRows=potential.filter(x=>selected.has(x.planningJobId));const capacityRows=[...plannedRows,...finalSelectedRows];
  const baselineSim=await simulate(capacityRows,selected,rawMap,planningModel,batchModel,capacityModel,recipeModel,existing,scenarioStart,cutoff,horizonEnd);
  const baselineFiniteForecast=base.summary.actualSurface+base.summary.committedSurface+baselineSim.feasiblePlannedSurface+baselineSim.feasibleCandidateSurface;
  let finalSim=baselineSim;let splitRecoveredSurface=0;let splitSourceBatchCount=0;
  const mayTrySplit=capacityModel.smartBatchSplit.enabled&&(!capacityModel.smartBatchSplit.onlyWhenTargetRecovery||baselineFiniteForecast<options.targetValue);
  if(mayTrySplit){
    const splitAssignments=deriveSmartSplitAssignments(baselineSim,capacityModel,scenarioStart);
    if(splitAssignments.size){
      splitSourceBatchCount=new Set([...splitAssignments.values()].map(x=>x.parentGroupKey)).size;
      const splitSim=await simulate(capacityRows,selected,rawMap,planningModel,batchModel,capacityModel,recipeModel,existing,scenarioStart,cutoff,horizonEnd,splitAssignments);
      const splitForecast=base.summary.actualSurface+base.summary.committedSurface+splitSim.feasiblePlannedSurface+splitSim.feasibleCandidateSurface;
      const baselineProblems=baselineSim.nodes.filter(x=>x.status==="LATE_START"||x.status==="UNSCHEDULED"||x.status==="DEPENDENCY_CONFLICT").length;
      const splitProblems=splitSim.nodes.filter(x=>x.status==="LATE_START"||x.status==="UNSCHEDULED"||x.status==="DEPENDENCY_CONFLICT").length;
      if(splitForecast>baselineFiniteForecast+0.001||(!capacityModel.smartBatchSplit.onlyWhenTargetRecovery&&splitForecast>=baselineFiniteForecast-0.001&&splitProblems<baselineProblems)){
        finalSim=splitSim;splitRecoveredSurface=Math.max(0,splitForecast-baselineFiniteForecast);
      }else splitSourceBatchCount=0;
    }
  }
  sim=finalSim;
  const finiteForecast=base.summary.actualSurface+base.summary.committedSurface+sim.feasiblePlannedSurface+sim.feasibleCandidateSurface;
  const remainingGap=Math.max(0,options.targetValue-finiteForecast);
  const contributing=sim.jobs.filter(x=>x.contributes&&selected.has(x.planningJobId));
  const anyReview=contributing.some(x=>x.capacityReview);
  const targetFeasibility:FiniteCapacityResult["targetFeasibility"]=remainingGap>0?"NOT_FEASIBLE":anyReview?"PROVISIONAL":"CONFIRMED";
  const publicBatches=sim.nodes.map(nodeToPublic).sort((a,b)=>(a.startAt||"9999").localeCompare(b.startAt||"9999")||(a.mustStartBy||"9999").localeCompare(b.mustStartBy||"9999"));
  const splitBatchCount=publicBatches.filter(x=>x.smartSplitApplied).length;
  if(splitBatchCount&&!splitSourceBatchCount)splitSourceBatchCount=new Set(publicBatches.filter(x=>x.smartSplitApplied&&x.splitParentKey).map(x=>x.splitParentKey!)).size;
  const warnings=[...new Set(sim.warnings)];
  if(splitBatchCount)warnings.push(`SMART_BATCH_SPLIT_BATCHES:${splitBatchCount}`,`SMART_BATCH_SPLIT_RECOVERED_DM2:${Math.round(splitRecoveredSurface)}`);
  if(targetFeasibility==="PROVISIONAL")warnings.push("TARGET_REACHED_BUT_ONE_OR_MORE_CONTRIBUTING_STEPS_HAVE_NO_CONFIGURED_FINITE_RESOURCE");
  if(remainingGap>0)warnings.push(`FINITE_CAPACITY_GAP:${Math.round(remainingGap)}`);
  const processTimeForecast=base.summary.actualSurface+base.summary.committedSurface+sumSurface(plannedRows)+sim.selectedCandidateSurface;
  return{
    targetDate:options.targetDate,cutoffTime:options.cutoffTime,cutoffAt:wallIso(cutoff)!,targetValue:options.targetValue,scenarioStartAt:wallIso(scenarioStart)!,horizonEndAt:wallIso(horizonEnd)!,endpointOperation:base.endpointOperation,targetFeasibility,
    summary:{actualSurface:base.summary.actualSurface,committedSurface:base.summary.committedSurface,finitePlannedSurface:sim.feasiblePlannedSurface,finiteRecommendedSurface:sim.feasibleCandidateSurface,selectedCandidateSurface:sim.selectedCandidateSurface,processTimeForecastSurface:processTimeForecast,finiteCapacityForecastSurface:finiteForecast,baselineFiniteCapacityForecastSurface:baselineFiniteForecast,splitRecoveredSurface,dependencyEdgeCount:sim.dependencies.length,splitBatchCount,splitSourceBatchCount,remainingGap,achievementPct:options.targetValue>0?Math.min(999,finiteForecast/options.targetValue*100):0,proposedBatchCount:publicBatches.filter(x=>x.sourceKind==="PROPOSED_BATCH").length,existingBatchToScheduleCount:publicBatches.filter(x=>x.sourceKind==="EXISTING_BATCH").length,lateBatchCount:publicBatches.filter(x=>x.status==="LATE_START").length,unscheduledBatchCount:publicBatches.filter(x=>x.status==="UNSCHEDULED"||x.status==="DEPENDENCY_CONFLICT").length,capacityReviewJobCount:sim.jobs.filter(x=>x.capacityReview).length},
    selectedJobNums:potential.filter(x=>selected.has(x.planningJobId)).map(x=>x.jobNum),finiteRecommendedJobNums:contributing.map(x=>x.jobNum),batches:publicBatches,jobs:sim.jobs,timeline:sim.timeline,resources:sim.resources,dependencies:sim.dependencies,warnings,
  };
}

