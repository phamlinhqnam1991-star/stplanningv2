import { getConfigBootstrap } from "@/lib/config";
import { getPlanningModel, type MainOperationDefinition, type PlanningModel } from "@/lib/planning-model";
import { getRecipeModel, resolveProcessTime, resolveRecipe, type ProcessTimeSuggestion, type RecipeModel, type RecipeSuggestion } from "@/lib/recipe-model";
import { type RouteOperationForAnalysis } from "@/lib/route-analysis";
import { resolveErpState } from "@/lib/erp-state-kernel";
import { getStOutputModel, type StOutputModel } from "@/lib/st-output-model";
import { buildStOutputLedger, summarizeOutputLedger, type CanonicalOutputLedgerLine, type CanonicalOutputLedgerSummary } from "@/lib/output-ledger";
import {
  getPredictiveEtaModel,
  predictiveInspectionKey,
  suggestPredictiveEta,
  type EtaConfidence,
  type PredictiveEtaModel,
} from "@/lib/predictive-eta";
import {
  loadStOutputTargetData,
  type StOutputBatchAssignment,
  type StOutputExecutionActual,
  type StOutputInspectionActual,
} from "@/lib/st-output-target-data";

type JsonMap = Record<string, unknown>;

type BatchAssignment = StOutputBatchAssignment;


export type StOutputStep = {
  routePosition: number;
  routeOccurrenceKey: string;
  stepType: "PLANNING" | "INTERMEDIATE_INSPECTION" | "PHYSICAL_SUPPORT";
  operationCode: string;
  operationSequence: number | null;
  mainOperation: MainOperationDefinition | null;
  recipe: RecipeSuggestion;
  processTime: ProcessTimeSuggestion;
  durationMinutes: number | null;
  durationBasis: "BATCH" | "PROCESS_TIME_RULE" | "PREDICTIVE_BLEND" | "PREDICTIVE_P50" | "UNKNOWN_ZERO" | "UNKNOWN_BLOCK";
  predictiveP50Minutes: number | null;
  predictiveP80Minutes: number | null;
  predictiveSampleCount: number;
  etaConfidence: EtaConfidence;
  etaBasis: string;
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
  actualState: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  inspectionActualStatus: string | null;
  needsReview: boolean;
  warnings: string[];
};

export type StOutputBucket =
  | "ALREADY_REACHED_FINAL"
  | "EXISTING_PLAN_FORECAST"
  | "PROPOSED_ADDITIONAL"
  | "LATE"
  | "BLOCKED"
  | "TIME_UNKNOWN"
  | "NOT_APPLICABLE";

export type StOutputJobAssessment = {
  planningJobId: number;
  jobNum: string;
  program: string | null;
  part: string | null;
  revision: string | null;
  qty: number | null;
  surfaceDm2: number;
  outputKey: string;
  outputBucket: StOutputBucket;
  finalGateCode: string | null;
  finalGateOccurrence: number | null;
  requiresNewPlan: boolean;
  selectedForTarget: boolean;
  existingScheduledCount: number;
  existingUnscheduledCount: number;
  nextOperation: string | null;
  endpointOperation: string;
  currentPosition: number | null;
  endpointPosition: number | null;
  remainingOperationCount: number;
  remainingProcessMinutes: number | null;
  remainingInspectionCount: number;
  nextInspectionCode: string | null;
  nextInspectionStatus: "READY" | "WAITING" | "IN_PROGRESS" | "REVIEW" | null;
  nextInspectionEta: string | null;
  nextInspectionFinishAt: string | null;
  routeSnapshotAt: string | null;
  projectedFinsstAt: string | null;
  projectedP80At: string | null;
  etaConfidence: EtaConfidence;
  etaRiskStatus: "NORMAL" | "P80_AFTER_CUTOFF" | "INSUFFICIENT_HISTORY";
  predictiveSampleCount: number;
  latestRequiredStart: string | null;
  outputStatus: "OUTPUT" | "COMMITTED" | "PLANNED" | "NEED_PLAN" | "AT_RISK" | "REVIEW" | "OUTPUT_OTHER_DAY" | "NOT_APPLICABLE";
  outputBasis: string;
  countsTowardTarget: boolean;
  needsReview: boolean;
  criticalAction: StOutputStep | null;
  steps: StOutputStep[];
  actualExecutionCount: number;
  inspectionFailedCount: number;
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
  finalGateCodes: string[];
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
    alreadyReachedFinalSurface: number;
    existingPlanForecastSurface: number;
    proposedAdditionalSurface: number;
    totalForecastSurface: number;
    lateSurface: number;
    blockedSurface: number;
    timeUnknownSurface: number;
    duplicateJobsSuppressed: number;
  };
  rows: StOutputJobAssessment[];
  recommendedJobNums: string[];
  actionGroups: StOutputActionGroup[];
  outputLedger: CanonicalOutputLedgerLine[];
  ledgerSummary: CanonicalOutputLedgerSummary;
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
function stepTypeOf(main: MainOperationDefinition | null): StOutputStep["stepType"] {
  if (key(main?.code) === "ST_INSPECTION") return "INTERMEDIATE_INSPECTION";
  if (main?.planningEnabled) return "PLANNING";
  return "PHYSICAL_SUPPORT";
}

function inspectionStatusOf(step: StOutputStep): StOutputJobAssessment["nextInspectionStatus"] {
  if (step.state === "RUNNING") return "IN_PROGRESS";
  if (step.needsReview && step.durationMinutes == null) return "REVIEW";
  if (step.state === "READY_UNPLANNED") return "READY";
  return "WAITING";
}

function routeSignature(operations: RouteOperationForAnalysis[]): string {
  const input = operations.map((op) => `${op.position}:${key(op.code)}`).join(">");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase();
}

function finalGateOccurrence(
  operations: RouteOperationForAnalysis[],
  endpointIndex: number,
): number | null {
  const endpoint = operations[endpointIndex];
  if (!endpoint) return null;
  const code = key(endpoint.code);
  let occurrence = 0;
  for (let i = 0; i <= endpointIndex; i += 1) {
    if (key(operations[i]?.code) === code) occurrence += 1;
  }
  return occurrence || 1;
}

function resolveApplicableFinalGate(
  operations: RouteOperationForAnalysis[],
  currentIndex: number,
  finalGateCodes: string[],
): { endpoint: RouteOperationForAnalysis | null; endpointIndex: number } {
  const finalSet = new Set(finalGateCodes.map(key).filter(Boolean));
  const indexes = operations
    .map((op, index) => (finalSet.has(key(op.code)) ? index : -1))
    .filter((index) => index >= 0);
  if (!indexes.length) return { endpoint: null, endpointIndex: -1 };

  // Rework/duplicate-safe: use the first terminal gate in the current physical suffix.
  // Completed earlier gates are intentionally ignored when currentIndex has moved past them.
  const endpointIndex = currentIndex >= 0
    ? (indexes.find((index) => index >= currentIndex) ?? -1)
    : indexes[indexes.length - 1];
  return {
    endpoint: endpointIndex >= 0 ? operations[endpointIndex] : null,
    endpointIndex,
  };
}

function outputBucketFor(
  status: StOutputJobAssessment["outputStatus"],
  warnings: string[],
): StOutputBucket {
  if (status === "OUTPUT") return "ALREADY_REACHED_FINAL";
  if (status === "COMMITTED" || status === "PLANNED") return "EXISTING_PLAN_FORECAST";
  if (status === "NEED_PLAN") return "PROPOSED_ADDITIONAL";
  if (status === "AT_RISK" || status === "OUTPUT_OTHER_DAY") return "LATE";
  if (status === "NOT_APPLICABLE") return "NOT_APPLICABLE";
  if (warnings.some((warning) => warning.includes("TIME") || warning.includes("PROCESS_TIME"))) {
    return "TIME_UNKNOWN";
  }
  return "BLOCKED";
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
function takeBatch(main: MainOperationDefinition | null, operationCode: string, routePosition: number, queues: Map<string, BatchAssignment[]>): BatchAssignment | null {
  if (!main) return null;
  const arr = queues.get(key(main.code));
  if (!arr?.length) return null;
  const op = key(operationCode);
  // Route-safe priority: exact route position > exact source operation > generic main-operation fallback.
  // This prevents repeated MASKING/UNMASKING (or any repeated Main Operation) from being attached to the wrong route occurrence.
  let index = arr.findIndex((x)=>x.routePosition != null && x.routePosition === routePosition);
  if (index < 0) index = arr.findIndex((x)=>key(x.sourceOperation) === op);
  if (index < 0) index = 0;
  const [picked] = arr.splice(index,1);
  return picked || null;
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
      return { status:"OUTPUT_OTHER_DAY", basis:`${endpoint.code} completed ${completion.date}`, projected:completion.time ? `${completion.date}T${completion.time.slice(0,5)}` : `${completion.date}`, review:false, counts:false };
    }
    if (completion.date === targetDate && completion.time) {
      const completedWall = wallDateTime(completion.date, completion.time);
      return completedWall <= cutoffWall
        ? { status:"OUTPUT", basis:`${endpoint.code} completion timestamp`, projected:wallIso(completedWall), review:false, counts:true }
        : { status:"AT_RISK", basis:`${endpoint.code} completed after cutoff`, projected:wallIso(completedWall), review:false, counts:false };
    }
    if (completion.date === targetDate && snapshotWall != null && wallDate(snapshotWall) === targetDate && snapshotWall <= cutoffWall) {
      return { status:"OUTPUT", basis:`${endpoint.code} complete by route snapshot before cutoff`, projected:wallIso(snapshotWall), review:false, counts:true };
    }
    if (completion.date === targetDate && model.completedDateAssumeBeforeCutoff) {
      return { status:"OUTPUT", basis:`${endpoint.code} completion date; configured assume-before-cutoff`, projected:completion.date, review:true, counts:true };
    }
    if (completion.date === targetDate) {
      return { status:"REVIEW", basis:`${endpoint.code} completion date has no time; cutoff cannot be proven`, projected:completion.date, review:true, counts:false };
    }
    if (!completion.date && snapshotWall != null && wallDate(snapshotWall) === targetDate && snapshotWall <= cutoffWall) {
      return { status:"OUTPUT", basis:`${endpoint.code} complete by route snapshot before cutoff`, projected:wallIso(snapshotWall), review:true, counts:true };
    }
    return { status:"REVIEW", basis:`${endpoint.code} is complete but completion date/time is unavailable`, projected:null, review:true, counts:false };
  }
  if (currentIndex === endpointIndex && model.countReadyAtEndpointAsOutput) {
    if (snapshotWall != null && wallDate(snapshotWall) === targetDate && snapshotWall <= cutoffWall) {
      return { status:"OUTPUT", basis:`NextOperation is ${endpoint.code} at route snapshot before cutoff`, projected:wallIso(snapshotWall), review:false, counts:true };
    }
    if (snapshotWall != null && wallDate(snapshotWall) !== targetDate) {
      return { status:"OUTPUT_OTHER_DAY", basis:`Job was already at ${endpoint.code} on ${wallDate(snapshotWall)}`, projected:wallIso(snapshotWall), review:false, counts:false };
    }
    return { status:"REVIEW", basis:`Job is at ${endpoint.code} but snapshot is after cutoff or unavailable`, projected:wallIso(snapshotWall), review:true, counts:false };
  }
  return { status:null, basis:"", projected:null, review:false, counts:false };
}

function occurrenceKeyForPosition(ops: RouteOperationForAnalysis[], position: number): string {
  const index=ops.findIndex((op)=>op.position===position);
  if(index<0)return `POS#${position}`;
  const code=key(ops[index].code); let occurrence=0;
  for(let i=0;i<=index;i+=1)if(key(ops[i].code)===code)occurrence+=1;
  return `${ops[index].code}#${occurrence}`;
}
function actualWall(value:string|null|undefined,offsetMinutes:number){return wallFromTimestamp(value,offsetMinutes);}

function assessJob(
  row: Record<string, unknown>,
  operations: RouteOperationForAnalysis[],
  assignments: BatchAssignment[],
  executions: StOutputExecutionActual[],
  inspections: StOutputInspectionActual[],
  planningModel: PlanningModel,
  recipeModel: RecipeModel,
  predictiveModel: PredictiveEtaModel,
  outputModel: StOutputModel,
  targetDate: string,
  cutoffTime: string,
): StOutputJobAssessment {
  const snapshotWall = wallFromTimestamp(row.route_snapshot_at as string | null, outputModel.timezoneOffsetMinutes);
  const cutoffWall = wallDateTime(targetDate, cutoffTime);
  const sorted = [...operations].filter((x)=>x.code).sort((a,b)=>a.position-b.position);
  const erpState = resolveErpState({
    jobNum: String(row.job_num || ""),
    operations: sorted,
    allOperation: row.all_operation as string | null,
    evidence: {
      nextOperation: (row.route_next_operation as string | null) || (row.next_operation as string | null),
      lastLaborOp: (row.route_last_labor_op as string | null) || (row.last_labor_op as string | null),
      lastLaborSequence: row.route_last_labor_opr_seq == null ? null : Number(row.route_last_labor_opr_seq),
    },
    finalGateCodes: outputModel.finalInspectionOperationCodes,
    routeOptions: { preferNextOperation:true, fallbackFirstIncomplete:true, includeCurrentInRemaining:true },
  });
  const route = erpState.route;
  const currentIndex = route.currentPosition == null ? -1 : sorted.findIndex((x)=>x.position===route.currentPosition);
  const { endpoint, endpointIndex } = resolveApplicableFinalGate(
    sorted,
    currentIndex,
    outputModel.finalInspectionOperationCodes,
  );
  const gateOccurrence = endpointIndex >= 0 ? finalGateOccurrence(sorted, endpointIndex) : null;
  const routeSig = routeSignature(sorted);
  const warnings: string[] = [...route.anchorWarnings];
  const sourceSurface = Number(row.surface_dm2 || 0) || 0;
  const prodQty = Number(row.prod_qty || 0) || 0;
  const goodWipQty = Number(row.current_good_wip_qty || 0) || 0;
  const surfaceDm2 = outputModel.surfaceCalculationMode === "SURFACE_X_PROD_QTY" ? sourceSurface * prodQty
    : outputModel.surfaceCalculationMode === "SURFACE_X_GOOD_WIP_QTY" ? sourceSurface * goodWipQty
    : sourceSurface;
  const jobNum = String(row.job_num || "");
  const finalGateCode = endpoint?.code || null;
  const outputKey = `${jobNum}|${routeSig}|${finalGateCode || "NO_FINAL"}#${gateOccurrence || 0}`;
  const base = {
    planningJobId:Number(row.id), jobNum, program:row.program as string|null,
    part:row.epicor_part as string|null, revision:(row.route_revision_num || row.revision_num || null) as string|null,
    qty:numberOrNull(row.prod_qty), surfaceDm2, outputKey,
    outputBucket:"NOT_APPLICABLE" as StOutputBucket,
    finalGateCode, finalGateOccurrence:gateOccurrence, requiresNewPlan:false, selectedForTarget:false,
    existingScheduledCount:0, existingUnscheduledCount:0,
    nextOperation:row.next_operation as string|null,
    endpointOperation:finalGateCode || outputModel.endpointOperationCode, currentPosition:route.currentPosition,
    endpointPosition:endpoint?.position ?? null,
    remainingInspectionCount:0, nextInspectionCode:null, nextInspectionStatus:null,
    nextInspectionEta:null, nextInspectionFinishAt:null,
    routeSnapshotAt:row.route_snapshot_at as string|null,
    projectedP80At:null, etaConfidence:"NONE" as EtaConfidence, etaRiskStatus:"INSUFFICIENT_HISTORY" as const, predictiveSampleCount:0,
    actualExecutionCount:executions.length,
    inspectionFailedCount:inspections.filter((x)=>key(x.status)==="FAILED").length,
  };
  if (!endpoint) {
    return { ...base, remainingOperationCount:0, remainingProcessMinutes:null, projectedFinsstAt:null, latestRequiredStart:null,
      outputStatus:"NOT_APPLICABLE", outputBasis:`No applicable Final Gate (${outputModel.finalInspectionOperationCodes.join(", ")}) found in current route suffix`, countsTowardTarget:false,
      needsReview:false, criticalAction:null, steps:[], warnings:["ENDPOINT_NOT_IN_ROUTE"] };
  }

  const finalOccurrenceKey=occurrenceKeyForPosition(sorted,endpoint.position);
  const finalInspection=inspections.find((x)=>x.routeOccurrenceKey===finalOccurrenceKey || (x.routePosition===endpoint.position && key(x.operationCode)===key(endpoint.code))) || null;
  if(finalInspection && key(finalInspection.status)==="FAILED") {
    return { ...base, outputBucket:"BLOCKED",remainingOperationCount:Math.max(0,endpointIndex-currentIndex),remainingProcessMinutes:null,projectedFinsstAt:null,latestRequiredStart:null,outputStatus:"REVIEW",outputBasis:`Final Inspection ${endpoint.code} FAILED`,countsTowardTarget:false,needsReview:true,criticalAction:null,steps:[],warnings:["FINAL_INSPECTION_FAILED"] };
  }
  if(finalInspection && ["PASSED","SKIPPED"].includes(key(finalInspection.status)) && finalInspection.actualEnd) {
    const finalWall=actualWall(finalInspection.actualEnd,outputModel.timezoneOffsetMinutes);
    const onTime=finalWall!=null&&finalWall<=cutoffWall&&wallDate(finalWall)===targetDate;
    const status:StOutputJobAssessment["outputStatus"]=onTime?"OUTPUT":"AT_RISK";
    return { ...base,outputBucket:onTime?"ALREADY_REACHED_FINAL":"LATE",remainingOperationCount:0,remainingProcessMinutes:0,projectedFinsstAt:wallIso(finalWall),projectedP80At:wallIso(finalWall),etaConfidence:"HIGH",etaRiskStatus:"NORMAL",predictiveSampleCount:0,latestRequiredStart:wallIso(finalWall),outputStatus:status,outputBasis:`Actual Final Inspection ${endpoint.code} ${finalInspection.status}`,countsTowardTarget:onTime,needsReview:false,criticalAction:null,steps:[],warnings:[] };
  }
  const actual = evaluateActual(endpoint,currentIndex,endpointIndex,snapshotWall,targetDate,cutoffWall,outputModel);
  if (actual.status) {
    const actualWarnings = actual.review ? ["OUTPUT_TIME_REVIEW"] : [];
    return { ...base, outputBucket:outputBucketFor(actual.status,actualWarnings),
      remainingOperationCount:Math.max(0,endpointIndex-currentIndex), remainingProcessMinutes:0,
      projectedFinsstAt:actual.projected, projectedP80At:actual.projected, etaConfidence:actual.review?"NONE":"HIGH", etaRiskStatus:actual.review?"INSUFFICIENT_HISTORY":"NORMAL", predictiveSampleCount:0,
      latestRequiredStart:actual.projected, outputStatus:actual.status, outputBasis:actual.basis,
      countsTowardTarget:actual.counts, needsReview:actual.review, criticalAction:null, steps:[], warnings:actualWarnings };
  }
  if (currentIndex < 0 || endpointIndex < currentIndex) {
    return { ...base, outputBucket:"BLOCKED", remainingOperationCount:0, remainingProcessMinutes:null, projectedFinsstAt:null, latestRequiredStart:null,
      outputStatus:"REVIEW", outputBasis:`Current route position cannot be resolved before ${endpoint.code}`, countsTowardTarget:false,
      needsReview:true, criticalAction:null, steps:[], warnings:["ROUTE_POSITION_REVIEW"] };
  }

  const requiredOps = sorted.slice(currentIndex, endpointIndex).filter((op)=>op.complete !== true);
  const queues = batchQueues(assignments);
  const steps: StOutputStep[] = [];
  let cursor = snapshotWall ?? Date.now() + outputModel.timezoneOffsetMinutes*60_000;
  let p80Cursor = cursor;
  let unknownBlocked = false;

  for (let i=0;i<requiredOps.length;i++) {
    const op = requiredOps[i];
    const occurrenceKey=occurrenceKeyForPosition(sorted,op.position);
    const execution=executions.find((x)=>x.routeOccurrenceKey===occurrenceKey || (x.routePosition===op.position && key(x.mainOperationCode)===key(mapMain(op.code,planningModel)?.code))) || null;
    const inspectionActual=inspections.find((x)=>x.routeOccurrenceKey===occurrenceKey || (x.routePosition===op.position && key(x.operationCode)===key(op.code))) || null;
    const main = mapMain(op.code, planningModel);
    const include = outputModel.includeNonPlanningOperations || Boolean(main?.planningEnabled);
    if (!include) continue;
    const recipe = resolveRecipe(main?.code || null, row.raw_row_data, recipeModel);
    const process = resolveProcessTime(main?.code || null, row.raw_row_data, recipe, recipeModel, {
      operationCode: op.code,
      qty: numberOrNull(row.prod_qty),
      surfaceDm2,
    });
    const batch = takeBatch(main, op.code, op.position, queues);
    const batchMinutes = batch?.processTimeMinutes;
    const configuredDuration = batchMinutes != null ? batchMinutes : process.minutes;
    const type = stepTypeOf(main);
    const predictiveKey = type === "INTERMEDIATE_INSPECTION"
      ? predictiveInspectionKey(op.code)
      : main?.code || null;
    const eta = suggestPredictiveEta(
      predictiveModel,
      predictiveKey,
      type === "INTERMEDIATE_INSPECTION" ? null : recipe.recipeNo,
      configuredDuration,
    );
    let duration = eta.forecastMinutes;
    let basis: StOutputStep["durationBasis"] = batchMinutes != null
      ? (eta.confidence !== "NONE" ? "PREDICTIVE_BLEND" : "BATCH")
      : process.minutes != null
        ? (eta.confidence !== "NONE" ? "PREDICTIVE_BLEND" : "PROCESS_TIME_RULE")
        : eta.confidence !== "NONE" && eta.forecastMinutes != null
          ? "PREDICTIVE_P50"
          : outputModel.unknownStepPolicy === "BLOCK"
            ? "UNKNOWN_BLOCK"
            : "UNKNOWN_ZERO";
    const stepWarnings: string[] = [];
    let review = Boolean(recipe.needsReview || process.needsReview);
    if (eta.confidence === "NONE" && predictiveModel.enabled && configuredDuration != null) {
      stepWarnings.push("PREDICTIVE_HISTORY_INSUFFICIENT");
    }
    if (duration == null) {
      if (outputModel.unknownStepPolicy === "BLOCK") { unknownBlocked = true; review = true; stepWarnings.push("PROCESS_TIME_MISSING"); }
      else { duration = outputModel.defaultUnknownMinutes; review = true; stepWarnings.push("PROCESS_TIME_MISSING_USING_CONFIGURED_FALLBACK"); }
    }
    const schedule = batch ? scheduleWall(batch) : {start:null,end:null};
    const actualState=execution?.state || null;
    const inspectionState=inspectionActual?.status || null;
    const planned = Boolean(batch) || Boolean(execution);
    const scheduled = (schedule.start != null && schedule.end != null) || Boolean(execution?.actualStart);
    let start = cursor;
    let finish: number | null = duration == null ? null : start + duration*60_000;
    const p80Duration = eta.confidence !== "NONE" ? (eta.p80Minutes ?? duration) : duration;
    let p80Start = p80Cursor;
    let p80Finish: number | null = p80Duration == null ? null : p80Start + p80Duration*60_000;
    if (scheduled && schedule.start != null && schedule.end != null) {
      if (schedule.start >= cursor) { start=schedule.start; finish=schedule.end; }
      else if (schedule.end >= cursor) { start=schedule.start; finish=schedule.end; }
      else { stepWarnings.push("SCHEDULE_BEFORE_ROUTE_READY"); review=true; }
      // An accepted exact reservation is stronger evidence than statistical duration.
      p80Start = schedule.start;
      p80Finish = Math.max(schedule.end, p80Cursor);
    }
    if(execution?.actualStart){
      const a=actualWall(execution.actualStart,outputModel.timezoneOffsetMinutes);
      if(a!=null){start=a;p80Start=a;}
    }
    if(key(execution?.state)==="DONE"){
      const a=actualWall(execution?.actualEnd,outputModel.timezoneOffsetMinutes);
      finish=a??start;p80Finish=finish;duration=0;basis="BATCH";
    }
    else if(key(execution?.state)==="IN_PROGRESS"&&duration!=null){
      finish=start+duration*60_000;
      p80Finish=p80Duration==null?finish:start+p80Duration*60_000;
    }
    if(type==="INTERMEDIATE_INSPECTION" && inspectionActual){
      if(["PASSED","SKIPPED"].includes(key(inspectionActual.status))){
        const a=actualWall(inspectionActual.actualEnd,outputModel.timezoneOffsetMinutes);
        finish=a??start;p80Finish=finish;duration=0;basis="BATCH";
      }
      else if(key(inspectionActual.status)==="IN_PROGRESS"&&inspectionActual.actualStart){
        const a=actualWall(inspectionActual.actualStart,outputModel.timezoneOffsetMinutes);
        if(a!=null){start=a;p80Start=a;finish=duration==null?null:a+duration*60_000;p80Finish=p80Duration==null?finish:a+p80Duration*60_000;}
      }
      else if(key(inspectionActual.status)==="FAILED"){unknownBlocked=true;review=true;finish=null;p80Finish=null;stepWarnings.push("INSPECTION_FAILED");}
    }
    if (finish != null) cursor=Math.max(cursor,finish);
    if (p80Finish != null) p80Cursor=Math.max(p80Cursor,p80Finish);
    const state: StOutputStep["state"] = key(execution?.state)==="DONE" || ["PASSED","SKIPPED"].includes(key(inspectionActual?.status)) ? "COMPLETE"
      : key(execution?.state)==="IN_PROGRESS" || key(inspectionActual?.status)==="IN_PROGRESS" ? "RUNNING"
      : scheduled ? (key(batch?.status)==="STARTED"?"RUNNING":"SCHEDULED")
      : planned ? "BATCHED" : i===0 ? "READY_UNPLANNED" : "WAIT_PREVIOUS";
    steps.push({
      routePosition:op.position, routeOccurrenceKey:occurrenceKey, stepType:stepTypeOf(main), operationCode:op.code, operationSequence:op.sequence ?? null, mainOperation:main,
      recipe, processTime:process, durationMinutes:duration, durationBasis:basis,
      predictiveP50Minutes:eta.p50Minutes, predictiveP80Minutes:eta.p80Minutes, predictiveSampleCount:eta.sampleCount,
      etaConfidence:eta.confidence, etaBasis:eta.basis, state,
      batchNo:batch?.batchNo || null, batchStatus:batch?.status || null, scheduleDate:batch?.scheduleDate || null,
      scheduleStart:wallIso(schedule.start), scheduleEnd:wallIso(schedule.end), earliestStart:wallIso(start), earliestFinish:wallIso(finish),
      latestStart:null, latestFinish:null, slackMinutes:null, planned, scheduled, actualState,actualStart:execution?.actualStart||null,actualEnd:execution?.actualEnd||null,inspectionActualStatus:inspectionState,needsReview:review, warnings:stepWarnings,
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
  const projectedP80 = unknownBlocked ? null : (steps.length ? p80Cursor : snapshotWall);
  const allPlanningSteps = steps.filter((x)=>x.mainOperation?.planningEnabled);
  const allPlanned = allPlanningSteps.every((x)=>x.planned);
  const allScheduled = allPlanningSteps.every((x)=>x.scheduled);
  const anyReview = steps.some((x)=>x.needsReview) || unknownBlocked;
  const timeReview = steps.some((x)=>x.durationBasis === "UNKNOWN_ZERO" || x.durationBasis === "UNKNOWN_BLOCK" || x.warnings.includes("SCHEDULE_BEFORE_ROUTE_READY"));
  const critical = steps.find((x)=>x.mainOperation?.planningEnabled && !x.planned) || steps.find((x)=>!x.scheduled) || steps[0] || null;
  let status: StOutputJobAssessment["outputStatus"];
  let basis: string;
  if (unknownBlocked || projected == null) { status="REVIEW"; basis="One or more remaining operations have no usable process time."; }
  else if (timeReview) { status="REVIEW"; basis="A remaining operation uses unknown/fallback process time or has a schedule conflict; cutoff feasibility is not proven."; }
  else if (projected > cutoffWall) { status="AT_RISK"; basis=`Earliest calculated arrival at ${endpoint.code} is after cutoff.`; }
  else if (allScheduled) { status="COMMITTED"; basis="All remaining Planning steps are scheduled and calculated arrival is before cutoff."; }
  else if (allPlanned) { status="PLANNED"; basis="All remaining Planning steps are batched; scheduling is not complete but process-time forecast is before cutoff."; }
  else { status="NEED_PLAN"; basis=`Process-time forecast can reach ${endpoint.code} before cutoff, but one or more remaining Planning steps are not batched.`; }
  const predictiveSteps = steps.filter((x)=>!x.scheduled && x.state!=="COMPLETE" && x.state!=="RUNNING");
  const confidenceRank: Record<EtaConfidence,number> = {NONE:0,LOW:1,MEDIUM:2,HIGH:3};
  const etaConfidence: EtaConfidence = predictiveSteps.length===0
    ? "HIGH"
    : predictiveSteps.reduce<EtaConfidence>((lowest,step)=>confidenceRank[step.etaConfidence]<confidenceRank[lowest]?step.etaConfidence:lowest,"HIGH");
  const predictiveSampleCount = predictiveSteps.reduce((sum,step)=>sum+step.predictiveSampleCount,0);
  const p80AfterCutoff = predictiveModel.p80RiskAlert && projectedP80!=null && projectedP80>cutoffWall;
  const etaRiskStatus: StOutputJobAssessment["etaRiskStatus"] = p80AfterCutoff
    ? "P80_AFTER_CUTOFF"
    : predictiveSteps.length>0 && etaConfidence==="NONE"
      ? "INSUFFICIENT_HISTORY"
      : "NORMAL";
  if(p80AfterCutoff){
    warnings.push("P80_AFTER_CUTOFF");
    if(predictiveModel.p80BlocksForecast && ["COMMITTED","PLANNED","NEED_PLAN"].includes(status)){
      status="AT_RISK";
      basis=`P50/primary ETA is feasible, but predictive P80 arrival at ${endpoint.code} is after cutoff.`;
    }
  }
  if (anyReview) warnings.push("ONE_OR_MORE_STEPS_NEED_REVIEW");
  if (steps.some((x)=>x.durationBasis === "UNKNOWN_ZERO" || x.durationBasis === "UNKNOWN_BLOCK")) warnings.push("FINAL_TIME_UNKNOWN");
  if (steps.some((x)=>x.warnings.includes("SCHEDULE_BEFORE_ROUTE_READY"))) warnings.push("SCHEDULE_CONFLICT");
  if (steps.some((x)=>x.warnings.includes("INSPECTION_FAILED"))) warnings.push("INSPECTION_FAILED_BLOCKS_OUTPUT");
  const remainingMinutes = steps.every((x)=>x.durationMinutes!=null) ? steps.reduce((s,x)=>s+(x.durationMinutes||0),0) : null;
  const inspectionSteps = steps.filter((x)=>x.stepType === "INTERMEDIATE_INSPECTION");
  const nextInspection = inspectionSteps[0] || null;
  const existingScheduledCount = allPlanningSteps.filter((step)=>step.scheduled).length;
  const existingUnscheduledCount = allPlanningSteps.filter((step)=>step.planned && !step.scheduled).length;
  const requiresNewPlan = allPlanningSteps.some((step)=>!step.planned);
  return { ...base, outputBucket:outputBucketFor(status,warnings), requiresNewPlan,
    existingScheduledCount, existingUnscheduledCount,
    remainingOperationCount:requiredOps.length, remainingProcessMinutes:remainingMinutes,
    remainingInspectionCount:inspectionSteps.length,
    nextInspectionCode:nextInspection?.operationCode || null,
    nextInspectionStatus:nextInspection ? inspectionStatusOf(nextInspection) : null,
    nextInspectionEta:nextInspection?.earliestStart || null,
    nextInspectionFinishAt:nextInspection?.earliestFinish || null,
    projectedFinsstAt:wallIso(projected), projectedP80At:wallIso(projectedP80), etaConfidence, etaRiskStatus, predictiveSampleCount,
    latestRequiredStart:steps[0]?.latestStart || wallIso(cutoffWall), outputStatus:status,
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
  const [bootstrap, planningModel, recipeModel, outputModel, predictiveModel] = await Promise.all([
    getConfigBootstrap(),
    getPlanningModel(),
    getRecipeModel(),
    getStOutputModel(),
    getPredictiveEtaModel(),
  ]);
  const planningProfile = bootstrap.sources.PLANNING;
  const planningSheetName = planningProfile.sheetName || planningProfile.displayName;
  const maxRows = Math.max(
    100,
    Math.min(outputModel.maxScanJobs, options.limit || outputModel.maxScanJobs),
  );

  const loaded = await loadStOutputTargetData({
    planningSheetName,
    search: options.search,
    maxRows,
  });

  let assessed = loaded.rows.map((row) =>
    assessJob(
      row,
      loaded.operationsByRouteId.get(Number(row.route_id)) || [],
      loaded.batchesByJob.get(String(row.job_num || "")) || [],
      loaded.executionsByJob.get(String(row.job_num || "")) || [],
      loaded.inspectionsByJob.get(String(row.job_num || "")) || [],
      planningModel,
      recipeModel,
      predictiveModel,
      outputModel,
      options.targetDate,
      options.cutoffTime,
    ),
  );

  const sumStatus = (status: StOutputJobAssessment["outputStatus"]) =>
    assessed
      .filter((row) => row.outputStatus === status)
      .reduce((sum, row) => sum + row.surfaceDm2, 0);
  const sumBucket = (bucket: StOutputBucket) =>
    assessed
      .filter((row) => row.outputBucket === bucket)
      .reduce((sum, row) => sum + row.surfaceDm2, 0);

  const actualSurface = sumStatus("OUTPUT");
  const committedSurface = sumStatus("COMMITTED");
  const plannedSurface = sumStatus("PLANNED");
  const needPlanSurface = sumStatus("NEED_PLAN");
  const atRiskSurface = sumStatus("AT_RISK");
  const reviewSurface = sumStatus("REVIEW");
  const forecastBeforeNewPlan = actualSurface + committedSurface + plannedSurface;
  const gap = Math.max(0, options.targetValue - forecastBeforeNewPlan);
  const selected = recommend(assessed, gap, outputModel.recommendationStrategy);
  const selectedJobNums = new Set(selected.map((row) => row.jobNum));

  assessed = assessed.map((row) =>
    selectedJobNums.has(row.jobNum)
      ? { ...row, selectedForTarget: true }
      : row,
  );

  const outputLedger = buildStOutputLedger(assessed);
  const ledgerSummary = summarizeOutputLedger(outputLedger);
  const recommendedSurface = selected.reduce((sum, row) => sum + row.surfaceDm2, 0);
  const forecastWithRecommendation = forecastBeforeNewPlan + recommendedSurface;
  const remainingGap = Math.max(0, options.targetValue - forecastWithRecommendation);
  const snapshotCandidates = loaded.rows
    .map((row) =>
      wallFromTimestamp(
        row.route_snapshot_at as string | null,
        outputModel.timezoneOffsetMinutes,
      ),
    )
    .filter((value): value is number => value != null);
  const latestSnapshot = snapshotCandidates.length
    ? Math.max(...snapshotCandidates)
    : null;

  const alreadyReachedFinalSurface = ledgerSummary.actualFinalSurfaceDm2;
  const existingPlanForecastSurface = ledgerSummary.existingScheduledSurfaceDm2 + ledgerSummary.existingUnscheduledSurfaceDm2;
  const proposedAdditionalSurface = ledgerSummary.proposedSurfaceDm2;
  const totalForecastSurface = ledgerSummary.countedSurfaceDm2;
  const lateSurface = ledgerSummary.lateSurfaceDm2;
  const blockedSurface = ledgerSummary.blockedSurfaceDm2;
  const timeUnknownSurface = ledgerSummary.timeUnknownSurfaceDm2;

  const filtered = options.status?.trim()
    ? assessed.filter((row) => row.outputStatus === options.status)
    : assessed;

  const result: StOutputTargetResult = {
    targetDate: options.targetDate,
    cutoffTime: options.cutoffTime,
    cutoffAt:
      wallIso(wallDateTime(options.targetDate, options.cutoffTime)) ||
      `${options.targetDate}T${options.cutoffTime}`,
    targetValue: options.targetValue,
    metricCode: outputModel.metricCode,
    endpointOperation: outputModel.finalInspectionOperationCodes.join(" / "),
    finalGateCodes: outputModel.finalInspectionOperationCodes,
    routeSnapshotAt: wallIso(latestSnapshot),
    summary: {
      scannedJobs: assessed.length,
      outputJobs: assessed.filter((row) => row.outputStatus === "OUTPUT").length,
      actualSurface,
      committedSurface,
      plannedSurface,
      needPlanSurface,
      atRiskSurface,
      reviewSurface,
      alreadyPlannedSurface: committedSurface + plannedSurface,
      forecastBeforeNewPlan,
      gapBeforeRecommendation: gap,
      recommendedSurface,
      forecastWithRecommendation,
      remainingGap,
      achievementPct:
        options.targetValue > 0
          ? Math.min(999, (forecastWithRecommendation / options.targetValue) * 100)
          : 0,
      alreadyReachedFinalSurface,
      existingPlanForecastSurface,
      proposedAdditionalSurface,
      totalForecastSurface,
      lateSurface,
      blockedSurface,
      timeUnknownSurface,
      duplicateJobsSuppressed: loaded.duplicateJobNums.length,
    },
    rows: filtered,
    recommendedJobNums: [...selectedJobNums],
    actionGroups: actionGroups(selected),
    outputLedger,
    ledgerSummary,
    warnings: [...loaded.warnings],
  };

  if (loaded.rows.length >= maxRows) result.warnings.push(`SCAN_LIMIT_REACHED:${maxRows}`);
  if (outputModel.metricCode !== "SURFACE_DM2") {
    result.warnings.push(
      `METRIC_${outputModel.metricCode}_NOT_IMPLEMENTED_USING_SURFACE_DM2`,
    );
  }
  if (assessed.some((row) => row.warnings.includes("ONE_OR_MORE_STEPS_NEED_REVIEW"))) {
    result.warnings.push("PROCESS_TIME_OR_RECIPE_REVIEW_EXISTS");
  }
  if (assessed.some((row) => row.outputBucket === "TIME_UNKNOWN")) {
    result.warnings.push("FINAL_TIME_UNKNOWN_EXISTS");
  }
  if (assessed.some((row) => row.outputBucket === "BLOCKED")) {
    result.warnings.push("BLOCKED_OUTPUT_ROUTE_EXISTS");
  }
  if (assessed.some((row) => row.etaRiskStatus === "P80_AFTER_CUTOFF")) {
    result.warnings.push("PREDICTIVE_P80_CUTOFF_RISK_EXISTS");
  }
  if (predictiveModel.enabled && assessed.some((row) => row.etaRiskStatus === "INSUFFICIENT_HISTORY")) {
    result.warnings.push("PREDICTIVE_HISTORY_INSUFFICIENT_FOR_SOME_JOBS");
  }

  return result;
}
