import { query } from "@/lib/db";
import { getConfigBootstrap } from "@/lib/config";
import { getPlanningModel, type MainOperationDefinition, type PlanningModel } from "@/lib/planning-model";
import { getRecipeModel, resolveProcessTime, resolveRecipe, type ProcessTimeSuggestion, type RecipeModel, type RecipeSuggestion } from "@/lib/recipe-model";
import { analyzeRoute, type RouteOperationForAnalysis } from "@/lib/route-analysis";
import { getStOutputModel, type StOutputModel } from "@/lib/st-output-model";

type JsonMap = Record<string, unknown>;

type BatchAssignment = {
  batchNo: string;
  mainOperationCode: string;
  status: string;
  processTimeMinutes: number | null;
  createdAt: string;
  scheduleDate: string | null;
  startTime: string | null;
  endTime: string | null;
  scheduleDurationMinutes: number | null;
  scheduleStatus: string | null;
};

export type StOutputStep = {
  routePosition: number;
  operationCode: string;
  operationSequence: number | null;
  mainOperation: MainOperationDefinition | null;
  recipe: RecipeSuggestion;
  processTime: ProcessTimeSuggestion;
  durationMinutes: number | null;
  durationBasis: "BATCH" | "PROCESS_TIME_RULE" | "UNKNOWN_ZERO" | "UNKNOWN_BLOCK";
  state: "READY_UNPLANNED" | "WAIT_PREVIOUS" | "BATCHED" | "SCHEDULED" | "RUNNING" | "COMPLETE";
  batchNo: string | null;
  batchStatus: string | null;
  scheduleDate: string | null;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  earliestStart: string | null;
  earliestFinish: string | null;
  latestStart: string | null;
  latestFinish: string | null;
  slackMinutes: number | null;
  planned: boolean;
  scheduled: boolean;
  needsReview: boolean;
  warnings: string[];
};

export type StOutputJobAssessment = {
  planningJobId: number;
  jobNum: string;
  program: string | null;
  part: string | null;
  revision: string | null;
  qty: number | null;
  surfaceDm2: number;
  nextOperation: string | null;
  endpointOperation: string;
  currentPosition: number | null;
  endpointPosition: number | null;
  remainingOperationCount: number;
  remainingProcessMinutes: number | null;
  routeSnapshotAt: string | null;
  projectedFinsstAt: string | null;
  latestRequiredStart: string | null;
  outputStatus: "OUTPUT" | "COMMITTED" | "PLANNED" | "NEED_PLAN" | "AT_RISK" | "REVIEW" | "OUTPUT_OTHER_DAY" | "NOT_APPLICABLE";
  outputBasis: string;
  countsTowardTarget: boolean;
  needsReview: boolean;
  criticalAction: StOutputStep | null;
  steps: StOutputStep[];
  warnings: string[];
};

export type StOutputActionGroup = {
  areaCode: string;
  areaLabel: string;
  mainOperationCode: string;
  mainOperationLabel: string;
  recipeNo: string | null;
  recipeName: string | null;
  jobCount: number;
  surfaceDm2: number;
  processMinutes: number;
  latestStart: string | null;
  jobs: string[];
};

export type StOutputTargetResult = {
  targetDate: string;
  cutoffTime: string;
  cutoffAt: string;
  targetValue: number;
  metricCode: string;
  endpointOperation: string;
  routeSnapshotAt: string | null;
  summary: {
    scannedJobs: number;
    outputJobs: number;
    actualSurface: number;
    committedSurface: number;
    plannedSurface: number;
    needPlanSurface: number;
    atRiskSurface: number;
    reviewSurface: number;
    alreadyPlannedSurface: number;
    forecastBeforeNewPlan: number;
    gapBeforeRecommendation: number;
    recommendedSurface: number;
    forecastWithRecommendation: number;
    remainingGap: number;
    achievementPct: number;
  };
  rows: StOutputJobAssessment[];
  recommendedJobNums: string[];
  actionGroups: StOutputActionGroup[];
  warnings: string[];
};

export type StOutputTargetOptions = {
  targetDate: string;
  cutoffTime: string;
  targetValue: number;
  search?: string;
  status?: string;
  limit?: number;
};

function key(value: unknown): string { return value == null ? "" : String(value).trim().toUpperCase(); }
function numberOrNull(value: unknown): number | null { const n = Number(value); return Number.isFinite(n) ? n : null; }
function wallFromTimestamp(value: string | null | undefined, offsetMinutes: number): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms + offsetMinutes * 60_000 : null;
}
function wallDateTime(date: string, time: string): number {
  const [y,m,d] = date.split("-").map(Number);
  const [hh,mm,ss] = time.split(":").map(Number);
  return Date.UTC(y || 1970, Math.max(0,(m || 1)-1), d || 1, hh || 0, mm || 0, ss || 0, 0);
}
function wallIso(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0,16);
}
function wallDate(ms: number | null): string | null { return ms == null ? null : new Date(ms).toISOString().slice(0,10); }
function parseCompletion(sourceText: string | undefined): { date: string | null; time: string | null } {
  const text = sourceText || "";
  const m = /(20\d{2}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?/.exec(text);
  return { date: m?.[1] || null, time: m?.[2] || null };
}
function scheduleWall(batch: BatchAssignment): { start: number | null; end: number | null } {
  if (!batch.scheduleDate || !batch.startTime || !batch.endTime) return { start:null, end:null };
  const start = wallDateTime(batch.scheduleDate, batch.startTime);
  let end = wallDateTime(batch.scheduleDate, batch.endTime);
  if (end < start) end += 86_400_000;
  return { start, end };
}
function mapMain(operationCode: string, model: PlanningModel): MainOperationDefinition | null {
  return model.operationMappings[key(operationCode)]?.mainOperation || null;
}
function batchQueues(assignments: BatchAssignment[]): Map<string, BatchAssignment[]> {
  const out = new Map<string, BatchAssignment[]>();
  for (const b of assignments) {
    const k = key(b.mainOperationCode);
    if (!k) continue;
    const arr = out.get(k) || [];
    arr.push(b);
    out.set(k, arr);
  }
  for (const arr of out.values()) arr.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return out;
}
function takeBatch(main: MainOperationDefinition | null, queues: Map<string, BatchAssignment[]>): BatchAssignment | null {
  if (!main) return null;
  const arr = queues.get(key(main.code));
  if (!arr?.length) return null;
  return arr.shift() || null;
}

function evaluateActual(
  endpoint: RouteOperationForAnalysis,
  currentIndex: number,
  endpointIndex: number,
  snapshotWall: number | null,
  targetDate: string,
  cutoffWall: number,
  model: StOutputModel,
): { status: StOutputJobAssessment["outputStatus"] | null; basis: string; projected: string | null; review: boolean; counts: boolean } {
  const completion = parseCompletion(endpoint.sourceText);
  if (endpoint.complete === true) {
    if (completion.date && completion.date !== targetDate) {
      return { status:"OUTPUT_OTHER_DAY", basis:`FINSST completed ${completion.date}`, projected:completion.time ? `${completion.date}T${completion.time.slice(0,5)}` : `${completion.date}`, review:false, counts:false };
    }
    if (completion.date === targetDate && completion.time) {
      const completedWall = wallDateTime(completion.date, completion.time);
      return completedWall <= cutoffWall
        ? { status:"OUTPUT", basis:"FINSST completion timestamp", projected:wallIso(completedWall), review:false, counts:true }
        : { status:"AT_RISK", basis:"FINSST completed after cutoff", projected:wallIso(completedWall), review:false, counts:false };
    }
    if (completion.date === targetDate && snapshotWall != null && wallDate(snapshotWall) === targetDate && snapshotWall <= cutoffWall) {
      return { status:"OUTPUT", basis:"FINSST complete by route snapshot before cutoff", projected:wallIso(snapshotWall), review:false, counts:true };
    }
    if (completion.date === targetDate && model.completedDateAssumeBeforeCutoff) {
      return { status:"OUTPUT", basis:"FINSST completion date; configured assume-before-cutoff", projected:completion.date, review:true, counts:true };
    }
    if (completion.date === targetDate) {
      return { status:"REVIEW", basis:"FINSST completion date has no time; cutoff cannot be proven", projected:completion.date, review:true, counts:false };
    }
    if (!completion.date && snapshotWall != null && wallDate(snapshotWall) === targetDate && snapshotWall <= cutoffWall) {
      return { status:"OUTPUT", basis:"FINSST complete by route snapshot before cutoff", projected:wallIso(snapshotWall), review:true, counts:true };
    }
    return { status:"REVIEW", basis:"FINSST is complete but completion date/time is unavailable", projected:null, review:true, counts:false };
  }
  if (currentIndex === endpointIndex && model.countReadyAtEndpointAsOutput) {
    if (snapshotWall != null && wallDate(snapshotWall) === targetDate && snapshotWall <= cutoffWall) {
      return { status:"OUTPUT", basis:"NextOperation is FINSST at route snapshot before cutoff", projected:wallIso(snapshotWall), review:false, counts:true };
    }
    if (snapshotWall != null && wallDate(snapshotWall) !== targetDate) {
      return { status:"OUTPUT_OTHER_DAY", basis:`Job was already at FINSST on ${wallDate(snapshotWall)}`, projected:wallIso(snapshotWall), review:false, counts:false };
    }
    return { status:"REVIEW", basis:"Job is at FINSST but snapshot is after cutoff or unavailable", projected:wallIso(snapshotWall), review:true, counts:false };
  }
  return { status:null, basis:"", projected:null, review:false, counts:false };
}

function assessJob(
  row: Record<string, unknown>,
  operations: RouteOperationForAnalysis[],
  assignments: BatchAssignment[],
  planningModel: PlanningModel,
  recipeModel: RecipeModel,
  outputModel: StOutputModel,
  targetDate: string,
  cutoffTime: string,
): StOutputJobAssessment {
  const endpointCode = key(outputModel.endpointOperationCode);
  const snapshotWall = wallFromTimestamp(row.route_snapshot_at as string | null, outputModel.timezoneOffsetMinutes);
  const cutoffWall = wallDateTime(targetDate, cutoffTime);
  const sorted = [...operations].filter((x)=>x.code).sort((a,b)=>a.position-b.position);
  const route = analyzeRoute(sorted, (row.route_next_operation as string | null) || (row.next_operation as string | null), row.all_operation as string | null, {
    preferNextOperation:true, fallbackFirstIncomplete:true, includeCurrentInRemaining:true,
  });
  const currentIndex = route.currentPosition == null ? -1 : sorted.findIndex((x)=>x.position===route.currentPosition);
  const endpointIndexes = sorted.map((op,i)=>key(op.code)===endpointCode?i:-1).filter((i)=>i>=0);
  const endpointIndex = currentIndex >= 0 ? (endpointIndexes.find((i)=>i>=currentIndex) ?? endpointIndexes[endpointIndexes.length-1] ?? -1) : (endpointIndexes[endpointIndexes.length-1] ?? -1);
  const endpoint = endpointIndex >= 0 ? sorted[endpointIndex] : null;
  const warnings: string[] = [];
  const sourceSurface = Number(row.surface_dm2 || 0) || 0;
  const prodQty = Number(row.prod_qty || 0) || 0;
  const goodWipQty = Number(row.current_good_wip_qty || 0) || 0;
  const surfaceDm2 = outputModel.surfaceCalculationMode === "SURFACE_X_PROD_QTY" ? sourceSurface * prodQty
    : outputModel.surfaceCalculationMode === "SURFACE_X_GOOD_WIP_QTY" ? sourceSurface * goodWipQty
    : sourceSurface;
  const base = {
    planningJobId:Number(row.id), jobNum:String(row.job_num || ""), program:row.program as string|null,
    part:row.epicor_part as string|null, revision:(row.route_revision_num || row.revision_num || null) as string|null,
    qty:numberOrNull(row.prod_qty), surfaceDm2, nextOperation:row.next_operation as string|null,
    endpointOperation:outputModel.endpointOperationCode, currentPosition:route.currentPosition,
    endpointPosition:endpoint?.position ?? null, routeSnapshotAt:row.route_snapshot_at as string|null,
  };
  if (!endpoint) {
    return { ...base, remainingOperationCount:0, remainingProcessMinutes:null, projectedFinsstAt:null, latestRequiredStart:null,
      outputStatus:"NOT_APPLICABLE", outputBasis:`${outputModel.endpointOperationCode} not found in route`, countsTowardTarget:false,
      needsReview:false, criticalAction:null, steps:[], warnings:["ENDPOINT_NOT_IN_ROUTE"] };
  }

  const actual = evaluateActual(endpoint,currentIndex,endpointIndex,snapshotWall,targetDate,cutoffWall,outputModel);
  if (actual.status) {
    return { ...base, remainingOperationCount:Math.max(0,endpointIndex-currentIndex), remainingProcessMinutes:0,
      projectedFinsstAt:actual.projected, latestRequiredStart:actual.projected, outputStatus:actual.status, outputBasis:actual.basis,
      countsTowardTarget:actual.counts, needsReview:actual.review, criticalAction:null, steps:[], warnings:actual.review?["OUTPUT_TIME_REVIEW"]:[] };
  }
  if (currentIndex < 0 || endpointIndex < currentIndex) {
    return { ...base, remainingOperationCount:0, remainingProcessMinutes:null, projectedFinsstAt:null, latestRequiredStart:null,
      outputStatus:"REVIEW", outputBasis:"Current route position cannot be resolved before FINSST", countsTowardTarget:false,
      needsReview:true, criticalAction:null, steps:[], warnings:["ROUTE_POSITION_REVIEW"] };
  }

  const requiredOps = sorted.slice(currentIndex, endpointIndex).filter((op)=>op.complete !== true);
  const queues = batchQueues(assignments);
  const steps: StOutputStep[] = [];
  let cursor = snapshotWall ?? Date.now() + outputModel.timezoneOffsetMinutes*60_000;
  let unknownBlocked = false;

  for (let i=0;i<requiredOps.length;i++) {
    const op = requiredOps[i];
    const main = mapMain(op.code, planningModel);
    const include = outputModel.includeNonPlanningOperations || Boolean(main?.planningEnabled);
    if (!include) continue;
    const recipe = resolveRecipe(main?.code || null, row.raw_row_data, recipeModel);
    const process = resolveProcessTime(main?.code || null, row.raw_row_data, recipe, recipeModel);
    const batch = takeBatch(main, queues);
    const batchMinutes = batch?.processTimeMinutes;
    let duration = batchMinutes != null ? batchMinutes : process.minutes;
    let basis: StOutputStep["durationBasis"] = batchMinutes != null ? "BATCH" : process.minutes != null ? "PROCESS_TIME_RULE" : outputModel.unknownStepPolicy === "BLOCK" ? "UNKNOWN_BLOCK" : "UNKNOWN_ZERO";
    const stepWarnings: string[] = [];
    let review = Boolean(recipe.needsReview || process.needsReview);
    if (duration == null) {
      if (outputModel.unknownStepPolicy === "BLOCK") { unknownBlocked = true; review = true; stepWarnings.push("PROCESS_TIME_MISSING"); }
      else { duration = outputModel.defaultUnknownMinutes; review = true; stepWarnings.push("PROCESS_TIME_MISSING_USING_CONFIGURED_FALLBACK"); }
    }
    const schedule = batch ? scheduleWall(batch) : {start:null,end:null};
    const planned = Boolean(batch);
    const scheduled = schedule.start != null && schedule.end != null;
    let start = cursor;
    let finish: number | null = duration == null ? null : start + duration*60_000;
    if (scheduled && schedule.start != null && schedule.end != null) {
      if (schedule.start >= cursor) { start=schedule.start; finish=schedule.end; }
      else if (schedule.end >= cursor) { start=schedule.start; finish=schedule.end; }
      else { stepWarnings.push("SCHEDULE_BEFORE_ROUTE_READY"); review=true; }
    }
    if (finish != null) cursor=finish;
    const state: StOutputStep["state"] = scheduled
      ? (key(batch?.status)==="STARTED"?"RUNNING":"SCHEDULED")
      : planned ? "BATCHED" : i===0 ? "READY_UNPLANNED" : "WAIT_PREVIOUS";
    steps.push({
      routePosition:op.position, operationCode:op.code, operationSequence:op.sequence ?? null, mainOperation:main,
      recipe, processTime:process, durationMinutes:duration, durationBasis:basis, state,
      batchNo:batch?.batchNo || null, batchStatus:batch?.status || null, scheduleDate:batch?.scheduleDate || null,
      scheduleStart:wallIso(schedule.start), scheduleEnd:wallIso(schedule.end), earliestStart:wallIso(start), earliestFinish:wallIso(finish),
      latestStart:null, latestFinish:null, slackMinutes:null, planned, scheduled, needsReview:review, warnings:stepWarnings,
    });
  }

  let backward = cutoffWall;
  for (let i=steps.length-1;i>=0;i--) {
    const step=steps[i];
    step.latestFinish=wallIso(backward);
    if (step.durationMinutes == null) { step.latestStart=null; step.slackMinutes=null; continue; }
    const latestStart=backward-step.durationMinutes*60_000;
    step.latestStart=wallIso(latestStart);
    const earliestStart=step.earliestStart ? wallDateTime(step.earliestStart.slice(0,10),step.earliestStart.slice(11,16)) : null;
    step.slackMinutes=earliestStart==null?null:Math.round((latestStart-earliestStart)/60_000);
    backward=latestStart;
  }

  const projected = unknownBlocked ? null : (steps.length ? cursor : snapshotWall);
  const allPlanningSteps = steps.filter((x)=>x.mainOperation?.planningEnabled);
  const allPlanned = allPlanningSteps.length > 0 && allPlanningSteps.every((x)=>x.planned);
  const allScheduled = allPlanningSteps.length > 0 && allPlanningSteps.every((x)=>x.scheduled);
  const anyReview = steps.some((x)=>x.needsReview) || unknownBlocked;
  const timeReview = steps.some((x)=>x.durationBasis === "UNKNOWN_ZERO" || x.durationBasis === "UNKNOWN_BLOCK" || x.warnings.includes("SCHEDULE_BEFORE_ROUTE_READY"));
  const critical = steps.find((x)=>x.mainOperation?.planningEnabled && !x.planned) || steps.find((x)=>!x.scheduled) || steps[0] || null;
  let status: StOutputJobAssessment["outputStatus"];
  let basis: string;
  if (unknownBlocked || projected == null) { status="REVIEW"; basis="One or more remaining operations have no usable process time."; }
  else if (timeReview) { status="REVIEW"; basis="A remaining operation uses unknown/fallback process time or has a schedule conflict; cutoff feasibility is not proven."; }
  else if (projected > cutoffWall) { status="AT_RISK"; basis="Earliest calculated arrival at FINSST is after cutoff."; }
  else if (allScheduled) { status="COMMITTED"; basis="All remaining Planning steps are scheduled and calculated arrival is before cutoff."; }
  else if (allPlanned) { status="PLANNED"; basis="All remaining Planning steps are batched; scheduling is not complete but process-time forecast is before cutoff."; }
  else { status="NEED_PLAN"; basis="Process-time forecast can reach FINSST before cutoff, but one or more remaining Planning steps are not batched."; }
  if (anyReview) warnings.push("ONE_OR_MORE_STEPS_NEED_REVIEW");
  if (steps.some((x)=>x.warnings.includes("SCHEDULE_BEFORE_ROUTE_READY"))) warnings.push("SCHEDULE_CONFLICT");
  const remainingMinutes = steps.every((x)=>x.durationMinutes!=null) ? steps.reduce((s,x)=>s+(x.durationMinutes||0),0) : null;
  return { ...base, remainingOperationCount:requiredOps.length, remainingProcessMinutes:remainingMinutes,
    projectedFinsstAt:wallIso(projected), latestRequiredStart:steps[0]?.latestStart || wallIso(cutoffWall), outputStatus:status,
    outputBasis:basis, countsTowardTarget:status==="COMMITTED" || status==="PLANNED", needsReview:anyReview,
    criticalAction:critical, steps, warnings };
}

function recommend(rows: StOutputJobAssessment[], gap: number, strategy: string): StOutputJobAssessment[] {
  if (gap <= 0) return [];
  const eligible = rows.filter((x)=>x.outputStatus==="NEED_PLAN" && !x.needsReview && x.surfaceDm2>0);
  eligible.sort((a,b)=>{
    if (key(strategy)==="SURFACE_DESC") return b.surfaceDm2-a.surfaceDm2 || (a.projectedFinsstAt||"").localeCompare(b.projectedFinsstAt||"");
    return (a.projectedFinsstAt||"9999").localeCompare(b.projectedFinsstAt||"9999") || (a.remainingProcessMinutes??999999)-(b.remainingProcessMinutes??999999) || b.surfaceDm2-a.surfaceDm2;
  });
  const selected: StOutputJobAssessment[]=[];
  let total=0;
  for (const row of eligible) { selected.push(row); total+=row.surfaceDm2; if (total>=gap) break; }
  return selected;
}

function actionGroups(selected: StOutputJobAssessment[]): StOutputActionGroup[] {
  type Mutable = Omit<StOutputActionGroup,"jobCount"|"jobs"> & { jobs:Set<string> };
  const map=new Map<string,Mutable>();
  for (const job of selected) {
    for (const step of job.steps) {
      if (!step.mainOperation?.planningEnabled || step.planned) continue;
      const areaCode=step.mainOperation.scheduleArea?.code || step.mainOperation.physicalArea?.code || step.mainOperation.stGroup?.code || step.mainOperation.code;
      const areaLabel=step.mainOperation.scheduleArea?.label || step.mainOperation.physicalArea?.label || step.mainOperation.stGroup?.label || step.mainOperation.label;
      const recipeNo=step.recipe.recipeNo || null;
      const recipeName=step.recipe.recipeName || step.recipe.sourceValue || null;
      const k=[areaCode,step.mainOperation.code,recipeNo||recipeName||""].map(key).join("|");
      let g=map.get(k);
      if(!g){g={areaCode,areaLabel,mainOperationCode:step.mainOperation.code,mainOperationLabel:step.mainOperation.label,recipeNo,recipeName,surfaceDm2:0,processMinutes:0,latestStart:step.latestStart,jobs:new Set<string>()};map.set(k,g);}
      if(!g.jobs.has(job.jobNum)){g.jobs.add(job.jobNum);g.surfaceDm2+=job.surfaceDm2;}
      g.processMinutes+=step.durationMinutes||0;
      if(step.latestStart && (!g.latestStart || step.latestStart<g.latestStart))g.latestStart=step.latestStart;
    }
  }
  return [...map.values()].map((g)=>({...g,jobCount:g.jobs.size,jobs:[...g.jobs]})).sort((a,b)=>(a.latestStart||"9999").localeCompare(b.latestStart||"9999")||a.areaCode.localeCompare(b.areaCode));
}

export async function calculateStOutputTarget(options: StOutputTargetOptions): Promise<StOutputTargetResult> {
  const bootstrap=await getConfigBootstrap();
  const planningModel=await getPlanningModel();
  const recipeModel=await getRecipeModel();
  const outputModel=await getStOutputModel();
  const planningProfile=bootstrap.sources.PLANNING;
  const planningSheetName=planningProfile.sheetName || planningProfile.displayName;
  const maxRows=Math.max(100,Math.min(outputModel.maxScanJobs,options.limit||outputModel.maxScanJobs));
  const params:unknown[]=[planningSheetName];
  const where:string[]=[];
  if(options.search?.trim()){params.push(`%${options.search.trim()}%`);where.push(`(p.job_num ILIKE $${params.length} OR p.epicor_part ILIKE $${params.length} OR p.program ILIKE $${params.length})`);}
  params.push(maxRows);
  const whereSql=where.length?`WHERE ${where.join(" AND ")}`:"";
  const baseRows=await query(`
    SELECT p.id,p.source_row_no,p.program,p.epicor_part,p.job_num,p.next_operation,p.prod_qty,p.current_good_wip_qty,p.surface_dm2,p.all_operation,
           rr.row_data AS raw_row_data,
           jr.id AS route_id,jr.next_operation AS route_next_operation,jr.revision_num AS route_revision_num,
           COALESCE(ri.completed_at,ri.imported_at) AS route_snapshot_at
    FROM v_active_planning_jobs p
    LEFT JOIN raw_sheet_rows rr ON rr.import_id=p.import_id AND rr.sheet_name=$1 AND rr.source_row_no=p.source_row_no
    LEFT JOIN v_active_job_routes jr ON jr.job_num=p.job_num
    LEFT JOIN route_import_runs ri ON ri.id=jr.import_id
    ${whereSql}
    ORDER BY p.source_row_no
    LIMIT $${params.length}`,[...params]);
  const rows=baseRows.rows as Record<string,unknown>[];
  const routeIds=rows.map((r)=>Number(r.route_id)).filter((x)=>Number.isFinite(x));
  const jobNums=rows.map((r)=>String(r.job_num||"")).filter(Boolean);
  const opMap=new Map<number,RouteOperationForAnalysis[]>();
  if(routeIds.length){
    const ops=await query(`SELECT job_route_id,operation_position,operation_code,operation_seq,is_complete,open_nonconformance,source_operation_text FROM v_active_job_operation_sequence WHERE job_route_id=ANY($1::bigint[]) ORDER BY job_route_id,operation_position`,[routeIds]);
    for(const x of ops.rows as Record<string,unknown>[]){const id=Number(x.job_route_id);const arr=opMap.get(id)||[];arr.push({position:Number(x.operation_position),code:String(x.operation_code),sequence:numberOrNull(x.operation_seq),complete:x.is_complete==null?null:Boolean(x.is_complete),openNonconformance:x.open_nonconformance as string|null,sourceText:String(x.source_operation_text||"")});opMap.set(id,arr);}
  }
  const batchMap=new Map<string,BatchAssignment[]>();
  if(jobNums.length){
    const batches=await query(`
      SELECT j.job_num,b.batch_no,b.main_operation_code,b.status,b.process_time_minutes,b.created_at,
             s.schedule_date,s.start_time,s.end_time,s.duration_minutes AS schedule_duration_minutes,s.status AS schedule_status
      FROM planning_batch_jobs j
      JOIN planning_batches b ON b.id=j.batch_id
      LEFT JOIN LATERAL (
        SELECT x.schedule_date,x.start_time,x.end_time,x.duration_minutes,x.status
        FROM v_active_schedule_blocks x
        WHERE x.batch_ref=b.batch_no
        ORDER BY x.schedule_date DESC,x.source_row_no DESC LIMIT 1
      ) s ON true
      WHERE j.job_num=ANY($1::text[]) AND b.status<>'CANCELLED'
      ORDER BY j.job_num,b.created_at DESC`,[jobNums]);
    for(const x of batches.rows as Record<string,unknown>[]){const job=String(x.job_num||"");const arr=batchMap.get(job)||[];arr.push({batchNo:String(x.batch_no||""),mainOperationCode:String(x.main_operation_code||""),status:String(x.status||""),processTimeMinutes:numberOrNull(x.process_time_minutes),createdAt:String(x.created_at||""),scheduleDate:x.schedule_date==null?null:String(x.schedule_date).slice(0,10),startTime:x.start_time==null?null:String(x.start_time),endTime:x.end_time==null?null:String(x.end_time),scheduleDurationMinutes:numberOrNull(x.schedule_duration_minutes),scheduleStatus:x.schedule_status==null?null:String(x.schedule_status)});batchMap.set(job,arr);}
  }
  const assessed=rows.map((row)=>assessJob(row,opMap.get(Number(row.route_id))||[],batchMap.get(String(row.job_num||""))||[],planningModel,recipeModel,outputModel,options.targetDate,options.cutoffTime));
  const filtered=options.status?.trim()?assessed.filter((x)=>x.outputStatus===options.status):assessed;
  const sum=(status:StOutputJobAssessment["outputStatus"])=>assessed.filter((x)=>x.outputStatus===status).reduce((s,x)=>s+x.surfaceDm2,0);
  const actualSurface=sum("OUTPUT");
  const committedSurface=sum("COMMITTED");
  const plannedSurface=sum("PLANNED");
  const needPlanSurface=sum("NEED_PLAN");
  const atRiskSurface=sum("AT_RISK");
  const reviewSurface=sum("REVIEW");
  const forecastBeforeNewPlan=actualSurface+committedSurface+plannedSurface;
  const gap=Math.max(0,options.targetValue-forecastBeforeNewPlan);
  const selected=recommend(assessed,gap,outputModel.recommendationStrategy);
  const recommendedSurface=selected.reduce((s,x)=>s+x.surfaceDm2,0);
  const forecastWithRecommendation=forecastBeforeNewPlan+recommendedSurface;
  const remainingGap=Math.max(0,options.targetValue-forecastWithRecommendation);
  const snapshotCandidates=rows.map((r)=>wallFromTimestamp(r.route_snapshot_at as string|null,outputModel.timezoneOffsetMinutes)).filter((x):x is number=>x!=null);
  const latestSnapshot=snapshotCandidates.length?Math.max(...snapshotCandidates):null;
  const result:StOutputTargetResult={
    targetDate:options.targetDate,cutoffTime:options.cutoffTime,cutoffAt:wallIso(wallDateTime(options.targetDate,options.cutoffTime))||`${options.targetDate}T${options.cutoffTime}`,
    targetValue:options.targetValue,metricCode:outputModel.metricCode,endpointOperation:outputModel.endpointOperationCode,routeSnapshotAt:wallIso(latestSnapshot),
    summary:{scannedJobs:assessed.length,outputJobs:assessed.filter((x)=>x.outputStatus==="OUTPUT").length,actualSurface,committedSurface,plannedSurface,needPlanSurface,atRiskSurface,reviewSurface,alreadyPlannedSurface:committedSurface+plannedSurface,forecastBeforeNewPlan,gapBeforeRecommendation:gap,recommendedSurface,forecastWithRecommendation,remainingGap,achievementPct:options.targetValue>0?Math.min(999,(forecastWithRecommendation/options.targetValue)*100):0},
    rows:filtered,recommendedJobNums:selected.map((x)=>x.jobNum),actionGroups:actionGroups(selected),warnings:[],
  };
  if(assessed.length>=maxRows)result.warnings.push(`SCAN_LIMIT_REACHED:${maxRows}`);
  if(outputModel.metricCode!=="SURFACE_DM2")result.warnings.push(`METRIC_${outputModel.metricCode}_NOT_IMPLEMENTED_USING_SURFACE_DM2`);
  if(assessed.some((x)=>x.warnings.includes("ONE_OR_MORE_STEPS_NEED_REVIEW")))result.warnings.push("PROCESS_TIME_OR_RECIPE_REVIEW_EXISTS");
  return result;
}
