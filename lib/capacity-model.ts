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

export async function getCapacityModel(): Promise<CapacityModel> {
  const defaults: CapacityModel = {
    resources: {}, resourceList: [], settings: {}, scenarioStartTime: "06:00", lookbackDays: 1,
    spillHours: 24, candidateSurfaceMultiplier: 1.5, maxCandidateJobs: 250,
    includeExistingSchedule: true, proposedBatchPrefix: "PROP",
    unmappedResourcePolicy: "REVIEW_UNCONSTRAINED", groupBySourceOperation: true,
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
        ), '{}'::jsonb) AS settings`);
    const row = (result.rows[0] || {}) as Record<string, unknown>;
    const settings = record(row.settings);
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
