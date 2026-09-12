import {
  FinalProjectionInput,
  OutputLedgerLine,
  OutputSource,
  OutputStatus,
  WhatIfOutputSummary,
} from "./types";

const sourcePriority: Record<OutputSource, number> = {
  ACTUAL_FINAL: 4,
  EXISTING_SCHEDULE: 3,
  EXISTING_UNSCHEDULED: 2,
  NEW_PROPOSED: 1,
};

const statusPriority: Record<OutputStatus, number> = {
  COUNTED: 5,
  TIME_UNKNOWN: 4,
  LATE: 3,
  BLOCKED: 2,
  NOT_REACHED: 1,
};

function ms(value?: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildOutputKey(input: FinalProjectionInput) {
  const { job } = input;
  const gate = job.continuation.finalGateCode || "UNKNOWN_FINAL";
  const occurrence = job.continuation.finalGateOccurrence || 1;
  const routeSignature = job.routeSignature || "NO_ROUTE_SIGNATURE";
  return `${job.jobNum}|${routeSignature}|${gate}#${occurrence}`;
}

function resolveOutputStatus(input: FinalProjectionInput): OutputStatus {
  if (input.blocked || input.job.continuation.optimizerAction === "BLOCKED") {
    return "BLOCKED";
  }

  if (
    input.job.continuation.finalGateState === "UNKNOWN" ||
    !input.job.continuation.finalGateCode
  ) {
    return "NOT_REACHED";
  }

  if (!input.finalReadyAt) {
    return input.job.continuation.finalGateState === "REACHED_FINAL" ||
      input.job.continuation.finalGateState === "AFTER_FINAL"
      ? "TIME_UNKNOWN"
      : "NOT_REACHED";
  }

  const ready = ms(input.finalReadyAt);
  const cutoff = ms(input.cutoff);
  if (ready == null || cutoff == null) return "TIME_UNKNOWN";
  return ready <= cutoff ? "COUNTED" : "LATE";
}

export function toOutputLedgerLine(input: FinalProjectionInput): OutputLedgerLine {
  const gateCode = input.job.continuation.finalGateCode || "UNKNOWN_FINAL";
  const gateOccurrence = input.job.continuation.finalGateOccurrence || 1;
  return {
    outputKey: buildOutputKey(input),
    jobNum: input.job.jobNum,
    part: input.job.part,
    revision: input.job.revision,
    surfaceDm2: Math.max(0, Number(input.job.surfaceDm2 || 0)),
    finalGateCode: gateCode,
    finalGateOccurrence: gateOccurrence,
    finalReadyAt: input.finalReadyAt,
    source: input.source,
    status: resolveOutputStatus(input),
    batchIds: [...new Set(input.batchIds || [])],
    proposedBatchIds: [...new Set(input.proposedBatchIds || [])],
    warnings: [...new Set(input.warnings || [])],
  };
}

function pickCanonical(a: OutputLedgerLine, b: OutputLedgerLine) {
  const statusCompare = statusPriority[b.status] - statusPriority[a.status];
  if (statusCompare !== 0) return statusCompare > 0 ? b : a;

  const sourceCompare = sourcePriority[b.source] - sourcePriority[a.source];
  if (sourceCompare !== 0) return sourceCompare > 0 ? b : a;

  const aTime = ms(a.finalReadyAt);
  const bTime = ms(b.finalReadyAt);
  if (aTime != null && bTime != null) return bTime < aTime ? b : a;
  if (bTime != null && aTime == null) return b;
  return a;
}

export function dedupeOutputLedger(lines: OutputLedgerLine[]) {
  const map = new Map<string, OutputLedgerLine>();

  for (const line of lines) {
    const existing = map.get(line.outputKey);
    if (!existing) {
      map.set(line.outputKey, line);
      continue;
    }

    const canonical = pickCanonical(existing, line);
    map.set(line.outputKey, {
      ...canonical,
      batchIds: [...new Set([...existing.batchIds, ...line.batchIds])],
      proposedBatchIds: [
        ...new Set([...existing.proposedBatchIds, ...line.proposedBatchIds]),
      ],
      warnings: [...new Set([...(existing.warnings || []), ...(line.warnings || [])])],
    });
  }

  return [...map.values()];
}

export function summarizeOutputLedger(
  rawLines: OutputLedgerLine[],
  targetDm2: number
): WhatIfOutputSummary {
  const lines = dedupeOutputLedger(rawLines);
  const counted = lines.filter((x) => x.status === "COUNTED");

  const sum = (rows: OutputLedgerLine[]) =>
    rows.reduce((total, row) => total + Number(row.surfaceDm2 || 0), 0);

  const alreadyReachedFinalDm2 = sum(
    counted.filter((x) => x.source === "ACTUAL_FINAL")
  );
  const existingScheduledForecastDm2 = sum(
    counted.filter((x) => x.source === "EXISTING_SCHEDULE")
  );
  const existingUnscheduledForecastDm2 = sum(
    counted.filter((x) => x.source === "EXISTING_UNSCHEDULED")
  );
  const existingPlanForecastDm2 =
    existingScheduledForecastDm2 + existingUnscheduledForecastDm2;
  const proposedAdditionalDm2 = sum(
    counted.filter((x) => x.source === "NEW_PROPOSED")
  );
  const totalForecastDm2 =
    alreadyReachedFinalDm2 + existingPlanForecastDm2 + proposedAdditionalDm2;
  const normalizedTarget = Math.max(0, Number(targetDm2 || 0));
  const gapDm2 = totalForecastDm2 - normalizedTarget;

  const blockedJobs = lines.filter((x) => x.status === "BLOCKED").length;
  const result: WhatIfOutputSummary["result"] =
    totalForecastDm2 >= normalizedTarget
      ? "CONFIRMED"
      : blockedJobs > 0
        ? "BLOCKED"
        : "SHORT";

  return {
    targetDm2: normalizedTarget,
    alreadyReachedFinalDm2,
    existingScheduledForecastDm2,
    existingUnscheduledForecastDm2,
    existingPlanForecastDm2,
    proposedAdditionalDm2,
    totalForecastDm2,
    gapDm2,
    countedJobs: counted.length,
    lateJobs: lines.filter((x) => x.status === "LATE").length,
    blockedJobs,
    unknownFinalTimeJobs: lines.filter((x) => x.status === "TIME_UNKNOWN").length,
    result,
  };
}
