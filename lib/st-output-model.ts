import { query } from "@/lib/db";

type JsonMap = Record<string, unknown>;

export type StOutputStatusConfig = {
  code: string;
  label: string;
  sortOrder: number;
  data: JsonMap;
};

export type StOutputModel = {
  endpointOperationCode: string;
  defaultCutoffTime: string;
  defaultTargetValue: number;
  metricCode: string;
  surfaceCalculationMode: "DIRECT" | "SURFACE_X_PROD_QTY" | "SURFACE_X_GOOD_WIP_QTY";
  timezoneOffsetMinutes: number;
  includeNonPlanningOperations: boolean;
  unknownStepPolicy: "BLOCK" | "REVIEW_ZERO";
  defaultUnknownMinutes: number;
  countReadyAtEndpointAsOutput: boolean;
  completedDateAssumeBeforeCutoff: boolean;
  recommendationStrategy: string;
  maxScanJobs: number;
  statuses: StOutputStatusConfig[];
  settings: Record<string, unknown>;
};

function record(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}
function text(value: unknown, fallback: string): string {
  const x = value == null ? "" : String(value).trim();
  return x || fallback;
}
function numberValue(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export async function getStOutputModel(): Promise<StOutputModel> {
  const defaults: StOutputModel = {
    endpointOperationCode: "FINSST",
    defaultCutoffTime: "15:00",
    defaultTargetValue: 50000,
    metricCode: "SURFACE_DM2",
    surfaceCalculationMode: "DIRECT",
    timezoneOffsetMinutes: 420,
    includeNonPlanningOperations: true,
    unknownStepPolicy: "REVIEW_ZERO",
    defaultUnknownMinutes: 0,
    countReadyAtEndpointAsOutput: true,
    completedDateAssumeBeforeCutoff: false,
    recommendationStrategy: "EARLIEST_FINISH_THEN_SURFACE",
    maxScanJobs: 5000,
    statuses: [],
    settings: {},
  };
  try {
    const result = await query(`
      SELECT
        COALESCE((
          SELECT jsonb_object_agg(s.setting_key, s.value_json)
          FROM config_settings s
          WHERE s.enabled=true AND s.category='ST_OUTPUT_MODEL'
        ), '{}'::jsonb) AS settings,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order, i.code)
          FROM config_items i
          WHERE i.enabled=true AND i.category='ST_OUTPUT_STATUS'
        ), '[]'::jsonb) AS statuses`);
    const row = (result.rows[0] || {}) as Record<string, unknown>;
    const settings = record(row.settings);
    const statuses = ((Array.isArray(row.statuses) ? row.statuses : []) as Record<string, unknown>[]).map((x) => ({
      code: String(x.code || ""),
      label: String(x.label || x.code || ""),
      sortOrder: Number(x.sort_order || 0),
      data: record(x.data),
    }));
    const unknown = text(settings["stOutput.unknownStepPolicy"], defaults.unknownStepPolicy).toUpperCase();
    const surfaceModeRaw = text(settings["stOutput.surfaceCalculationMode"], defaults.surfaceCalculationMode).toUpperCase();
    const surfaceCalculationMode = surfaceModeRaw === "SURFACE_X_PROD_QTY" || surfaceModeRaw === "SURFACE_X_GOOD_WIP_QTY" ? surfaceModeRaw : "DIRECT";
    return {
      endpointOperationCode: text(settings["stOutput.endpointOperationCode"], defaults.endpointOperationCode),
      defaultCutoffTime: text(settings["stOutput.defaultCutoffTime"], defaults.defaultCutoffTime),
      defaultTargetValue: Math.max(0, numberValue(settings["stOutput.defaultTargetValue"], defaults.defaultTargetValue)),
      metricCode: text(settings["stOutput.metricCode"], defaults.metricCode),
      surfaceCalculationMode,
      timezoneOffsetMinutes: numberValue(settings["stOutput.timezoneOffsetMinutes"], defaults.timezoneOffsetMinutes),
      includeNonPlanningOperations: boolValue(settings["stOutput.includeNonPlanningOperations"], defaults.includeNonPlanningOperations),
      unknownStepPolicy: unknown === "BLOCK" ? "BLOCK" : "REVIEW_ZERO",
      defaultUnknownMinutes: Math.max(0, numberValue(settings["stOutput.defaultUnknownMinutes"], defaults.defaultUnknownMinutes)),
      countReadyAtEndpointAsOutput: boolValue(settings["stOutput.countReadyAtEndpointAsOutput"], defaults.countReadyAtEndpointAsOutput),
      completedDateAssumeBeforeCutoff: boolValue(settings["stOutput.completedDateAssumeBeforeCutoff"], defaults.completedDateAssumeBeforeCutoff),
      recommendationStrategy: text(settings["stOutput.recommendationStrategy"], defaults.recommendationStrategy),
      maxScanJobs: Math.max(100, Math.min(10000, numberValue(settings["stOutput.maxScanJobs"], defaults.maxScanJobs))),
      statuses,
      settings,
    };
  } catch {
    return defaults;
  }
}

export function outputStatusLabel(model: StOutputModel, code: string): string {
  return model.statuses.find((x) => x.code === code)?.label || code.replaceAll("_", " ");
}
