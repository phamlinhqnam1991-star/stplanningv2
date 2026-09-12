import {
  JobContinuationState,
  JobPhysicalPositionInput,
  PhysicalRouteOperation,
  PlanningCoverageState,
  PlanningOperationState,
} from "./types";

export const DEFAULT_FINAL_GATE_CODES = ["FINSST", "CFINM-VN"] as const;

const COVERED = new Set<PlanningCoverageState>([
  "DONE",
  "IN_PROGRESS",
  "PLANNED_SCHEDULED",
  "PLANNED_UNSCHEDULED",
]);

const normalize = (value?: string | null) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

function sortedRoute(route: PhysicalRouteOperation[]) {
  return [...route].sort((a, b) => a.routeIndex - b.routeIndex || a.seq - b.seq);
}

function findPairAnchor(
  route: PhysicalRouteOperation[],
  previousCode?: string | null,
  nextCode?: string | null
): number | null {
  const prev = normalize(previousCode);
  const next = normalize(nextCode);
  if (!prev || !next) return null;

  let best: number | null = null;
  for (let i = 0; i < route.length - 1; i += 1) {
    if (
      normalize(route[i].operationCode) === prev &&
      normalize(route[i + 1].operationCode) === next
    ) {
      // Physical anchor = current position after previous op, before next op.
      best = route[i].routeIndex;
    }
  }
  return best;
}

function findNextOperationAnchor(
  route: PhysicalRouteOperation[],
  nextCode?: string | null
): number | null {
  const next = normalize(nextCode);
  if (!next) return null;
  const matches = route.filter((x) => normalize(x.operationCode) === next);
  if (!matches.length) return null;
  // Without a pair there is no perfect occurrence evidence. Use the last occurrence
  // because rework routes normally advance to a later repeated suffix.
  return matches[matches.length - 1].routeIndex - 1;
}

function findPlanningAnchor(planning: PlanningOperationState[]): number | null {
  const covered = planning
    .filter((x) => COVERED.has(x.coverageState) && x.routeIndex != null)
    .sort((a, b) => Number(a.routeIndex) - Number(b.routeIndex));
  return covered.length ? Number(covered[covered.length - 1].routeIndex) : null;
}

function resolvePhysicalAnchor(input: JobPhysicalPositionInput): number | null {
  const route = sortedRoute(input.physicalRoute);
  return (
    findPairAnchor(route, input.lastOperation, input.nextOperation) ??
    findPairAnchor(route, input.lastLaborOp, input.nextOperation) ??
    findNextOperationAnchor(route, input.nextOperation) ??
    findPlanningAnchor(input.planningOperations)
  );
}

function isFinalGate(code: string, finalGateCodes: string[]) {
  return finalGateCodes.includes(normalize(code));
}

function gateOccurrence(route: PhysicalRouteOperation[], gateIndex: number) {
  const gate = route.find((x) => x.routeIndex === gateIndex);
  if (!gate) return null;
  return gate.occurrence || 1;
}

function resolveGate(
  route: PhysicalRouteOperation[],
  physicalAnchorIndex: number | null,
  input: JobPhysicalPositionInput,
  finalGateCodes: string[]
) {
  const gates = route.filter((x) => isFinalGate(x.operationCode, finalGateCodes));
  if (!gates.length) {
    return {
      state: "UNKNOWN" as const,
      gate: null as PhysicalRouteOperation | null,
    };
  }

  const last = normalize(input.lastOperation);
  const next = normalize(input.nextOperation);

  if (finalGateCodes.includes(last)) {
    const matching = [...gates]
      .reverse()
      .find((x) => normalize(x.operationCode) === last);
    return {
      state: "AFTER_FINAL" as const,
      gate: matching ?? gates[gates.length - 1],
    };
  }

  if (finalGateCodes.includes(next)) {
    const afterAnchor = gates.find(
      (x) => physicalAnchorIndex == null || x.routeIndex > physicalAnchorIndex
    );
    const matching =
      afterAnchor && normalize(afterAnchor.operationCode) === next
        ? afterAnchor
        : gates.find(
            (x) =>
              normalize(x.operationCode) === next &&
              (physicalAnchorIndex == null || x.routeIndex > physicalAnchorIndex)
          );
    return {
      state: "REACHED_FINAL" as const,
      gate: matching ?? afterAnchor ?? gates[gates.length - 1],
    };
  }

  const nextGate = gates.find(
    (x) => physicalAnchorIndex == null || x.routeIndex > physicalAnchorIndex
  );
  if (nextGate) {
    return { state: "BEFORE_FINAL" as const, gate: nextGate };
  }

  return {
    state: "AFTER_FINAL" as const,
    gate: gates[gates.length - 1],
  };
}

function routeOrderOf(op: PlanningOperationState) {
  if (op.routeIndex != null) return Number(op.routeIndex);
  if (op.planningOrder != null) return 1_000_000 + Number(op.planningOrder);
  return 2_000_000 + op.planningJobOperationId;
}

export function resolveJobContinuation(
  input: JobPhysicalPositionInput,
  finalGateCodes: string[] = [...DEFAULT_FINAL_GATE_CODES]
): JobContinuationState {
  const normalizedGates = finalGateCodes.map(normalize).filter(Boolean);
  const route = sortedRoute(input.physicalRoute);
  const physicalAnchorIndex = resolvePhysicalAnchor(input);
  const gateResolution = resolveGate(
    route,
    physicalAnchorIndex,
    input,
    normalizedGates
  );
  const gate = gateResolution.gate;
  const gateIndex = gate?.routeIndex ?? null;

  const planningInCurrentSuffix = [...input.planningOperations]
    .filter((op) => {
      if (op.routeIndex == null) return true;
      if (physicalAnchorIndex != null && op.routeIndex <= physicalAnchorIndex) {
        return op.coverageState === "DONE" || op.coverageState === "IN_PROGRESS";
      }
      if (gateIndex != null && op.routeIndex >= gateIndex) return false;
      return true;
    })
    .sort((a, b) => routeOrderOf(a) - routeOrderOf(b));

  const coveredPlanning = planningInCurrentSuffix.filter((x) =>
    COVERED.has(x.coverageState)
  );
  const donePlanning = planningInCurrentSuffix.filter(
    (x) => x.coverageState === "DONE"
  );

  const lastActualDoneIndex = donePlanning.length
    ? routeOrderOf(donePlanning[donePlanning.length - 1])
    : null;
  const lastCoveredPlanningIndex = coveredPlanning.length
    ? routeOrderOf(coveredPlanning[coveredPlanning.length - 1])
    : null;

  let encounteredUncovered = false;
  let hasPlanningGap = false;
  for (const op of planningInCurrentSuffix) {
    const covered = COVERED.has(op.coverageState);
    if (!covered) encounteredUncovered = true;
    if (covered && encounteredUncovered) {
      hasPlanningGap = true;
      break;
    }
  }

  const remainingPlanningOperations = planningInCurrentSuffix.filter(
    (op) => !COVERED.has(op.coverageState)
  );

  const remainingPhysicalOperations = route.filter((op) => {
    if (physicalAnchorIndex != null && op.routeIndex <= physicalAnchorIndex) return false;
    if (gateIndex != null && op.routeIndex > gateIndex) return false;
    return true;
  });

  const existingScheduledOperations = planningInCurrentSuffix.filter(
    (x) => x.coverageState === "PLANNED_SCHEDULED"
  );
  const existingUnscheduledOperations = planningInCurrentSuffix.filter(
    (x) => x.coverageState === "PLANNED_UNSCHEDULED"
  );

  const warnings: string[] = [];
  if (gateResolution.state === "UNKNOWN") warnings.push("FINAL_GATE_UNKNOWN");
  if (physicalAnchorIndex == null) warnings.push("PHYSICAL_ANCHOR_UNKNOWN");
  if (hasPlanningGap) warnings.push("NON_CONTIGUOUS_EXISTING_PLAN");

  let optimizerAction: JobContinuationState["optimizerAction"];
  if (
    gateResolution.state === "REACHED_FINAL" ||
    gateResolution.state === "AFTER_FINAL"
  ) {
    optimizerAction = "FINAL_REACHED";
  } else if (gateResolution.state === "UNKNOWN") {
    optimizerAction = "REVIEW";
  } else if (hasPlanningGap) {
    optimizerAction = "BLOCKED";
  } else if (
    remainingPlanningOperations.length === 0 &&
    existingUnscheduledOperations.length > 0
  ) {
    optimizerAction = "SCHEDULE_EXISTING_ONLY";
  } else {
    optimizerAction = "CONTINUE";
  }

  return {
    jobNum: input.jobNum,
    finalGateState: gateResolution.state,
    finalGateCode: gate?.operationCode ?? null,
    finalGateOccurrence: gate ? gateOccurrence(route, gate.routeIndex) : null,
    finalGateRouteIndex: gateIndex,
    physicalAnchorIndex,
    lastActualDoneIndex,
    lastCoveredPlanningIndex,
    remainingPlanningOperations,
    remainingPhysicalOperations,
    existingScheduledOperations,
    existingUnscheduledOperations,
    hasPlanningGap,
    warnings,
    optimizerAction,
  };
}
