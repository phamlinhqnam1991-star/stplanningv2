export type RouteOperationForAnalysis = {
  position: number;
  code: string;
  sequence: number | null;
  complete: boolean | null;
  openNonconformance?: string | null;
  sourceText?: string;
};

export type RouteAnalysisOptions = {
  preferNextOperation?: boolean;
  fallbackFirstIncomplete?: boolean;
  includeCurrentInRemaining?: boolean;
};

export type RoutePositionEvidence = {
  nextOperation?: string | null;
  lastOperation?: string | null;
  lastLaborOp?: string | null;
  lastLaborSequence?: number | null;
};

export type RoutePositionSource =
  | "LAST_OPERATION_NEXT_PAIR"
  | "LAST_LABOR_NEXT_PAIR"
  | "LAST_LABOR_SEQUENCE"
  | "NEXT_OPERATION"
  | "FIRST_INCOMPLETE"
  | "COMPLETE"
  | "NO_ROUTE";

export type RouteAnalysis = {
  routeMatched: boolean;
  currentPosition: number | null;
  currentSequence: number | null;
  currentOperation: string | null;
  currentOccurrence: number | null;
  currentOccurrenceKey: string | null;
  positionSource: RoutePositionSource;
  anchorConfidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  anchorWarnings: string[];
  completedCount: number;
  remainingCount: number;
  remainingRoute: RouteOperationForAnalysis[];
  stScopeAvailable: boolean;
  stScopeCodes: string[];
  remainingStCount: number;
  remainingStRoute: RouteOperationForAnalysis[];
  nextStOperation: string | null;
  nextStSequence: number | null;
};

function norm(value: string | null | undefined): string {
  return (value || "").trim().toUpperCase();
}

export function parseStScope(allOperation: string | null | undefined): string[] {
  if (!allOperation?.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of allOperation.split("|")) {
    const raw = token.trim();
    if (!raw) continue;
    const bracketed = /^\[([^\]]+)\]/.exec(raw);
    const code = (bracketed?.[1] || raw.split("»", 1)[0] || "").trim();
    if (!code) continue;
    const key = norm(code);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(code);
  }
  return out;
}

function occurrenceAt(ops: RouteOperationForAnalysis[], index: number) {
  if (index < 0 || index >= ops.length) return { occurrence: null, key: null };
  const code = norm(ops[index].code);
  let occurrence = 0;
  for (let i = 0; i <= index; i += 1) if (norm(ops[i].code) === code) occurrence += 1;
  return { occurrence, key: `${ops[index].code}#${occurrence}` };
}

function pairIndex(ops: RouteOperationForAnalysis[], previous: string | null | undefined, next: string | null | undefined) {
  const prev = norm(previous);
  const nxt = norm(next);
  if (!prev || !nxt) return -1;
  const candidates: number[] = [];
  for (let i = 0; i < ops.length - 1; i += 1) {
    if (norm(ops[i].code) === prev && norm(ops[i + 1].code) === nxt) candidates.push(i + 1);
  }
  if (!candidates.length) return -1;
  const incomplete = candidates.find((i) => ops[i].complete !== true);
  return incomplete ?? candidates[candidates.length - 1];
}

function sequenceIndex(ops: RouteOperationForAnalysis[], lastLaborSequence: number | null | undefined, nextOperation: string | null | undefined) {
  if (lastLaborSequence == null || !Number.isFinite(Number(lastLaborSequence))) return -1;
  const next = norm(nextOperation);
  const candidates = ops
    .map((op, index) => ({ op, index }))
    .filter(({ op }) => op.sequence != null && Number(op.sequence) > Number(lastLaborSequence))
    .filter(({ op }) => !next || norm(op.code) === next);
  if (!candidates.length) return -1;
  return candidates[0].index;
}

export function analyzeRouteWithEvidence(
  operations: RouteOperationForAnalysis[] | null | undefined,
  evidence: RoutePositionEvidence,
  allOperation: string | null | undefined,
  options: RouteAnalysisOptions = {},
): RouteAnalysis {
  const ops = [...(operations || [])]
    .filter((op) => Boolean(op && op.code))
    .sort((a, b) => a.position - b.position);
  const completedCount = ops.filter((op) => op.complete === true).length;
  const fallbackFirstIncomplete = options.fallbackFirstIncomplete !== false;
  const includeCurrentInRemaining = options.includeCurrentInRemaining !== false;
  const stScopeCodes = parseStScope(allOperation);
  const stScopeSet = new Set(stScopeCodes.map(norm));
  const warnings: string[] = [];

  const empty = (positionSource: RoutePositionSource, routeMatched: boolean): RouteAnalysis => ({
    routeMatched,
    currentPosition: null,
    currentSequence: null,
    currentOperation: null,
    currentOccurrence: null,
    currentOccurrenceKey: null,
    positionSource,
    anchorConfidence: positionSource === "COMPLETE" ? "HIGH" : "NONE",
    anchorWarnings: warnings,
    completedCount,
    remainingCount: 0,
    remainingRoute: [],
    stScopeAvailable: stScopeCodes.length > 0,
    stScopeCodes,
    remainingStCount: 0,
    remainingStRoute: [],
    nextStOperation: null,
    nextStSequence: null,
  });

  if (!ops.length) return empty("NO_ROUTE", false);

  const nextKey = norm(evidence.nextOperation);
  let currentIndex = -1;
  let positionSource: RoutePositionSource = "COMPLETE";
  let confidence: RouteAnalysis["anchorConfidence"] = "NONE";

  currentIndex = pairIndex(ops, evidence.lastOperation, evidence.nextOperation);
  if (currentIndex >= 0) {
    positionSource = "LAST_OPERATION_NEXT_PAIR";
    confidence = "HIGH";
  }

  if (currentIndex < 0) {
    currentIndex = pairIndex(ops, evidence.lastLaborOp, evidence.nextOperation);
    if (currentIndex >= 0) {
      positionSource = "LAST_LABOR_NEXT_PAIR";
      confidence = "HIGH";
    }
  }

  if (currentIndex < 0) {
    currentIndex = sequenceIndex(ops, evidence.lastLaborSequence, evidence.nextOperation);
    if (currentIndex >= 0) {
      positionSource = "LAST_LABOR_SEQUENCE";
      confidence = "HIGH";
    }
  }

  if (currentIndex < 0 && nextKey && options.preferNextOperation !== false) {
    const matches = ops.map((op, index) => ({ op, index })).filter(({ op }) => norm(op.code) === nextKey);
    const incomplete = matches.filter(({ op }) => op.complete !== true);
    if (matches.length > 1) warnings.push("DUPLICATE_NEXT_OPERATION_OCCURRENCE");
    const selected = incomplete[0] ?? matches[matches.length - 1];
    if (selected) {
      currentIndex = selected.index;
      positionSource = "NEXT_OPERATION";
      confidence = matches.length === 1 ? "MEDIUM" : "LOW";
      if (matches.length > 1) warnings.push("OCCURRENCE_SELECTED_BY_COMPLETION_STATE");
    }
  }

  if (currentIndex < 0 && fallbackFirstIncomplete) {
    currentIndex = ops.findIndex((op) => op.complete !== true);
    if (currentIndex >= 0) {
      positionSource = "FIRST_INCOMPLETE";
      confidence = "LOW";
      warnings.push("PHYSICAL_ANCHOR_FALLBACK_FIRST_INCOMPLETE");
    }
  }

  if (currentIndex < 0) return empty("COMPLETE", !nextKey);

  const current = ops[currentIndex];
  const occurrence = occurrenceAt(ops, currentIndex);
  const remainingRoute = ops.slice(includeCurrentInRemaining ? currentIndex : currentIndex + 1);
  const remainingStRoute = stScopeSet.size ? remainingRoute.filter((op) => stScopeSet.has(norm(op.code))) : [];
  const nextSt = remainingStRoute[0] || null;
  const directMatch = nextKey ? norm(current.code) === nextKey : true;

  return {
    routeMatched: directMatch,
    currentPosition: current.position,
    currentSequence: current.sequence,
    currentOperation: current.code,
    currentOccurrence: occurrence.occurrence,
    currentOccurrenceKey: occurrence.key,
    positionSource,
    anchorConfidence: confidence,
    anchorWarnings: warnings,
    completedCount,
    remainingCount: remainingRoute.length,
    remainingRoute,
    stScopeAvailable: stScopeCodes.length > 0,
    stScopeCodes,
    remainingStCount: remainingStRoute.length,
    remainingStRoute,
    nextStOperation: nextSt?.code || null,
    nextStSequence: nextSt?.sequence ?? null,
  };
}

/** Backward-compatible entry point used by older callers. */
export function analyzeRoute(
  operations: RouteOperationForAnalysis[] | null | undefined,
  nextOperation: string | null | undefined,
  allOperation: string | null | undefined,
  options: RouteAnalysisOptions = {},
): RouteAnalysis {
  return analyzeRouteWithEvidence(operations, { nextOperation }, allOperation, options);
}
