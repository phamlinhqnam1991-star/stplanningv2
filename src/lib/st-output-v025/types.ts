export type FinalGateState =
  | "BEFORE_FINAL"
  | "REACHED_FINAL"
  | "AFTER_FINAL"
  | "UNKNOWN";

export type OptimizerAction =
  | "CONTINUE"
  | "SCHEDULE_EXISTING_ONLY"
  | "FINAL_REACHED"
  | "BLOCKED"
  | "REVIEW";

export type PlanningCoverageState =
  | "DONE"
  | "IN_PROGRESS"
  | "PLANNED_SCHEDULED"
  | "PLANNED_UNSCHEDULED"
  | "READY"
  | "WAIT"
  | "UNKNOWN";

export type TimelineState =
  | "DONE"
  | "IN_PROGRESS"
  | "EXISTING_SCHEDULED"
  | "EXISTING_UNSCHEDULED"
  | "PROPOSED_EXISTING_BATCH"
  | "PROPOSED_NEW_BATCH"
  | "OUTAGE"
  | "FINAL_GATE"
  | "CONFLICT";

export type TimelineSourceType = "EXISTING" | "PROPOSED" | "SCENARIO";

export type TimelinePhase =
  | "LOADING"
  | "PROCESS"
  | "NDT"
  | "UNLOADING"
  | "MASKING"
  | "UNMASKING"
  | "NORMAL"
  | "FINAL_GATE";

export type ResourceType =
  | "CABIN"
  | "FLYBAR"
  | "CHEM_PROCESS"
  | "MASKING_LABOR"
  | "UNMASKING_LABOR"
  | "OTHER";

export interface PhysicalRouteOperation {
  routeIndex: number;
  seq: number;
  occurrence: number;
  operationCode: string;
  standardOperation?: string | null;
  mainOperation?: string | null;
  isPlanningOperation: boolean;
  isStScopeOnly?: boolean;
  isIntermediate?: boolean;
}

export interface PlanningOperationState {
  planningJobOperationId: number;
  routeIndex: number | null;
  mainOperation: string;
  sourceOperationCode?: string | null;
  planningOrder?: number | null;
  occurrence?: number | null;
  coverageState: PlanningCoverageState;
  batchId?: number | null;
  batchNo?: string | null;
  scheduleId?: number | null;
  resourceType?: ResourceType | null;
  resourceCode?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
}

export interface JobPhysicalPositionInput {
  jobNum: string;
  lastOperation?: string | null;
  lastLaborOp?: string | null;
  nextOperation?: string | null;
  physicalRoute: PhysicalRouteOperation[];
  planningOperations: PlanningOperationState[];
}

export interface JobContinuationState {
  jobNum: string;
  finalGateState: FinalGateState;
  finalGateCode: string | null;
  finalGateOccurrence: number | null;
  finalGateRouteIndex: number | null;
  physicalAnchorIndex: number | null;
  lastActualDoneIndex: number | null;
  lastCoveredPlanningIndex: number | null;
  remainingPlanningOperations: PlanningOperationState[];
  remainingPhysicalOperations: PhysicalRouteOperation[];
  existingScheduledOperations: PlanningOperationState[];
  existingUnscheduledOperations: PlanningOperationState[];
  hasPlanningGap: boolean;
  warnings: string[];
  optimizerAction: OptimizerAction;
}

export interface JobSnapshot {
  jobNum: string;
  part?: string | null;
  revision?: string | null;
  qty: number;
  surfaceDm2: number;
  program?: string | null;
  category?: string | null;
  routeSignature?: string | null;
  lastOperation?: string | null;
  lastLaborOp?: string | null;
  nextOperation?: string | null;
  physicalRoute: PhysicalRouteOperation[];
  planningOperations: PlanningOperationState[];
  continuation: JobContinuationState;
}

export interface ExistingBatchSnapshot {
  batchId: number;
  batchNo: string;
  mainOperation: string;
  recipeId?: number | null;
  recipeNo?: string | null;
  recipeName?: string | null;
  batchKey?: string | null;
  qty: number;
  surfaceDm2: number;
  processMinutes?: number | null;
  jobNums: string[];
  isScheduled: boolean;
}

export interface TimelineItem {
  id: string;
  sourceType: TimelineSourceType;
  state: TimelineState;
  jobNums: string[];
  batchId?: number | null;
  batchNo?: string | null;
  proposedBatchId?: number | null;
  mainOperation?: string | null;
  operationCode?: string | null;
  recipeNo?: string | null;
  recipeName?: string | null;
  resourceType: ResourceType;
  resourceCode: string;
  phase: TimelinePhase;
  start: string;
  end: string;
  durationMinutes: number;
  qty?: number | null;
  surfaceDm2?: number | null;
  dependencyIds?: string[];
  conflictCode?: string | null;
  conflictDetail?: string | null;
}

export interface UnscheduledPlacementCandidate {
  batchId: number;
  batchNo: string;
  mainOperation: string;
  jobNums: string[];
  resourceType: ResourceType;
  resourceCode: string;
  start: string;
  end: string;
  phaseItems?: TimelineItem[];
}

export interface ResourceReservation {
  id: string;
  source: "EXISTING" | "OUTAGE" | "PROPOSED";
  resourceType: ResourceType;
  resourceCode: string;
  start: string;
  end: string;
  units?: number;
  batchId?: number | null;
  jobNums: string[];
  phase?: TimelinePhase | null;
}

export interface ProductionStateSnapshot {
  snapshotId: string;
  capturedAt: string;
  jobs: JobSnapshot[];
  existingBatches: ExistingBatchSnapshot[];
  existingSchedules: TimelineItem[];
  unscheduledBatches: ExistingBatchSnapshot[];
  timeline: TimelineItem[];
  resourceReservations: ResourceReservation[];
  summary: {
    unfinishedJobs: number;
    existingBatches: number;
    existingScheduled: number;
    existingUnscheduled: number;
    doneOperations: number;
    inProgressOperations: number;
    plannedFutureOperations: number;
    remainingRouteOperations: number;
  };
}

export type OutputSource =
  | "ACTUAL_FINAL"
  | "EXISTING_SCHEDULE"
  | "EXISTING_UNSCHEDULED"
  | "NEW_PROPOSED";

export type OutputStatus =
  | "COUNTED"
  | "LATE"
  | "TIME_UNKNOWN"
  | "BLOCKED"
  | "NOT_REACHED";

export interface OutputLedgerLine {
  outputKey: string;
  jobNum: string;
  part?: string | null;
  revision?: string | null;
  surfaceDm2: number;
  finalGateCode: string;
  finalGateOccurrence: number;
  finalReadyAt: string | null;
  source: OutputSource;
  status: OutputStatus;
  batchIds: number[];
  proposedBatchIds: number[];
  warnings?: string[];
}

export interface WhatIfOutputSummary {
  targetDm2: number;
  alreadyReachedFinalDm2: number;
  existingScheduledForecastDm2: number;
  existingUnscheduledForecastDm2: number;
  existingPlanForecastDm2: number;
  proposedAdditionalDm2: number;
  totalForecastDm2: number;
  gapDm2: number;
  countedJobs: number;
  lateJobs: number;
  blockedJobs: number;
  unknownFinalTimeJobs: number;
  result: "CONFIRMED" | "SHORT" | "BLOCKED";
}

export interface FinalProjectionInput {
  job: JobSnapshot;
  finalReadyAt: string | null;
  cutoff: string;
  source: OutputSource;
  batchIds?: number[];
  proposedBatchIds?: number[];
  blocked?: boolean;
  warnings?: string[];
}

export interface CombinedTimelineModel {
  horizonStart: string;
  horizonEnd: string;
  items: TimelineItem[];
  reservations: ResourceReservation[];
  lanes: Array<{
    resourceType: ResourceType;
    resourceCode: string;
    label: string;
    order: number;
  }>;
  outputLedger: OutputLedgerLine[];
  outputSummary: WhatIfOutputSummary;
}
