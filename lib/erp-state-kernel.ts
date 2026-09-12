import {
  analyzeRouteWithEvidence,
  type RouteAnalysis,
  type RouteAnalysisOptions,
  type RouteOperationForAnalysis,
  type RoutePositionEvidence,
} from "@/lib/route-analysis";

export type ErpFinalGateState = "BEFORE_FINAL" | "REACHED_FINAL" | "AFTER_FINAL" | "UNKNOWN";

export type ErpStateKernelInput = {
  jobNum: string;
  operations: RouteOperationForAnalysis[];
  allOperation?: string | null;
  evidence: RoutePositionEvidence;
  finalGateCodes?: string[];
  routeOptions?: RouteAnalysisOptions;
};

export type ErpStateReason = {
  code: string;
  severity: "INFO" | "WARNING" | "BLOCKING";
  message: string;
};

export type ErpStateKernelResult = {
  jobNum: string;
  route: RouteAnalysis;
  finalGateState: ErpFinalGateState;
  finalGateCode: string | null;
  finalGatePosition: number | null;
  finalGateOccurrence: number | null;
  remainingToFinal: RouteOperationForAnalysis[];
  reasons: ErpStateReason[];
};

const key = (value?: string | null) => String(value ?? "").trim().toUpperCase();

function occurrence(ops: RouteOperationForAnalysis[], index: number) {
  const code = key(ops[index]?.code);
  let n = 0;
  for (let i = 0; i <= index; i += 1) if (key(ops[i]?.code) === code) n += 1;
  return n || null;
}

export function resolveErpState(input: ErpStateKernelInput): ErpStateKernelResult {
  const gates = (input.finalGateCodes?.length ? input.finalGateCodes : ["FINSST", "CFINM-VN"]).map(key);
  const ops = [...input.operations].filter((x) => x?.code).sort((a, b) => a.position - b.position);
  const route = analyzeRouteWithEvidence(ops, input.evidence, input.allOperation, input.routeOptions);
  const currentIndex = route.currentPosition == null ? -1 : ops.findIndex((x) => x.position === route.currentPosition);
  const reasons: ErpStateReason[] = route.anchorWarnings.map((code) => ({
    code,
    severity: code.includes("FALLBACK") ? "WARNING" : "INFO",
    message: code.replaceAll("_", " "),
  }));

  const nextKey = key(input.evidence.nextOperation);
  const lastKey = key(input.evidence.lastOperation);
  const gateIndexes = ops.map((op, index) => ({ op, index })).filter(({ op }) => gates.includes(key(op.code)));
  if (!gateIndexes.length) {
    reasons.push({ code: "FINAL_GATE_UNKNOWN", severity: "BLOCKING", message: "No configured Final Gate exists in the physical route." });
    return { jobNum: input.jobNum, route, finalGateState: "UNKNOWN", finalGateCode: null, finalGatePosition: null, finalGateOccurrence: null, remainingToFinal: route.remainingRoute, reasons };
  }

  if (gates.includes(nextKey)) {
    const picked = gateIndexes.find(({ index }) => currentIndex < 0 || index >= currentIndex) ?? gateIndexes[gateIndexes.length - 1];
    return {
      jobNum: input.jobNum,
      route,
      finalGateState: "REACHED_FINAL",
      finalGateCode: picked.op.code,
      finalGatePosition: picked.op.position,
      finalGateOccurrence: occurrence(ops, picked.index),
      remainingToFinal: [],
      reasons,
    };
  }

  if (gates.includes(lastKey)) {
    const picked = [...gateIndexes].reverse().find(({ op }) => key(op.code) === lastKey) ?? gateIndexes[gateIndexes.length - 1];
    return {
      jobNum: input.jobNum,
      route,
      finalGateState: "AFTER_FINAL",
      finalGateCode: picked.op.code,
      finalGatePosition: picked.op.position,
      finalGateOccurrence: occurrence(ops, picked.index),
      remainingToFinal: [],
      reasons,
    };
  }

  const nextGate = gateIndexes.find(({ index }) => currentIndex < 0 || index >= currentIndex);
  if (!nextGate) {
    return {
      jobNum: input.jobNum,
      route,
      finalGateState: "AFTER_FINAL",
      finalGateCode: gateIndexes[gateIndexes.length - 1].op.code,
      finalGatePosition: gateIndexes[gateIndexes.length - 1].op.position,
      finalGateOccurrence: occurrence(ops, gateIndexes[gateIndexes.length - 1].index),
      remainingToFinal: [],
      reasons,
    };
  }

  const from = Math.max(0, currentIndex);
  return {
    jobNum: input.jobNum,
    route,
    finalGateState: "BEFORE_FINAL",
    finalGateCode: nextGate.op.code,
    finalGatePosition: nextGate.op.position,
    finalGateOccurrence: occurrence(ops, nextGate.index),
    remainingToFinal: ops.slice(from, nextGate.index + 1),
    reasons,
  };
}
