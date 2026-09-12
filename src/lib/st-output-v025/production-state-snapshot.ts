import { resolveJobContinuation } from "./final-gate-resolver";
import {
  ExistingBatchSnapshot,
  JobSnapshot,
  PhysicalRouteOperation,
  PlanningOperationState,
  ProductionStateSnapshot,
  ResourceReservation,
  TimelineItem,
} from "./types";

export interface SnapshotJobInput {
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
}

export interface ProductionStateSnapshotInput {
  snapshotId?: string;
  capturedAt?: string;
  jobs: SnapshotJobInput[];
  batches: ExistingBatchSnapshot[];
  existingTimeline: TimelineItem[];
  finalGateCodes?: string[];
}

function createSnapshotId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `PSS-${stamp}`;
}

function toReservation(item: TimelineItem): ResourceReservation | null {
  if (
    item.state !== "DONE" &&
    item.state !== "IN_PROGRESS" &&
    item.state !== "EXISTING_SCHEDULED"
  ) {
    return null;
  }

  // Chemical PROCESS gets its own concurrency reservation. Flybar occupancy is
  // supplied as NORMAL/phase reservations by the schedule adapter or timeline normalizer.
  return {
    id: `RES:${item.id}`,
    source: "EXISTING",
    resourceType: item.resourceType,
    resourceCode: item.resourceCode,
    start: item.start,
    end: item.end,
    units: 1,
    batchId: item.batchId,
    jobNums: item.jobNums,
    phase: item.phase,
  };
}

function hasAnyPlanningCommitment(job: SnapshotJobInput) {
  return job.planningOperations.some((op) =>
    [
      "DONE",
      "IN_PROGRESS",
      "PLANNED_SCHEDULED",
      "PLANNED_UNSCHEDULED",
    ].includes(op.coverageState)
  );
}

export function buildProductionStateSnapshot(
  input: ProductionStateSnapshotInput
): ProductionStateSnapshot {
  const capturedAt = input.capturedAt || new Date().toISOString();
  const finalGateCodes = input.finalGateCodes;

  const resolvedJobs: JobSnapshot[] = input.jobs
    .filter(hasAnyPlanningCommitment)
    .map((job) => {
      const continuation = resolveJobContinuation(
        {
          jobNum: job.jobNum,
          lastOperation: job.lastOperation,
          lastLaborOp: job.lastLaborOp,
          nextOperation: job.nextOperation,
          physicalRoute: job.physicalRoute,
          planningOperations: job.planningOperations,
        },
        finalGateCodes
      );

      return {
        ...job,
        continuation,
      };
    })
    // Keep all planned jobs that have not conclusively passed Final Inspection.
    // REACHED_FINAL is retained in the snapshot for output accounting, AFTER_FINAL is not WIP.
    .filter((job) => job.continuation.finalGateState !== "AFTER_FINAL");

  const activeJobSet = new Set(resolvedJobs.map((x) => x.jobNum));

  const existingBatches = input.batches.filter((batch) =>
    batch.jobNums.some((jobNum) => activeJobSet.has(jobNum))
  );
  const existingSchedules = input.existingTimeline.filter((item) =>
    item.jobNums.length === 0 || item.jobNums.some((jobNum) => activeJobSet.has(jobNum))
  );
  const unscheduledBatches = existingBatches.filter((x) => !x.isScheduled);

  const resourceReservations = existingSchedules
    .map(toReservation)
    .filter((x): x is ResourceReservation => Boolean(x));

  const planningOps = resolvedJobs.flatMap((x) => x.planningOperations);

  return {
    snapshotId: input.snapshotId || createSnapshotId(new Date(capturedAt)),
    capturedAt,
    jobs: resolvedJobs,
    existingBatches,
    existingSchedules,
    unscheduledBatches,
    timeline: existingSchedules,
    resourceReservations,
    summary: {
      unfinishedJobs: resolvedJobs.filter(
        (x) => x.continuation.finalGateState === "BEFORE_FINAL"
      ).length,
      existingBatches: existingBatches.length,
      existingScheduled: existingBatches.filter((x) => x.isScheduled).length,
      existingUnscheduled: unscheduledBatches.length,
      doneOperations: planningOps.filter((x) => x.coverageState === "DONE").length,
      inProgressOperations: planningOps.filter(
        (x) => x.coverageState === "IN_PROGRESS"
      ).length,
      plannedFutureOperations: planningOps.filter((x) =>
        ["PLANNED_SCHEDULED", "PLANNED_UNSCHEDULED"].includes(x.coverageState)
      ).length,
      remainingRouteOperations: resolvedJobs.reduce(
        (total, job) => total + job.continuation.remainingPlanningOperations.length,
        0
      ),
    },
  };
}
