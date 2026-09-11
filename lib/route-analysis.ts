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

export type RouteAnalysis = {
  routeMatched: boolean;
  currentPosition: number | null;
  currentSequence: number | null;
  currentOperation: string | null;
  positionSource: "NEXT_OPERATION" | "FIRST_INCOMPLETE" | "COMPLETE" | "NO_ROUTE";
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
    const code = token.trim();
    if (!code) continue;
    const key = norm(code);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(code);
  }
  return out;
}

export function analyzeRoute(
  operations: RouteOperationForAnalysis[] | null | undefined,
  nextOperation: string | null | undefined,
  allOperation: string | null | undefined,
  options: RouteAnalysisOptions = {}
): RouteAnalysis {
  const ops = [...(operations || [])]
    .filter((op) => Boolean(op && op.code))
    .sort((a, b) => a.position - b.position);

  const completedCount = ops.filter((op) => op.complete === true).length;
  const preferNextOperation = options.preferNextOperation !== false;
  const fallbackFirstIncomplete = options.fallbackFirstIncomplete !== false;
  const includeCurrentInRemaining = options.includeCurrentInRemaining !== false;
  const stScopeCodes = parseStScope(allOperation);
  const stScopeSet = new Set(stScopeCodes.map(norm));

  if (!ops.length) {
    return {
      routeMatched: false,
      currentPosition: null,
      currentSequence: null,
      currentOperation: null,
      positionSource: "NO_ROUTE",
      completedCount: 0,
      remainingCount: 0,
      remainingRoute: [],
      stScopeAvailable: stScopeCodes.length > 0,
      stScopeCodes,
      remainingStCount: 0,
      remainingStRoute: [],
      nextStOperation: null,
      nextStSequence: null,
    };
  }

  const nextKey = norm(nextOperation);
  let currentIndex = -1;
  let positionSource: RouteAnalysis["positionSource"] = "COMPLETE";

  if (nextKey && preferNextOperation) {
    currentIndex = ops.findIndex((op) => norm(op.code) === nextKey && op.complete !== true);
    if (currentIndex < 0) currentIndex = ops.findIndex((op) => norm(op.code) === nextKey);
    if (currentIndex >= 0) positionSource = "NEXT_OPERATION";
  }

  if (currentIndex < 0 && fallbackFirstIncomplete) {
    currentIndex = ops.findIndex((op) => op.complete !== true);
    if (currentIndex >= 0) positionSource = "FIRST_INCOMPLETE";
  }

  if (currentIndex < 0) {
    return {
      routeMatched: nextKey ? false : true,
      currentPosition: null,
      currentSequence: null,
      currentOperation: null,
      positionSource: "COMPLETE",
      completedCount,
      remainingCount: 0,
      remainingRoute: [],
      stScopeAvailable: stScopeCodes.length > 0,
      stScopeCodes,
      remainingStCount: 0,
      remainingStRoute: [],
      nextStOperation: null,
      nextStSequence: null,
    };
  }

  const current = ops[currentIndex];
  const remainingRoute = ops.slice(includeCurrentInRemaining ? currentIndex : currentIndex + 1);
  const remainingStRoute = stScopeSet.size
    ? remainingRoute.filter((op) => stScopeSet.has(norm(op.code)))
    : [];
  const nextSt = remainingStRoute[0] || null;

  return {
    routeMatched: nextKey ? positionSource === "NEXT_OPERATION" : true,
    currentPosition: current.position,
    currentSequence: current.sequence,
    currentOperation: current.code,
    positionSource,
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
