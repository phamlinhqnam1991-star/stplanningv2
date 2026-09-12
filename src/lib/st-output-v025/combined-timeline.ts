import {
  CombinedTimelineModel,
  OutputLedgerLine,
  ResourceReservation,
  ResourceType,
  TimelineItem,
  TimelinePhase,
  TimelineState,
  TimelineSourceType,
  WhatIfOutputSummary,
} from "./types";

export interface ChemicalPhaseInput {
  batchId: number;
  batchNo: string;
  jobNums: string[];
  mainOperation: string;
  recipeNo?: string | null;
  recipeName?: string | null;
  flybarCode: string;
  state: TimelineState;
  sourceType: TimelineSourceType;
  loading?: { start: string; end: string } | null;
  process?: { start: string; end: string } | null;
  ndt?: { start: string; end: string } | null;
  unloading?: { start: string; end: string } | null;
  qty?: number | null;
  surfaceDm2?: number | null;
}

export interface BuildCombinedTimelineInput {
  initialHorizonStart: string;
  initialHorizonEnd: string;
  existingItems: TimelineItem[];
  proposedItems?: TimelineItem[];
  outageItems?: TimelineItem[];
  outputLedger: OutputLedgerLine[];
  outputSummary: WhatIfOutputSummary;
  laneLabels?: Partial<Record<string, string>>;
}

const phaseOrder: Record<TimelinePhase, number> = {
  LOADING: 10,
  PROCESS: 20,
  NDT: 30,
  UNLOADING: 40,
  MASKING: 50,
  UNMASKING: 60,
  NORMAL: 70,
  FINAL_GATE: 80,
};

function minutes(start: string, end: string) {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 60000);
}

function phaseItem(
  input: ChemicalPhaseInput,
  phase: TimelinePhase,
  range: { start: string; end: string }
): TimelineItem {
  return {
    id: `CHEM:${input.batchId}:${phase}`,
    sourceType: input.sourceType,
    state: input.state,
    jobNums: input.jobNums,
    batchId: input.batchId,
    batchNo: input.batchNo,
    mainOperation: input.mainOperation,
    recipeNo: input.recipeNo,
    recipeName: input.recipeName,
    resourceType: "FLYBAR",
    resourceCode: input.flybarCode,
    phase,
    start: range.start,
    end: range.end,
    durationMinutes: minutes(range.start, range.end),
    qty: input.qty,
    surfaceDm2: input.surfaceDm2,
  };
}

export function expandChemicalSchedule(input: ChemicalPhaseInput) {
  const items: TimelineItem[] = [];
  if (input.loading) items.push(phaseItem(input, "LOADING", input.loading));
  if (input.process) items.push(phaseItem(input, "PROCESS", input.process));
  if (input.ndt) items.push(phaseItem(input, "NDT", input.ndt));
  if (input.unloading) items.push(phaseItem(input, "UNLOADING", input.unloading));

  const starts = items.map((x) => Date.parse(x.start)).filter(Number.isFinite);
  const ends = items.map((x) => Date.parse(x.end)).filter(Number.isFinite);
  const reservations: ResourceReservation[] = [];

  if (starts.length && ends.length) {
    const start = new Date(Math.min(...starts)).toISOString();
    const end = new Date(Math.max(...ends)).toISOString();
    reservations.push({
      id: `RES:FLYBAR:${input.batchId}`,
      source: input.sourceType === "EXISTING" ? "EXISTING" : "PROPOSED",
      resourceType: "FLYBAR",
      resourceCode: input.flybarCode,
      start,
      end,
      units: 1,
      batchId: input.batchId,
      jobNums: input.jobNums,
      phase: "NORMAL",
    });
  }

  if (input.process) {
    reservations.push({
      id: `RES:CHEM_PROCESS:${input.batchId}`,
      source: input.sourceType === "EXISTING" ? "EXISTING" : "PROPOSED",
      resourceType: "CHEM_PROCESS",
      resourceCode: "CHEM_PROCESS",
      start: input.process.start,
      end: input.process.end,
      units: 1,
      batchId: input.batchId,
      jobNums: input.jobNums,
      phase: "PROCESS",
    });
  }

  return { items, reservations };
}

function laneOrder(type: ResourceType, code: string) {
  const typeBase: Record<ResourceType, number> = {
    CABIN: 100,
    FLYBAR: 200,
    CHEM_PROCESS: 300,
    MASKING_LABOR: 400,
    UNMASKING_LABOR: 500,
    OTHER: 600,
  };
  const numeric = Number(String(code).replace(/\D/g, ""));
  return typeBase[type] + (Number.isFinite(numeric) ? numeric : 99);
}

function stateOrder(state: TimelineState) {
  const order: Record<TimelineState, number> = {
    DONE: 10,
    IN_PROGRESS: 20,
    EXISTING_SCHEDULED: 30,
    EXISTING_UNSCHEDULED: 40,
    PROPOSED_EXISTING_BATCH: 50,
    PROPOSED_NEW_BATCH: 60,
    OUTAGE: 70,
    FINAL_GATE: 80,
    CONFLICT: 90,
  };
  return order[state];
}

export function buildCombinedTimelineModel(
  input: BuildCombinedTimelineInput
): CombinedTimelineModel {
  const items = [
    ...input.existingItems,
    ...(input.proposedItems || []),
    ...(input.outageItems || []),
  ].sort((a, b) => {
    const lane = laneOrder(a.resourceType, a.resourceCode) - laneOrder(b.resourceType, b.resourceCode);
    if (lane !== 0) return lane;
    const time = Date.parse(a.start) - Date.parse(b.start);
    if (time !== 0) return time;
    const phase = phaseOrder[a.phase] - phaseOrder[b.phase];
    if (phase !== 0) return phase;
    return stateOrder(a.state) - stateOrder(b.state);
  });

  const allStarts = [Date.parse(input.initialHorizonStart), ...items.map((x) => Date.parse(x.start))]
    .filter(Number.isFinite);
  const allEnds = [Date.parse(input.initialHorizonEnd), ...items.map((x) => Date.parse(x.end))]
    .filter(Number.isFinite);

  const horizonStart = new Date(Math.min(...allStarts)).toISOString();
  const horizonEnd = new Date(Math.max(...allEnds)).toISOString();

  const laneMap = new Map<string, CombinedTimelineModel["lanes"][number]>();
  for (const item of items) {
    const key = `${item.resourceType}|${item.resourceCode}`;
    if (!laneMap.has(key)) {
      laneMap.set(key, {
        resourceType: item.resourceType,
        resourceCode: item.resourceCode,
        label:
          input.laneLabels?.[key] ||
          input.laneLabels?.[item.resourceCode] ||
          item.resourceCode,
        order: laneOrder(item.resourceType, item.resourceCode),
      });
    }
  }

  const reservations: ResourceReservation[] = items
    .filter((x) => x.state !== "FINAL_GATE" && x.state !== "EXISTING_UNSCHEDULED")
    .map((x) => ({
      id: `RES:${x.id}`,
      source:
        x.state === "OUTAGE"
          ? "OUTAGE"
          : x.sourceType === "EXISTING"
            ? "EXISTING"
            : "PROPOSED",
      resourceType: x.resourceType,
      resourceCode: x.resourceCode,
      start: x.start,
      end: x.end,
      units: 1,
      batchId: x.batchId,
      jobNums: x.jobNums,
      phase: x.phase,
    }));

  return {
    horizonStart,
    horizonEnd,
    items,
    reservations,
    lanes: [...laneMap.values()].sort((a, b) => a.order - b.order),
    outputLedger: input.outputLedger,
    outputSummary: input.outputSummary,
  };
}
