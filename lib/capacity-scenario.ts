import { capacityResource, type CapacityModel, type CapacityResourceDefinition } from "@/lib/capacity-model";

export type CapacityScenarioOverride = {
  name?: string;
  disabledResourceInstances?: string[];
  resourceMaxConcurrent?: Record<string, number>;
  includeExistingSchedule?: boolean | null;
  chemicalProcessMaxConcurrent?: number | null;
  maskingOperators?: number | null;
  unmaskingOperators?: number | null;
};

export type CapacityScenarioSnapshot = {
  name: string;
  disabledResourceInstances: string[];
  resourceMaxConcurrent: Record<string, number>;
  includeExistingSchedule: boolean;
  chemicalProcessMaxConcurrent: number;
  maskingOperators: number;
  unmaskingOperators: number;
};

function key(v: unknown): string { return v == null ? "" : String(v).trim().toUpperCase(); }
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
}

function cloneResource(def: CapacityResourceDefinition): CapacityResourceDefinition {
  return { ...def, data: { ...def.data } };
}

export function applyCapacityScenario(model: CapacityModel, scenario?: CapacityScenarioOverride | null): CapacityModel {
  if (!scenario) return model;
  const resourceList = model.resourceList.map(cloneResource);
  const resources: Record<string, CapacityResourceDefinition> = {};
  for (const r of resourceList) resources[key(r.baseResourceCode || r.code)] = r;
  const next: CapacityModel = {
    ...model,
    resources,
    resourceList,
    settings: { ...model.settings },
    includeExistingSchedule: scenario.includeExistingSchedule == null ? model.includeExistingSchedule : Boolean(scenario.includeExistingSchedule),
    chemicalLine: { ...model.chemicalLine },
    painting: { ...model.painting, mainOperationCodes: [...model.painting.mainOperationCodes], defaultResources: [...model.painting.defaultResources], rules: [...model.painting.rules] },
    manualWork: { ...model.manualWork, mainOperationCodes: [...model.manualWork.mainOperationCodes], rules: [...model.manualWork.rules] },
    smartBatchSplit: { ...model.smartBatchSplit },
    criticalPathRecovery: { ...model.criticalPathRecovery },
    backwardTarget: { ...model.backwardTarget },
    whatIfOptimizer: { ...model.whatIfOptimizer, cutoffExtensionsMinutes: [...model.whatIfOptimizer.cutoffExtensionsMinutes] },
  };

  if (scenario.chemicalProcessMaxConcurrent != null) {
    next.chemicalLine.processMaxConcurrent = clampInt(scenario.chemicalProcessMaxConcurrent, 1, 16, next.chemicalLine.processMaxConcurrent);
  }
  const overrides = scenario.resourceMaxConcurrent || {};
  for (const [code, value] of Object.entries(overrides)) {
    const def = next.resources[key(code)];
    if (!def) continue;
    def.maxConcurrent = clampInt(value, 1, 64, def.maxConcurrent);
    def.data = { ...def.data, maxConcurrent: def.maxConcurrent, scenarioOverride: true };
  }
  const mask = next.resources[key(next.manualWork.maskingLaborResourceCode)] || capacityResource(next, next.manualWork.maskingLaborResourceCode);
  if (scenario.maskingOperators != null && next.resources[key(mask.baseResourceCode)]) {
    mask.maxConcurrent = clampInt(scenario.maskingOperators, 1, 64, mask.maxConcurrent);
    mask.data = { ...mask.data, maxConcurrent: mask.maxConcurrent, scenarioOverride: true };
  }
  const unmask = next.resources[key(next.manualWork.unmaskingLaborResourceCode)] || capacityResource(next, next.manualWork.unmaskingLaborResourceCode);
  if (scenario.unmaskingOperators != null && next.resources[key(unmask.baseResourceCode)]) {
    unmask.maxConcurrent = clampInt(scenario.unmaskingOperators, 1, 64, unmask.maxConcurrent);
    unmask.data = { ...unmask.data, maxConcurrent: unmask.maxConcurrent, scenarioOverride: true };
  }
  return next;
}

export function scenarioSnapshot(model: CapacityModel, scenario?: CapacityScenarioOverride | null): CapacityScenarioSnapshot {
  const applied = applyCapacityScenario(model, scenario);
  const mask = capacityResource(applied, applied.manualWork.maskingLaborResourceCode);
  const unmask = capacityResource(applied, applied.manualWork.unmaskingLaborResourceCode);
  return {
    name: scenario?.name?.trim() || "WHAT_IF",
    disabledResourceInstances: [...new Set((scenario?.disabledResourceInstances || []).map((x) => x.trim()).filter(Boolean))],
    resourceMaxConcurrent: { ...(scenario?.resourceMaxConcurrent || {}) },
    includeExistingSchedule: applied.includeExistingSchedule,
    chemicalProcessMaxConcurrent: applied.chemicalLine.processMaxConcurrent,
    maskingOperators: mask.maxConcurrent,
    unmaskingOperators: unmask.maxConcurrent,
  };
}
