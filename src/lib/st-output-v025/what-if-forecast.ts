import {
  FinalProjectionInput,
  OutputLedgerLine,
  TimelineItem,
  WhatIfOutputSummary,
} from "./types";
import {
  dedupeOutputLedger,
  summarizeOutputLedger,
  toOutputLedgerLine,
} from "./output-ledger";

export interface BuildWhatIfForecastInput {
  targetDm2: number;
  cutoff: string;
  projections: Omit<FinalProjectionInput, "cutoff">[];
}

export interface BuildWhatIfForecastResult {
  ledger: OutputLedgerLine[];
  summary: WhatIfOutputSummary;
  finalGateTimelineItems: TimelineItem[];
}

export function buildWhatIfForecast(
  input: BuildWhatIfForecastInput
): BuildWhatIfForecastResult {
  const ledger = dedupeOutputLedger(
    input.projections.map((projection) =>
      toOutputLedgerLine({
        ...projection,
        cutoff: input.cutoff,
      })
    )
  );

  const summary = summarizeOutputLedger(ledger, input.targetDm2);

  const finalGateTimelineItems: TimelineItem[] = ledger
    .filter((line) => line.finalReadyAt)
    .map((line) => ({
      id: `FINAL:${line.outputKey}`,
      sourceType: line.source === "NEW_PROPOSED" ? "PROPOSED" : "EXISTING",
      state: "FINAL_GATE",
      jobNums: [line.jobNum],
      mainOperation: line.finalGateCode,
      operationCode: line.finalGateCode,
      resourceType: "OTHER",
      resourceCode: "FINAL_INSPECTION",
      phase: "FINAL_GATE",
      start: line.finalReadyAt!,
      end: line.finalReadyAt!,
      durationMinutes: 0,
      surfaceDm2: line.surfaceDm2,
      conflictCode:
        line.status === "LATE"
          ? "FINAL_AFTER_CUTOFF"
          : line.status === "BLOCKED"
            ? "FINAL_BLOCKED"
            : null,
    }));

  return { ledger, summary, finalGateTimelineItems };
}
