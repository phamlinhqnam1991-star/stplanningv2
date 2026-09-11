import { query } from "@/lib/db";
import { getConfigBootstrap } from "@/lib/config";
import { aggregateProcessTime, getBatchModel, resolveBatchProposal, type BatchProposal } from "@/lib/batch-model";
import { getCapacityModel, capacityInstanceCodes, capacityResource, type CapacityModel, type CapacityResourceDefinition } from "@/lib/capacity-model";
import { getPlanningModel, type MainOperationDefinition, type PlanningModel } from "@/lib/planning-model";
import { calculateStOutputTarget, type StOutputJobAssessment, type StOutputStep } from "@/lib/st-output-engine";

export type FiniteCapacityOptions = {
  targetDate: string;
  cutoffTime: string;
  targetValue: number;
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
  status: string;
  jobs: string[];
  surfaceDm2: number;
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
  status: "FIXED" | "ON_TIME" | "LATE_START" | "UNSCHEDULED" | "DEPENDENCY_CONFLICT";
  reason: string | null;
  warnings: string[];
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
  status: ProposedCapacityBatch["status"];
  reason: string | null;
  warnings: string[];
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
};
type OccupancyState = { intervals: OccupancyInterval[] };
type Simulation = {
  nodes: BatchNode[];
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
  for(const inst of instances){if(!state.intervals.some(x=>x.baseResourceCode===def.baseResourceCode&&x.resourceInstance===inst&&overlap(start,end,x.start,x.end)))return inst;}
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
    state.intervals.push({id:`S:${x.id}:${resourceCode}`,batchRef:String(x.batch_ref||""),sourceKind:"EXISTING_SCHEDULE",baseResourceCode:inf.base,resourceInstance:instance,recipeNo:x.recipe_no==null?null:String(x.recipe_no),start,end,status:String(x.status||""),mainOperationCode:null,jobs:[],surfaceDm2:0});
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
  const list=state.intervals.filter(x=>key(x.baseResourceCode)===key(base)&&key(x.resourceInstance)===key(instance)).sort((a,b)=>a.start-b.start);
  let prior:OccupancyInterval|null=null;
  for(const x of list){if(x.end<=start){if(!prior||x.end>prior.end)prior=x;continue;}if(overlap(start,end,x.start,x.end))return x.end;}
  if(prior&&changeover>0&&key(prior.recipeNo)!==key(recipe)&&start<prior.end+changeover*60_000)return prior.end+changeover*60_000;
  return null;
}
function concurrencyJump(state:OccupancyState,base:string,start:number,end:number,maxConcurrent:number):number|null{
  if(maxConcurrent<=0)return start;
  const list=state.intervals.filter(x=>key(x.baseResourceCode)===key(base)&&overlap(start,end,x.start,x.end)); if(list.length<maxConcurrent)return null;
  const points=[start,end,...list.flatMap(x=>[Math.max(start,x.start),Math.min(end,x.end)])].sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++){
    if(points[i+1]<=points[i])continue;const mid=(points[i]+points[i+1])/2;const active=list.filter(x=>x.start<mid&&x.end>mid);
    if(active.length>=maxConcurrent)return Math.min(...active.map(x=>x.end));
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

function stepMain(step:StOutputStep):MainOperationDefinition|null{return step.mainOperation || null;}
function stepIsCapacityConstrained(step:StOutputStep):boolean{const m=stepMain(step);return Boolean(m?.scheduleEnabled&&m.resources.length);}

function buildChains(rows:StOutputJobAssessment[],rawMap:Map<number,RawContext>,planningModel:PlanningModel,batchModel:Awaited<ReturnType<typeof getBatchModel>>,capacityModel:CapacityModel):JobChain[]{
  const chains:JobChain[]=[];
  for(const row of rows){
    const raw=rawMap.get(row.planningJobId)||{partCluster:null,rawRow:{}};let lag=0;let prev:string|null=null;const members:MemberDraft[]=[];let capacityReview=false;let blockedReason:string|null=null;
    for(let i=0;i<row.steps.length;i++){
      const step=row.steps[i];const main=stepMain(step);const duration=Math.max(0,step.durationMinutes||0);
      if(!main?.scheduleEnabled){lag+=duration;continue;}
      if(!main.resources.length){
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
        groupKey=`PROP:${key(main.code)}|${key(proposal.batchKey||main.code)}${opPart}`;
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

function buildNodes(chains:JobChain[],capacityModel:CapacityModel):{nodes:BatchNode[];memberNode:Map<string,string>} {
  const groups=new Map<string,MemberDraft[]>();for(const c of chains)for(const m of c.members){const a=groups.get(m.groupKey)||[];a.push(m);groups.set(m.groupKey,a);}
  const nodes:BatchNode[]=[];const memberNode=new Map<string,string>();let seq=0;
  for(const [groupKey,members0] of groups){
    const members=[...members0].sort((a,b)=>(a.step.latestStart||"9999").localeCompare(b.step.latestStart||"9999")||a.row.jobNum.localeCompare(b.row.jobNum));
    if(groupKey.startsWith("FIX:")||groupKey.startsWith("EX:")){
      const first=members[0];const main=first.step.mainOperation!;const fixed=groupKey.startsWith("FIX:");const id=`N${++seq}`;
      const starts=members.map(x=>parseWall(x.step.scheduleStart)).filter((x):x is number=>x!=null);const ends=members.map(x=>parseWall(x.step.scheduleEnd)).filter((x):x is number=>x!=null);
      const node:BatchNode={id,sourceKind:fixed?"FIXED_SCHEDULE":"EXISTING_BATCH",batchNo:first.step.batchNo||groupKey.slice(3),batchKey:null,mainOperation:main,recipeNo:first.step.recipe.recipeNo,recipeName:first.step.recipe.recipeName||first.step.recipe.sourceValue||null,members,durationMinutes:batchDuration(members,null),ruleCode:null,resourceOptions:main.resources.map(x=>x.code),fixedStart:fixed&&starts.length?Math.min(...starts):null,fixedEnd:fixed&&ends.length?Math.max(...ends):null,start:null,end:null,resourceBase:null,resourceInstance:null,mustStartBy:batchLatestStart(members),status:fixed?"FIXED":"UNSCHEDULED",reason:null,warnings:[]};
      nodes.push(node);for(const m of members)memberNode.set(m.key,id);continue;
    }
    const proposal=members[0].proposal;let chunk:MemberDraft[]=[];let chunkNo=0;
    const flush=()=>{if(!chunk.length)return;const first=chunk[0],main=first.step.mainOperation!;const id=`N${++seq}`;const short=main.shortCode||main.code.slice(0,3);const batchNo=`${capacityModel.proposedBatchPrefix}_${short}_${String(++chunkNo).padStart(3,"0")}`;const node:BatchNode={id,sourceKind:"PROPOSED_BATCH",batchNo,batchKey:proposal?.batchKey||null,mainOperation:main,recipeNo:first.step.recipe.recipeNo,recipeName:first.step.recipe.recipeName||first.step.recipe.sourceValue||null,members:chunk,durationMinutes:batchDuration(chunk,proposal),ruleCode:proposal?.ruleCode||null,resourceOptions:main.resources.map(x=>x.code),fixedStart:null,fixedEnd:null,start:null,end:null,resourceBase:null,resourceInstance:null,mustStartBy:batchLatestStart(chunk),status:"UNSCHEDULED",reason:null,warnings:proposal?.warnings||[]};nodes.push(node);for(const m of chunk)memberNode.set(m.key,id);chunk=[];};
    for(const m of members){if(proposal&&limitExceeded(chunk,m,proposal))flush();chunk.push(m);}flush();
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

function scheduleNodes(nodes:BatchNode[],memberNode:Map<string,string>,initial:OccupancyState,capacityModel:CapacityModel,scenarioStart:number,horizonEnd:number):OccupancyState{
  const state:OccupancyState={intervals:initial.intervals.map(x=>({...x,jobs:[...x.jobs]}))};const map=new Map(nodes.map(x=>[x.id,x]));const pending=new Set(nodes.map(x=>x.id));
  let proposalSeq=0;
  while(pending.size){
    const readyNodes=[...pending].map(id=>map.get(id)!).filter(node=>node.members.every(m=>!m.previousMemberKey||memberNode.get(m.previousMemberKey)===node.id||!pending.has(memberNode.get(m.previousMemberKey)||"")));
    if(!readyNodes.length){for(const id of pending){const x=map.get(id)!;x.status="DEPENDENCY_CONFLICT";x.reason="CYCLIC_OR_UNRESOLVED_DEPENDENCY";}break;}
    readyNodes.sort((a,b)=>(a.mustStartBy??Number.POSITIVE_INFINITY)-(b.mustStartBy??Number.POSITIVE_INFINITY)||(a.sourceKind==="EXISTING_BATCH"?-1:1)-(b.sourceKind==="EXISTING_BATCH"?-1:1)||b.members.reduce((s,x)=>s+x.row.surfaceDm2,0)-a.members.reduce((s,x)=>s+x.row.surfaceDm2,0));
    const node=readyNodes[0];pending.delete(node.id);const dep=predecessorReady(node,map,memberNode,scenarioStart);
    if(node.sourceKind==="FIXED_SCHEDULE"){
      node.start=node.fixedStart;node.end=node.fixedEnd;if(dep.conflict){node.status="DEPENDENCY_CONFLICT";node.reason="FIXED_SCHEDULE_STARTS_BEFORE_JOB_IS_READY";}else node.status="FIXED";
      const match=state.intervals.find(x=>key(x.batchRef)===key(node.batchNo)&&node.start!=null&&node.end!=null&&overlap(node.start,node.end,x.start,x.end));if(match){node.resourceBase=match.baseResourceCode;node.resourceInstance=match.resourceInstance;}
      continue;
    }
    if(!Number.isFinite(dep.ready)){node.status="DEPENDENCY_CONFLICT";node.reason="PREDECESSOR_NOT_SCHEDULED";continue;}
    let best:{start:number;end:number;base:string;instance:string;def:CapacityResourceDefinition}|null=null;
    for(const resourceCode of node.resourceOptions){const def=capacityResource(capacityModel,resourceCode);for(const inst of capacityInstanceCodes(def)){const slot=findSlot(state,def,inst,dep.ready,node.durationMinutes,node.recipeNo,horizonEnd);if(slot&&(!best||slot.start<best.start||(slot.start===best.start&&def.sortOrder<best.def.sortOrder)))best={...slot,base:def.baseResourceCode,instance:inst,def};}}
    if(!best){node.status="UNSCHEDULED";node.reason=node.resourceOptions.length?"NO_FINITE_CAPACITY_SLOT_IN_HORIZON":"NO_RESOURCE_MAPPING";continue;}
    node.start=best.start;node.end=best.end;node.resourceBase=best.base;node.resourceInstance=best.instance;node.status=node.mustStartBy!=null&&best.start>node.mustStartBy?"LATE_START":"ON_TIME";node.reason=node.status==="LATE_START"?"STARTS_AFTER_BACKWARD_LATEST_START":null;
    if(node.sourceKind==="PROPOSED_BATCH"){const short=node.mainOperation.shortCode||node.mainOperation.code.slice(0,3);node.batchNo=`${capacityModel.proposedBatchPrefix}_${short}_${String(++proposalSeq).padStart(3,"0")}`;}
    state.intervals.push({id:`SIM:${node.id}`,batchRef:node.batchNo,sourceKind:node.sourceKind==="PROPOSED_BATCH"?"PROPOSED_BATCH":"EXISTING_BATCH",baseResourceCode:best.base,resourceInstance:best.instance,recipeNo:node.recipeNo,start:best.start,end:best.end,status:node.status,mainOperationCode:node.mainOperation.code,jobs:node.members.map(x=>x.row.jobNum),surfaceDm2:node.members.reduce((s,x)=>s+x.row.surfaceDm2,0)});
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
  return state.intervals.filter(x=>overlap(startAt,horizonEnd,x.start,x.end)).sort((a,b)=>a.start-b.start||a.resourceInstance.localeCompare(b.resourceInstance)).map(x=>({id:x.id,batchNo:x.batchRef,sourceKind:x.sourceKind,baseResourceCode:x.baseResourceCode,resourceInstance:x.resourceInstance,resourceLabel:capacityResource(model,x.baseResourceCode).label,mainOperationCode:x.mainOperationCode,recipeNo:x.recipeNo,startAt:wallIso(x.start)!,endAt:wallIso(x.end)!,durationMinutes:Math.round((x.end-x.start)/60_000),status:x.status,jobs:x.jobs,surfaceDm2:x.surfaceDm2}));
}
function resourceSummary(state:OccupancyState,nodes:BatchNode[],model:CapacityModel,startAt:number,cutoff:number):CapacityResourceSummary[]{
  const defs=model.resourceList.length?model.resourceList:[];const usedCodes=new Set(state.intervals.map(x=>key(x.baseResourceCode)));for(const c of usedCodes)if(!defs.some(d=>key(d.baseResourceCode)===c))defs.push(capacityResource(model,c));
  return defs.sort((a,b)=>a.sortOrder-b.sortOrder||a.code.localeCompare(b.code)).map(def=>{const existing=state.intervals.filter(x=>key(x.baseResourceCode)===key(def.baseResourceCode)&&x.sourceKind==="EXISTING_SCHEDULE").reduce((s,x)=>s+clipMinutes(x.start,x.end,startAt,cutoff),0);const simulated=state.intervals.filter(x=>key(x.baseResourceCode)===key(def.baseResourceCode)&&x.sourceKind!=="EXISTING_SCHEDULE").reduce((s,x)=>s+clipMinutes(x.start,x.end,startAt,cutoff),0);const available=Math.max(0,(cutoff-startAt)/60_000*def.maxConcurrent);const late=nodes.filter(x=>key(x.resourceBase)===key(def.baseResourceCode)&&(x.status==="LATE_START"||x.status==="UNSCHEDULED")).length;return{baseResourceCode:def.baseResourceCode,label:def.label,instanceCount:def.instanceCount,maxConcurrent:def.maxConcurrent,existingMinutes:existing,simulatedMinutes:simulated,availableMinutes:available,utilizationPct:available>0?Math.min(999,(existing+simulated)/available*100):0,lateOrUnscheduledBatches:late};});
}

async function simulate(rows:StOutputJobAssessment[],candidateIds:Set<number>,rawMap:Map<number,RawContext>,planningModel:PlanningModel,batchModel:Awaited<ReturnType<typeof getBatchModel>>,capacityModel:CapacityModel,baseOccupancy:OccupancyState,scenarioStart:number,cutoff:number,horizonEnd:number):Promise<Simulation>{
  const chains=buildChains(rows,rawMap,planningModel,batchModel,capacityModel);const {nodes,memberNode}=buildNodes(chains,capacityModel);const state=scheduleNodes(nodes,memberNode,baseOccupancy,capacityModel,scenarioStart,horizonEnd);const jobs=evaluateJobs(chains,nodes,memberNode,scenarioStart,cutoff);const feasiblePlannedSurface=jobs.filter(x=>x.sourceStatus==="PLANNED"&&x.contributes).reduce((s,x)=>s+x.surfaceDm2,0);const feasibleCandidateSurface=jobs.filter(x=>candidateIds.has(x.planningJobId)&&x.contributes).reduce((s,x)=>s+x.surfaceDm2,0);const selectedCandidateSurface=jobs.filter(x=>candidateIds.has(x.planningJobId)).reduce((s,x)=>s+x.surfaceDm2,0);const warnings:string[]=[];if(chains.some(x=>x.capacityReview))warnings.push("UNMAPPED_AREA_CAPACITY_REVIEW");if(nodes.some(x=>x.status==="UNSCHEDULED"))warnings.push("ONE_OR_MORE_BATCHES_HAVE_NO_CAPACITY_SLOT");if(nodes.some(x=>x.status==="DEPENDENCY_CONFLICT"))warnings.push("SCHEDULE_PRECEDENCE_CONFLICT");return{nodes,jobs,timeline:timelineRows(state,capacityModel,scenarioStart,horizonEnd),resources:resourceSummary(state,nodes,capacityModel,scenarioStart,cutoff),feasiblePlannedSurface,feasibleCandidateSurface,selectedCandidateSurface,warnings};
}

function nodeToPublic(node:BatchNode):ProposedCapacityBatch{return{id:node.id,batchNo:node.batchNo,sourceKind:node.sourceKind,mainOperationCode:node.mainOperation.code,mainOperationLabel:node.mainOperation.label,batchKey:node.batchKey,recipeNo:node.recipeNo,recipeName:node.recipeName,jobCount:node.members.length,jobs:node.members.map(x=>x.row.jobNum),totalQty:node.members.reduce((s,x)=>s+n(x.row.qty),0),totalSurfaceDm2:node.members.reduce((s,x)=>s+x.row.surfaceDm2,0),durationMinutes:node.durationMinutes,batchRuleCode:node.ruleCode,resourceBase:node.resourceBase,resourceInstance:node.resourceInstance,startAt:wallIso(node.start),endAt:wallIso(node.end),mustStartBy:wallIso(node.mustStartBy),status:node.status,reason:node.reason,warnings:node.warnings};}

export async function calculateFiniteCapacityTarget(options:FiniteCapacityOptions):Promise<FiniteCapacityResult>{
  const [base,planningModel,batchModel,capacityModel,bootstrap]=await Promise.all([
    calculateStOutputTarget({targetDate:options.targetDate,cutoffTime:options.cutoffTime,targetValue:options.targetValue}),
    getPlanningModel(),getBatchModel(),getCapacityModel(),getConfigBootstrap(),
  ]);
  const cutoff=wallDateTime(options.targetDate,options.cutoffTime);const routeSnapshot=parseWall(base.routeSnapshotAt);const configuredStart=wallDateTime(addDays(options.targetDate,-capacityModel.lookbackDays),capacityModel.scenarioStartTime);const scenarioStart=Math.max(configuredStart,routeSnapshot||configuredStart);const horizonEnd=cutoff+capacityModel.spillHours*60*60_000;
  const plannedRows=base.rows.filter(x=>x.outputStatus==="PLANNED");const candidates=candidateSort(base.rows.filter(x=>x.outputStatus==="NEED_PLAN"&&!x.needsReview&&x.surfaceDm2>0));const candidateByJob=new Map(candidates.map(x=>[x.jobNum,x]));const selected:Set<number>=new Set();
  for(const job of base.recommendedJobNums){const row=candidateByJob.get(job);if(row)selected.add(row.planningJobId);if(selected.size>=capacityModel.maxCandidateJobs)break;}
  const potential=candidates.slice(0,capacityModel.maxCandidateJobs);const ids=[...new Set([...plannedRows,...potential].map(x=>x.planningJobId))];const planningProfile=bootstrap.sources.PLANNING;const rawMap=await loadRawContexts(ids,planningProfile.sheetName||planningProfile.displayName);const existing=await loadExistingOccupancy(capacityModel,scenarioStart,horizonEnd);
  let sim:Simulation|null=null;let iteration=0;let cursor=0;
  while(iteration++<8){const selectedRows=potential.filter(x=>selected.has(x.planningJobId));const capacityRows=[...plannedRows,...selectedRows];sim=await simulate(capacityRows,selected,rawMap,planningModel,batchModel,capacityModel,existing,scenarioStart,cutoff,horizonEnd);const forecast=base.summary.actualSurface+base.summary.committedSurface+sim.feasiblePlannedSurface+sim.feasibleCandidateSurface;if(forecast>=options.targetValue)break;let need=Math.max(0,options.targetValue-forecast)*capacityModel.candidateSurfaceMultiplier;let added=0;while(cursor<potential.length&&added<need&&selected.size<capacityModel.maxCandidateJobs){const row=potential[cursor++];if(selected.has(row.planningJobId))continue;selected.add(row.planningJobId);added+=row.surfaceDm2;}if(added<=0)break;}
  const finalSelectedRows=potential.filter(x=>selected.has(x.planningJobId));
  sim=await simulate([...plannedRows,...finalSelectedRows],selected,rawMap,planningModel,batchModel,capacityModel,existing,scenarioStart,cutoff,horizonEnd);
  const finiteForecast=base.summary.actualSurface+base.summary.committedSurface+sim.feasiblePlannedSurface+sim.feasibleCandidateSurface;const remainingGap=Math.max(0,options.targetValue-finiteForecast);const contributing=sim.jobs.filter(x=>x.contributes&&selected.has(x.planningJobId));const anyReview=contributing.some(x=>x.capacityReview);const targetFeasibility:FiniteCapacityResult["targetFeasibility"]=remainingGap>0?"NOT_FEASIBLE":anyReview?"PROVISIONAL":"CONFIRMED";const publicBatches=sim.nodes.map(nodeToPublic).sort((a,b)=>(a.startAt||"9999").localeCompare(b.startAt||"9999")||(a.mustStartBy||"9999").localeCompare(b.mustStartBy||"9999"));const warnings=[...new Set(sim.warnings)];if(targetFeasibility==="PROVISIONAL")warnings.push("TARGET_REACHED_BUT_ONE_OR_MORE_CONTRIBUTING_STEPS_HAVE_NO_CONFIGURED_FINITE_RESOURCE");if(remainingGap>0)warnings.push(`FINITE_CAPACITY_GAP:${Math.round(remainingGap)}`);
  const processTimeForecast=base.summary.actualSurface+base.summary.committedSurface+sumSurface(plannedRows)+sim.selectedCandidateSurface;
  return{targetDate:options.targetDate,cutoffTime:options.cutoffTime,cutoffAt:wallIso(cutoff)!,targetValue:options.targetValue,scenarioStartAt:wallIso(scenarioStart)!,horizonEndAt:wallIso(horizonEnd)!,endpointOperation:base.endpointOperation,targetFeasibility,summary:{actualSurface:base.summary.actualSurface,committedSurface:base.summary.committedSurface,finitePlannedSurface:sim.feasiblePlannedSurface,finiteRecommendedSurface:sim.feasibleCandidateSurface,selectedCandidateSurface:sim.selectedCandidateSurface,processTimeForecastSurface:processTimeForecast,finiteCapacityForecastSurface:finiteForecast,remainingGap,achievementPct:options.targetValue>0?Math.min(999,finiteForecast/options.targetValue*100):0,proposedBatchCount:publicBatches.filter(x=>x.sourceKind==="PROPOSED_BATCH").length,existingBatchToScheduleCount:publicBatches.filter(x=>x.sourceKind==="EXISTING_BATCH").length,lateBatchCount:publicBatches.filter(x=>x.status==="LATE_START").length,unscheduledBatchCount:publicBatches.filter(x=>x.status==="UNSCHEDULED"||x.status==="DEPENDENCY_CONFLICT").length,capacityReviewJobCount:sim.jobs.filter(x=>x.capacityReview).length},selectedJobNums:potential.filter(x=>selected.has(x.planningJobId)).map(x=>x.jobNum),finiteRecommendedJobNums:contributing.map(x=>x.jobNum),batches:publicBatches,jobs:sim.jobs,timeline:sim.timeline,resources:sim.resources,warnings};
}
