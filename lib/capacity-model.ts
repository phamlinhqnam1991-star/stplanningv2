import { query } from "@/lib/db";

type JsonMap = Record<string, unknown>;

export type CapacityResourceDefinition = {
  code: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  baseResourceCode: string;
  instanceCount: number;
  instancePrefix: string;
  maxConcurrent: number;
  changeoverMinutes: number;
  calendarMode: "CONTINUOUS_24H" | "WINDOW";
  windowStart: string | null;
  windowEnd: string | null;
  data: JsonMap;
};

export type ChemicalLineCapacityModel = {
  enabled: boolean;
  resourceCode: string;
  processMaxConcurrent: number;
  ndtRecipeNos: string[];
  ndtMinutes: number;
  ndtStartSpacingMinutes: number;
  loadingDefaultMinutes: number;
  loadingHeavyMinutes: number;
  loadingQtyThreshold: number;
  loadingSurfaceThresholdDm2: number;
  unloadingDefaultMinutes: number;
  unloadingHeavyMinutes: number;
  unloadingQtyThreshold: number;
  unloadingSurfaceThresholdDm2: number;
  existingSchedulePolicy: "CONSERVATIVE_PROCESS_BLOCK" | "PHYSICAL_ONLY";
};

export type PaintingCapacityRule = {
  code: string;
  name: string;
  priority: number;
  condition: JsonMap;
  action: JsonMap;
};

export type PaintingCapacityModel = {
  enabled: boolean;
  mainOperationCodes: string[];
  defaultResources: string[];
  setupMinutes: number;
  flashMinutes: number;
  cureMinutes: number;
  releaseMinutes: number;
  useRecipeStages: boolean;
  flashOccupiesCabin: boolean;
  cureOccupiesCabin: boolean;
  releaseOccupiesCabin: boolean;
  existingSchedulePolicy: "CONSERVATIVE_FULL_BLOCK" | "PHYSICAL_ONLY";
  rules: PaintingCapacityRule[];
};


export type ManualCapacityRule = {
  code: string;
  name: string;
  priority: number;
  condition: JsonMap;
  action: JsonMap;
};

export type ManualWorkCapacityModel = {
  enabled: boolean;
  mainOperationCodes: string[];
  maskingResourceCode: string;
  unmaskingResourceCode: string;
  maskingLaborResourceCode: string;
  unmaskingLaborResourceCode: string;
  setupAggregation: "MAX_MEMBER" | "SUM_MEMBER" | "FIXED";
  maskingDefaultSetupMinutes: number;
  unmaskingDefaultSetupMinutes: number;
  defaultReleaseMinutes: number;
  defaultMaxOperatorsPerBatch: number;
  defaultOperator2ThresholdWorkMinutes: number;
  defaultParallelEfficiency: number;
  routeAwareGrouping: boolean;
  routeContextMode: "PREV_NEXT_MAIN" | "NEXT_MAIN" | "SOURCE_OPERATION_ONLY";
  rules: ManualCapacityRule[];
};

export type SmartBatchSplitModel = {
  enabled: boolean;
  onlyWhenTargetRecovery: boolean;
  delayThresholdMinutes: number;
  minReadyJobs: number;
  minReadySurfaceDm2: number;
  maxParts: number;
  splitPenaltyMinutes: number;
};

export type CriticalPathRecoveryModel = {
  enabled: boolean;
  nearCutoffMinutes: number;
  bottleneckTopN: number;
  bottleneckMinDelayMinutes: number;
  recoveryEnabled: boolean;
  recoveryOnlyWhenTargetGap: boolean;
  recoveryMaxTrials: number;
  minRecoveredSurfaceDm2: number;
  includeNoGainTrials: boolean;
};

export type BackwardTargetModel = {
  enabled: boolean;
  reservePct: number;
  plannedFirst: boolean;
  portfolioSort: "EARLIEST_FINISH" | "HIGHEST_SURFACE";
  maxPortfolioJobs: number;
  includeAreaRollup: boolean;
};

export type CapacityModel = {
  resources: Record<string, CapacityResourceDefinition>;
  resourceList: CapacityResourceDefinition[];
  settings: Record<string, unknown>;
  scenarioStartTime: string;
  lookbackDays: number;
  spillHours: number;
  candidateSurfaceMultiplier: number;
  maxCandidateJobs: number;
  includeExistingSchedule: boolean;
  proposedBatchPrefix: string;
  unmappedResourcePolicy: "BLOCK" | "REVIEW_UNCONSTRAINED";
  groupBySourceOperation: boolean;
  mainBatchGateMode: "ALL_MEMBER_ROUTE_READY";
  manualPrerequisiteGateMode: "CONSECUTIVE_ROUTE_MANUAL_CHAIN";
  dependencyGraphEnabled: boolean;
  smartBatchSplit: SmartBatchSplitModel;
  criticalPathRecovery: CriticalPathRecoveryModel;
  backwardTarget: BackwardTargetModel;
  chemicalLine: ChemicalLineCapacityModel;
  painting: PaintingCapacityModel;
  manualWork: ManualWorkCapacityModel;
};

function record(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}
function text(value: unknown, fallback: string): string {
  const x = value == null ? "" : String(value).trim();
  return x || fallback;
}
function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function key(value: unknown): string { return value == null ? "" : String(value).trim().toUpperCase(); }
function stringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.map((x) => String(x).trim()).filter(Boolean) : fallback;
}

export async function getCapacityModel(): Promise<CapacityModel> {
  const defaults: CapacityModel = {
    resources: {}, resourceList: [], settings: {}, scenarioStartTime: "06:00", lookbackDays: 1,
    spillHours: 24, candidateSurfaceMultiplier: 1.5, maxCandidateJobs: 250,
    includeExistingSchedule: true, proposedBatchPrefix: "PROP",
    unmappedResourcePolicy: "REVIEW_UNCONSTRAINED", groupBySourceOperation: true,
    mainBatchGateMode: "ALL_MEMBER_ROUTE_READY", manualPrerequisiteGateMode: "CONSECUTIVE_ROUTE_MANUAL_CHAIN",
    dependencyGraphEnabled: true,
    smartBatchSplit: {
      enabled: true, onlyWhenTargetRecovery: true, delayThresholdMinutes: 60, minReadyJobs: 2,
      minReadySurfaceDm2: 500, maxParts: 3, splitPenaltyMinutes: 10,
    },
    criticalPathRecovery: {
      enabled: true, nearCutoffMinutes: 60, bottleneckTopN: 10, bottleneckMinDelayMinutes: 15,
      recoveryEnabled: true, recoveryOnlyWhenTargetGap: true, recoveryMaxTrials: 4,
      minRecoveredSurfaceDm2: 100, includeNoGainTrials: false,
    },
    backwardTarget: {
      enabled: true, reservePct: 0, plannedFirst: true, portfolioSort: "EARLIEST_FINISH",
      maxPortfolioJobs: 500, includeAreaRollup: true,
    },
    chemicalLine: {
      enabled: true, resourceCode: "FLYBAR", processMaxConcurrent: 3, ndtRecipeNos: ["001","009","016","025"],
      ndtMinutes: 300, ndtStartSpacingMinutes: 90, loadingDefaultMinutes: 30, loadingHeavyMinutes: 45,
      loadingQtyThreshold: 501, loadingSurfaceThresholdDm2: 5001, unloadingDefaultMinutes: 30, unloadingHeavyMinutes: 45,
      unloadingQtyThreshold: 501, unloadingSurfaceThresholdDm2: 5001, existingSchedulePolicy: "CONSERVATIVE_PROCESS_BLOCK",
    },
    painting: {
      enabled: true,
      mainOperationCodes: ["PRIMER","PRIMER2","PRIMER3","TOPCOAT1","TOPCOAT2","ANTI_ABRASION","PAINT_MARKING","VARNISH"],
      defaultResources: ["CAB1","CAB2","CAB3","CAB4"],
      setupMinutes: 30, flashMinutes: 30, cureMinutes: 60, releaseMinutes: 15, useRecipeStages: true,
      flashOccupiesCabin: true, cureOccupiesCabin: true, releaseOccupiesCabin: true,
      existingSchedulePolicy: "CONSERVATIVE_FULL_BLOCK", rules: [],
    },
    manualWork: {
      enabled: true,
      mainOperationCodes: ["MASKING","FMSKG_CM","UNMASKING"],
      maskingResourceCode: "MASKING", unmaskingResourceCode: "UNMASKING",
      maskingLaborResourceCode: "MASKING_LABOR", unmaskingLaborResourceCode: "UNMASKING_LABOR",
      setupAggregation: "MAX_MEMBER", maskingDefaultSetupMinutes: 10, unmaskingDefaultSetupMinutes: 5,
      defaultReleaseMinutes: 5, defaultMaxOperatorsPerBatch: 2, defaultOperator2ThresholdWorkMinutes: 240,
      defaultParallelEfficiency: 0.85, routeAwareGrouping: true, routeContextMode: "PREV_NEXT_MAIN", rules: [],
    },
  };
  try {
    const result = await query(`
      SELECT
        COALESCE((
          SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order, i.code)
          FROM config_items i
          WHERE i.enabled=true AND i.category='CAPACITY_RESOURCE'
        ), '[]'::jsonb) AS resources,
        COALESCE((
          SELECT jsonb_object_agg(s.setting_key, s.value_json)
          FROM config_settings s
          WHERE s.enabled=true AND s.category='CAPACITY_MODEL'
        ), '{}'::jsonb) AS settings,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(r) ORDER BY r.priority, r.code)
          FROM config_rules r
          WHERE r.enabled=true AND r.rule_type='PAINT_CAPACITY'
        ), '[]'::jsonb) AS paint_rules,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(r) ORDER BY r.priority, r.code)
          FROM config_rules r
          WHERE r.enabled=true AND r.rule_type='MANUAL_CAPACITY'
        ), '[]'::jsonb) AS manual_rules`);
    const row = (result.rows[0] || {}) as Record<string, unknown>;
    const settings = record(row.settings);
    const paintRules = ((Array.isArray(row.paint_rules) ? row.paint_rules : []) as Record<string, unknown>[]).map((r) => ({
      code: String(r.code || ""),
      name: String(r.name || r.code || ""),
      priority: Number(r.priority || 100),
      condition: record(r.condition_json),
      action: record(r.action_json),
    }));
    const manualRules = ((Array.isArray(row.manual_rules) ? row.manual_rules : []) as Record<string, unknown>[]).map((r) => ({
      code: String(r.code || ""),
      name: String(r.name || r.code || ""),
      priority: Number(r.priority || 100),
      condition: record(r.condition_json),
      action: record(r.action_json),
    }));
    const list = ((Array.isArray(row.resources) ? row.resources : []) as Record<string, unknown>[]).map((x) => {
      const data = record(x.data);
      const count = Math.max(1, Math.min(64, Math.trunc(num(data.instanceCount, 1))));
      const maxConcurrent = Math.max(1, Math.min(count, Math.trunc(num(data.maxConcurrent, count))));
      const mode = key(data.calendarMode) === "WINDOW" ? "WINDOW" : "CONTINUOUS_24H";
      return {
        code: String(x.code || ""), label: String(x.label || x.code || ""), enabled: Boolean(x.enabled),
        sortOrder: Number(x.sort_order || 0), baseResourceCode: text(data.baseResourceCode, String(x.code || "")),
        instanceCount: count, instancePrefix: text(data.instancePrefix, String(x.code || "")),
        maxConcurrent, changeoverMinutes: Math.max(0, num(data.changeoverMinutes, 0)),
        calendarMode: mode as CapacityResourceDefinition["calendarMode"],
        windowStart: data.windowStart == null ? null : String(data.windowStart),
        windowEnd: data.windowEnd == null ? null : String(data.windowEnd), data,
      };
    });
    const resources: Record<string, CapacityResourceDefinition> = {};
    for (const item of list) resources[key(item.baseResourceCode || item.code)] = item;
    return {
      resources, resourceList: list, settings,
      scenarioStartTime: text(settings["capacity.scenarioStartTime"], defaults.scenarioStartTime),
      lookbackDays: Math.max(0, Math.min(7, Math.trunc(num(settings["capacity.lookbackDays"], defaults.lookbackDays)))),
      spillHours: Math.max(0, Math.min(168, num(settings["capacity.spillHours"], defaults.spillHours))),
      candidateSurfaceMultiplier: Math.max(1, Math.min(5, num(settings["capacity.candidateSurfaceMultiplier"], defaults.candidateSurfaceMultiplier))),
      maxCandidateJobs: Math.max(10, Math.min(2000, Math.trunc(num(settings["capacity.maxCandidateJobs"], defaults.maxCandidateJobs)))),
      includeExistingSchedule: bool(settings["capacity.includeExistingSchedule"], defaults.includeExistingSchedule),
      proposedBatchPrefix: text(settings["capacity.proposedBatchPrefix"], defaults.proposedBatchPrefix),
      unmappedResourcePolicy: key(settings["capacity.unmappedResourcePolicy"]) === "BLOCK" ? "BLOCK" : "REVIEW_UNCONSTRAINED",
      groupBySourceOperation: bool(settings["capacity.groupBySourceOperation"], defaults.groupBySourceOperation),
      mainBatchGateMode: key(settings["capacity.mainBatchGateMode"]) === "ALL_MEMBER_ROUTE_READY" ? "ALL_MEMBER_ROUTE_READY" : defaults.mainBatchGateMode,
      manualPrerequisiteGateMode: key(settings["capacity.manualPrerequisiteGateMode"]) === "CONSECUTIVE_ROUTE_MANUAL_CHAIN" ? "CONSECUTIVE_ROUTE_MANUAL_CHAIN" : defaults.manualPrerequisiteGateMode,
      dependencyGraphEnabled: bool(settings["capacity.dependencyGraphEnabled"], defaults.dependencyGraphEnabled),
      smartBatchSplit: {
        enabled: bool(settings["capacity.smartBatchSplitEnabled"], defaults.smartBatchSplit.enabled),
        onlyWhenTargetRecovery: bool(settings["capacity.smartBatchSplitOnlyWhenTargetRecovery"], defaults.smartBatchSplit.onlyWhenTargetRecovery),
        delayThresholdMinutes: Math.max(0, Math.min(24*60, num(settings["capacity.smartBatchSplitDelayThresholdMinutes"], defaults.smartBatchSplit.delayThresholdMinutes))),
        minReadyJobs: Math.max(1, Math.min(100, Math.trunc(num(settings["capacity.smartBatchSplitMinReadyJobs"], defaults.smartBatchSplit.minReadyJobs)))),
        minReadySurfaceDm2: Math.max(0, num(settings["capacity.smartBatchSplitMinReadySurfaceDm2"], defaults.smartBatchSplit.minReadySurfaceDm2)),
        maxParts: Math.max(2, Math.min(8, Math.trunc(num(settings["capacity.smartBatchSplitMaxParts"], defaults.smartBatchSplit.maxParts)))),
        splitPenaltyMinutes: Math.max(0, Math.min(24*60, num(settings["capacity.smartBatchSplitPenaltyMinutes"], defaults.smartBatchSplit.splitPenaltyMinutes))),
      },
      criticalPathRecovery: {
        enabled: bool(settings["capacity.criticalPathEnabled"], defaults.criticalPathRecovery.enabled),
        nearCutoffMinutes: Math.max(0, Math.min(24*60, num(settings["capacity.criticalPathNearCutoffMinutes"], defaults.criticalPathRecovery.nearCutoffMinutes))),
        bottleneckTopN: Math.max(1, Math.min(50, Math.trunc(num(settings["capacity.bottleneckTopN"], defaults.criticalPathRecovery.bottleneckTopN)))),
        bottleneckMinDelayMinutes: Math.max(0, Math.min(24*60, num(settings["capacity.bottleneckMinDelayMinutes"], defaults.criticalPathRecovery.bottleneckMinDelayMinutes))),
        recoveryEnabled: bool(settings["capacity.recoveryEnabled"], defaults.criticalPathRecovery.recoveryEnabled),
        recoveryOnlyWhenTargetGap: bool(settings["capacity.recoveryOnlyWhenTargetGap"], defaults.criticalPathRecovery.recoveryOnlyWhenTargetGap),
        recoveryMaxTrials: Math.max(0, Math.min(12, Math.trunc(num(settings["capacity.recoveryMaxTrials"], defaults.criticalPathRecovery.recoveryMaxTrials)))),
        minRecoveredSurfaceDm2: Math.max(0, num(settings["capacity.recoveryMinRecoveredSurfaceDm2"], defaults.criticalPathRecovery.minRecoveredSurfaceDm2)),
        includeNoGainTrials: bool(settings["capacity.recoveryIncludeNoGainTrials"], defaults.criticalPathRecovery.includeNoGainTrials),
      },
      backwardTarget: {
        enabled: bool(settings["capacity.backwardTargetEnabled"], defaults.backwardTarget.enabled),
        reservePct: Math.max(0, Math.min(100, num(settings["capacity.backwardTargetReservePct"], defaults.backwardTarget.reservePct))),
        plannedFirst: bool(settings["capacity.backwardTargetPlannedFirst"], defaults.backwardTarget.plannedFirst),
        portfolioSort: key(settings["capacity.backwardTargetPortfolioSort"]) === "HIGHEST_SURFACE" ? "HIGHEST_SURFACE" : "EARLIEST_FINISH",
        maxPortfolioJobs: Math.max(1, Math.min(2000, Math.trunc(num(settings["capacity.backwardTargetMaxPortfolioJobs"], defaults.backwardTarget.maxPortfolioJobs)))),
        includeAreaRollup: bool(settings["capacity.backwardTargetAreaRollup"], defaults.backwardTarget.includeAreaRollup),
      },
      chemicalLine: {
        enabled: bool(settings["capacity.chemicalLineSegmented"], defaults.chemicalLine.enabled),
        resourceCode: text(settings["capacity.chemicalLineResourceCode"], defaults.chemicalLine.resourceCode),
        processMaxConcurrent: Math.max(1, Math.min(16, Math.trunc(num(settings["capacity.chemicalLineProcessMaxConcurrent"], defaults.chemicalLine.processMaxConcurrent)))),
        ndtRecipeNos: stringArray(settings["capacity.chemicalLineNdtRecipeNos"], defaults.chemicalLine.ndtRecipeNos),
        ndtMinutes: Math.max(0, num(settings["capacity.chemicalLineNdtMinutes"], defaults.chemicalLine.ndtMinutes)),
        ndtStartSpacingMinutes: Math.max(0, num(settings["capacity.chemicalLineNdtStartSpacingMinutes"], defaults.chemicalLine.ndtStartSpacingMinutes)),
        loadingDefaultMinutes: Math.max(0, num(settings["capacity.chemicalLineLoadingDefaultMinutes"], defaults.chemicalLine.loadingDefaultMinutes)),
        loadingHeavyMinutes: Math.max(0, num(settings["capacity.chemicalLineLoadingHeavyMinutes"], defaults.chemicalLine.loadingHeavyMinutes)),
        loadingQtyThreshold: Math.max(0, num(settings["capacity.chemicalLineLoadingQtyThreshold"], defaults.chemicalLine.loadingQtyThreshold)),
        loadingSurfaceThresholdDm2: Math.max(0, num(settings["capacity.chemicalLineLoadingSurfaceThresholdDm2"], defaults.chemicalLine.loadingSurfaceThresholdDm2)),
        unloadingDefaultMinutes: Math.max(0, num(settings["capacity.chemicalLineUnloadingDefaultMinutes"], defaults.chemicalLine.unloadingDefaultMinutes)),
        unloadingHeavyMinutes: Math.max(0, num(settings["capacity.chemicalLineUnloadingHeavyMinutes"], defaults.chemicalLine.unloadingHeavyMinutes)),
        unloadingQtyThreshold: Math.max(0, num(settings["capacity.chemicalLineUnloadingQtyThreshold"], defaults.chemicalLine.unloadingQtyThreshold)),
        unloadingSurfaceThresholdDm2: Math.max(0, num(settings["capacity.chemicalLineUnloadingSurfaceThresholdDm2"], defaults.chemicalLine.unloadingSurfaceThresholdDm2)),
        existingSchedulePolicy: key(settings["capacity.chemicalLineExistingSchedulePolicy"]) === "PHYSICAL_ONLY" ? "PHYSICAL_ONLY" : "CONSERVATIVE_PROCESS_BLOCK",
      },
       painting: {
        enabled: bool(settings["capacity.paintingSegmented"], defaults.painting.enabled),
        mainOperationCodes: stringArray(settings["capacity.paintingMainOperations"], defaults.painting.mainOperationCodes),
        defaultResources: stringArray(settings["capacity.paintingDefaultResources"], defaults.painting.defaultResources),
        setupMinutes: Math.max(0, num(settings["capacity.paintingSetupMinutes"], defaults.painting.setupMinutes)),
        flashMinutes: Math.max(0, num(settings["capacity.paintingFlashMinutes"], defaults.painting.flashMinutes)),
        cureMinutes: Math.max(0, num(settings["capacity.paintingCureMinutes"], defaults.painting.cureMinutes)),
        releaseMinutes: Math.max(0, num(settings["capacity.paintingReleaseMinutes"], defaults.painting.releaseMinutes)),
        useRecipeStages: bool(settings["capacity.paintingUseRecipeStages"], defaults.painting.useRecipeStages),
        flashOccupiesCabin: bool(settings["capacity.paintingFlashOccupiesCabin"], defaults.painting.flashOccupiesCabin),
        cureOccupiesCabin: bool(settings["capacity.paintingCureOccupiesCabin"], defaults.painting.cureOccupiesCabin),
        releaseOccupiesCabin: bool(settings["capacity.paintingReleaseOccupiesCabin"], defaults.painting.releaseOccupiesCabin),
        existingSchedulePolicy: key(settings["capacity.paintingExistingSchedulePolicy"]) === "PHYSICAL_ONLY" ? "PHYSICAL_ONLY" : "CONSERVATIVE_FULL_BLOCK",
        rules: paintRules,
      },
      manualWork: {
        enabled: bool(settings["capacity.manualWorkSegmented"], defaults.manualWork.enabled),
        mainOperationCodes: stringArray(settings["capacity.manualWorkMainOperations"], defaults.manualWork.mainOperationCodes),
        maskingResourceCode: text(settings["capacity.maskingResourceCode"], defaults.manualWork.maskingResourceCode),
        unmaskingResourceCode: text(settings["capacity.unmaskingResourceCode"], defaults.manualWork.unmaskingResourceCode),
        maskingLaborResourceCode: text(settings["capacity.maskingLaborResourceCode"], defaults.manualWork.maskingLaborResourceCode),
        unmaskingLaborResourceCode: text(settings["capacity.unmaskingLaborResourceCode"], defaults.manualWork.unmaskingLaborResourceCode),
        setupAggregation: key(settings["capacity.manualSetupAggregation"]) === "SUM_MEMBER" ? "SUM_MEMBER" : key(settings["capacity.manualSetupAggregation"]) === "FIXED" ? "FIXED" : "MAX_MEMBER",
        maskingDefaultSetupMinutes: Math.max(0, num(settings["capacity.maskingDefaultSetupMinutes"], defaults.manualWork.maskingDefaultSetupMinutes)),
        unmaskingDefaultSetupMinutes: Math.max(0, num(settings["capacity.unmaskingDefaultSetupMinutes"], defaults.manualWork.unmaskingDefaultSetupMinutes)),
        defaultReleaseMinutes: Math.max(0, num(settings["capacity.manualReleaseMinutes"], defaults.manualWork.defaultReleaseMinutes)),
        defaultMaxOperatorsPerBatch: Math.max(1, Math.min(16, Math.trunc(num(settings["capacity.manualMaxOperatorsPerBatch"], defaults.manualWork.defaultMaxOperatorsPerBatch)))),
        defaultOperator2ThresholdWorkMinutes: Math.max(1, num(settings["capacity.manualOperator2ThresholdWorkMinutes"], defaults.manualWork.defaultOperator2ThresholdWorkMinutes)),
        defaultParallelEfficiency: Math.max(0.1, Math.min(1, num(settings["capacity.manualParallelEfficiency"], defaults.manualWork.defaultParallelEfficiency))),
        routeAwareGrouping: bool(settings["capacity.manualRouteAwareGrouping"], defaults.manualWork.routeAwareGrouping),
        routeContextMode: key(settings["capacity.manualRouteContextMode"]) === "NEXT_MAIN" ? "NEXT_MAIN" : key(settings["capacity.manualRouteContextMode"]) === "SOURCE_OPERATION_ONLY" ? "SOURCE_OPERATION_ONLY" : "PREV_NEXT_MAIN",
        rules: manualRules,
      },
    };
  } catch {
    return defaults;
  }
}

export function capacityResource(model: CapacityModel, resourceCode: string): CapacityResourceDefinition {
  const k = key(resourceCode);
  return model.resources[k] || {
    code: resourceCode, label: resourceCode, enabled: true, sortOrder: 9999,
    baseResourceCode: resourceCode, instanceCount: 1, instancePrefix: resourceCode,
    maxConcurrent: 1, changeoverMinutes: 0, calendarMode: "CONTINUOUS_24H",
    windowStart: null, windowEnd: null, data: { implicit: true },
  };
}

export function capacityInstanceCodes(def: CapacityResourceDefinition): string[] {
  if (def.instanceCount <= 1) return [def.baseResourceCode];
  return Array.from({ length: def.instanceCount }, (_, i) => `${def.instancePrefix}${i + 1}`);
}
