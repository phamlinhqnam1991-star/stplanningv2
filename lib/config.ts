import type { PoolClient } from "pg";
import { query } from "@/lib/db";
import { ROUTING_CORE_COLUMNS, ROUTING_SOURCE, SCHEDULING_RESOURCE_COLUMNS, SOURCE_SHEETS } from "@/lib/source-model";

export type SourceProfileKey = "PLANNING" | "SCHEDULING" | "ROUTING";

export type SourceProfile = {
  sourceKey: SourceProfileKey;
  displayName: string;
  sheetName: string | null;
  headerRows: number;
  baselineColumns: number;
  operationSlots: number | null;
  enabled: boolean;
  parserConfig: Record<string, unknown>;
};

export type ConfigItem = {
  id?: string;
  category: string;
  code: string;
  label: string;
  parentCode?: string | null;
  enabled: boolean;
  sortOrder: number;
  data: Record<string, unknown>;
};

export type RouteConfigOptions = {
  preferNextOperation: boolean;
  fallbackFirstIncomplete: boolean;
  includeCurrentInRemaining: boolean;
};

export type ConfigViewProfile = {
  id?: string;
  viewKey: string;
  profileCode: string;
  name: string;
  isDefault: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
};

export type ConfigBootstrap = {
  configAvailable: boolean;
  sources: Record<SourceProfileKey, SourceProfile>;
  resources: ConfigItem[];
  statuses: ConfigItem[];
  definitions: { categories: string[]; linkTypes: string[]; ruleTypes: string[] };
  views: ConfigViewProfile[];
  settings: Record<string, unknown>;
};

const fallbackSources: Record<SourceProfileKey, SourceProfile> = {
  PLANNING: {
    sourceKey: "PLANNING",
    displayName: "ST Planning Source",
    sheetName: SOURCE_SHEETS.planning.name,
    headerRows: SOURCE_SHEETS.planning.headerRows,
    baselineColumns: SOURCE_SHEETS.planning.baselineColumns,
    operationSlots: null,
    enabled: true,
    parserConfig: {
      criticalHeaders: { A: "PROGRAM", C: "EPICORPART", F: "JOBNUM", H: "NEXTOPERATION", M: "CMSA", AV: "VARNISH" },
      coreColumns: {
        program: "A", partCluster: "B", epicorPart: "C", surfaceDm2: "D", partDescription: "E",
        jobNum: "F", lastLaborOp: "G", nextOperation: "H", lastLaborQty: "I", prodQty: "J",
        currentGoodWipQty: "K", stSourceValue: "AW", stWipArea: "AX", wipSequence: "AY", allOperation: "AZ",
      },
      operationColumnStart: 13,
      operationColumnEnd: 48,
    },
  },
  SCHEDULING: {
    sourceKey: "SCHEDULING",
    displayName: "Main Scheduling Source",
    sheetName: SOURCE_SHEETS.scheduling.name,
    headerRows: SOURCE_SHEETS.scheduling.headerRows,
    baselineColumns: SOURCE_SHEETS.scheduling.baselineColumns,
    operationSlots: null,
    enabled: true,
    parserConfig: {
      criticalHeaders: { A: "DATE", D: "SPX CLEAN", Q: "SP#/FB#/PB#", R: "RECIPE#", AJ: "STATUS" },
      coreColumns: {
        date: "A", day: "B", slot: "C", batch: "Q", recipeNo: "R", recipeDescription: "S",
        jobCount: "T", pcs: "U", surfaceDm2: "V", start: "W", end: "X", duration: "Y", status: "AJ", comments: "AK",
      },
      resourceColumns: Object.fromEntries(Object.entries(SCHEDULING_RESOURCE_COLUMNS).map(([order, code]) => [String.fromCharCode(64 + Number(order)), code])),
    },
  },
  ROUTING: {
    sourceKey: "ROUTING",
    displayName: ROUTING_SOURCE.displayName,
    sheetName: "Sheet1",
    headerRows: ROUTING_SOURCE.headerRows,
    baselineColumns: ROUTING_SOURCE.baselineColumns,
    operationSlots: ROUTING_SOURCE.operationSlots,
    enabled: true,
    parserConfig: {
      criticalHeaders: { D: "PROGRAM", E: "EPICORPART", J: "JOBNUM", AC: "NEXTOPERATION", CI: "OP.1", CW: "OPRSEQ.1", IN: "OPRSEQ.36" },
      preferredSheetName: "Sheet1",
      coreColumns: ROUTING_CORE_COLUMNS,
      operationPrefixes: { operation: "Op.", complete: "OpC.", nonconformance: "OpenNonConfOp.", sequence: "OprSeq." },
    },
  },
};

const fallbackResources: ConfigItem[] = Object.entries(SCHEDULING_RESOURCE_COLUMNS).map(([order, code]) => ({
  category: "RESOURCE",
  code,
  label: code.replaceAll("_", " ").replace("SPX CLEAN", "SPX Clean").replace("MANUAL DBL", "Manual DBL").replace("AUTO DBL", "Auto DBL").replace("HE BAKE", "He-Bake").replace("MANUAL SP", "Manual SP").replace("AUTO SHP", "Auto SHP").replace("PAINT POWDER", "Paint Powder"),
  enabled: true,
  sortOrder: Number(order) * 10,
  data: { sourceColumn: String.fromCharCode(64 + Number(order)) },
}));

const fallbackDefinitions = {
  categories: ["MAIN_OPERATION", "ST_OPERATION", "OPERATION_CODE", "RESOURCE", "SCHEDULE_STATUS", "PHYSICAL_AREA", "SCHEDULE_AREA", "PLANNER", "RECIPE_GROUP", "PAINT_TYPE", "CONFIG_CATEGORY", "LINK_TYPE", "RULE_TYPE"],
  linkTypes: ["OPERATION_TO_MAIN", "MAIN_TO_PHYSICAL_AREA", "PHYSICAL_TO_SCHEDULE_AREA", "SCHEDULE_AREA_TO_PLANNER", "OPERATION_TO_RESOURCE", "OPERATION_TO_RECIPE_GROUP"],
  ruleTypes: ["PRIORITY", "PROCESS_TIME", "BATCH", "RECIPE", "CANDIDATE", "AUTO_PLAN", "ROUTE"],
};

const fallbackViews: ConfigViewProfile[] = [
  { viewKey: "PLANNING", profileCode: "STANDARD", name: "Standard Planning", isDefault: true, enabled: true, config: { pageSize: 100, sort: "row", direction: "asc" } },
  { viewKey: "SCHEDULING", profileCode: "STANDARD", name: "Standard Scheduling", isDefault: true, enabled: true, config: { pageSize: 100, sort: "date", direction: "asc", mode: "table" } },
  { viewKey: "ROUTING", profileCode: "STANDARD", name: "Standard Routing", isDefault: true, enabled: true, config: { pageSize: 25, sort: "job", direction: "asc" } },
];

function viewRow(row: Record<string, unknown>): ConfigViewProfile {
  return {
    id: row.id == null ? undefined : String(row.id),
    viewKey: String(row.view_key),
    profileCode: String(row.profile_code),
    name: String(row.name),
    isDefault: Boolean(row.is_default),
    enabled: Boolean(row.enabled),
    config: (row.config_json || {}) as Record<string, unknown>,
  };
}

function sourceRowToProfile(row: Record<string, unknown>): SourceProfile {
  return {
    sourceKey: String(row.source_key) as SourceProfileKey,
    displayName: String(row.display_name),
    sheetName: row.sheet_name == null ? null : String(row.sheet_name),
    headerRows: Number(row.header_rows),
    baselineColumns: Number(row.baseline_columns),
    operationSlots: row.operation_slots == null ? null : Number(row.operation_slots),
    enabled: Boolean(row.enabled),
    parserConfig: (row.parser_config || {}) as Record<string, unknown>,
  };
}

function itemRow(row: Record<string, unknown>): ConfigItem {
  return {
    id: row.id == null ? undefined : String(row.id),
    category: String(row.category),
    code: String(row.code),
    label: String(row.label),
    parentCode: row.parent_code == null ? null : String(row.parent_code),
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order || 0),
    data: (row.data || {}) as Record<string, unknown>,
  };
}

export async function getConfigBootstrap(): Promise<ConfigBootstrap> {
  try {
    // One round-trip is intentional: Vercel/Aiven uses a very small connection pool.
    const result = await query(`
      SELECT
        COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.source_key) FROM config_source_profiles s), '[]'::jsonb) AS sources,
        COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.category, i.sort_order, i.code)
                  FROM config_items i
                  WHERE i.enabled=true AND i.category IN ('RESOURCE','SCHEDULE_STATUS','CONFIG_CATEGORY','LINK_TYPE','RULE_TYPE')), '[]'::jsonb) AS items,
        COALESCE((SELECT jsonb_object_agg(x.setting_key, x.value_json) FROM config_settings x WHERE x.enabled=true), '{}'::jsonb) AS settings,
        COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.view_key, v.is_default DESC, v.profile_code)
                  FROM config_view_profiles v WHERE v.enabled=true), '[]'::jsonb) AS views`);

    const row = (result.rows[0] || {}) as Record<string, unknown>;
    const sources = { ...fallbackSources };
    for (const sourceRow of (Array.isArray(row.sources) ? row.sources : []) as Record<string, unknown>[]) {
      const profile = sourceRowToProfile(sourceRow);
      if (profile.sourceKey in sources) sources[profile.sourceKey] = profile;
    }
    const items = ((Array.isArray(row.items) ? row.items : []) as Record<string, unknown>[]).map(itemRow);
    const settings = configRecord(row.settings);
    const categoryDefs = items.filter((x) => x.category === "CONFIG_CATEGORY").map((x) => x.code);
    const linkDefs = items.filter((x) => x.category === "LINK_TYPE").map((x) => x.code);
    const ruleDefs = items.filter((x) => x.category === "RULE_TYPE").map((x) => x.code);
    const views = ((Array.isArray(row.views) ? row.views : []) as Record<string, unknown>[]).map(viewRow);

    return {
      configAvailable: true,
      sources,
      resources: items.filter((x) => x.category === "RESOURCE"),
      statuses: items.filter((x) => x.category === "SCHEDULE_STATUS"),
      definitions: {
        categories: categoryDefs.length ? categoryDefs : fallbackDefinitions.categories,
        linkTypes: linkDefs.length ? linkDefs : fallbackDefinitions.linkTypes,
        ruleTypes: ruleDefs.length ? ruleDefs : fallbackDefinitions.ruleTypes,
      },
      views: views.length ? views : fallbackViews,
      settings,
    };
  } catch {
    return {
      configAvailable: false,
      sources: fallbackSources,
      resources: fallbackResources,
      statuses: ["DONE", "ONGOING", "WAITING", "REPLANNED"].map((code, i) => ({ category: "SCHEDULE_STATUS", code, label: code[0] + code.slice(1).toLowerCase(), enabled: true, sortOrder: (i + 1) * 10, data: {} })),
      definitions: fallbackDefinitions,
      views: fallbackViews,
      settings: {
        "route.preferNextOperation": true,
        "route.fallbackFirstIncomplete": true,
        "route.includeCurrentInRemaining": true,
        "import.maxStChunkRows": 100,
        "import.maxRoutingChunkRows": 80,
        "ui.defaultPageSize": 100,
        "ui.maxPageSize": 500,
      },
    };
  }
}

export async function getSourceProfile(key: SourceProfileKey): Promise<SourceProfile> {
  const boot = await getConfigBootstrap();
  return boot.sources[key];
}

export function routeConfigOptionsFromSettings(settings: Record<string, unknown>): RouteConfigOptions {
  return {
    preferNextOperation: settings["route.preferNextOperation"] !== false,
    fallbackFirstIncomplete: settings["route.fallbackFirstIncomplete"] !== false,
    includeCurrentInRemaining: settings["route.includeCurrentInRemaining"] !== false,
  };
}

export async function getRouteConfigOptions(): Promise<RouteConfigOptions> {
  const boot = await getConfigBootstrap();
  return routeConfigOptionsFromSettings(boot.settings);
}

export function numberSetting(settings: Record<string, unknown>, key: string, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(settings[key]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export async function discoverConfigItem(
  client: PoolClient,
  category: string,
  code: string,
  label = code,
  data: Record<string, unknown> = {}
) {
  await client.query(
    `INSERT INTO config_items (category, code, label, data)
     VALUES ($1,$2,$3,$4::jsonb)
     ON CONFLICT (category, code) DO UPDATE SET
       label = CASE WHEN config_items.label = config_items.code THEN EXCLUDED.label ELSE config_items.label END,
       data = config_items.data || EXCLUDED.data,
       updated_at = now()`,
    [category, code, label, JSON.stringify(data)]
  );
}

export function configRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function configStringMap(value: unknown): Record<string, string> {
  const input = configRecord(value);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(input)) if (item != null) out[key] = String(item);
  return out;
}

export function sourceCoreColumns(profile: SourceProfile): Record<string, string> {
  return configStringMap(profile.parserConfig.coreColumns);
}

export function sourceResourceColumns(profile: SourceProfile): Record<string, string> {
  return configStringMap(profile.parserConfig.resourceColumns);
}

export function sourceOperationRange(profile: SourceProfile): { start: number; end: number } {
  const start = Number(profile.parserConfig.operationColumnStart ?? 13);
  const end = Number(profile.parserConfig.operationColumnEnd ?? 48);
  return { start: Number.isFinite(start) ? start : 13, end: Number.isFinite(end) ? end : 48 };
}

export function routingPrefixes(profile: SourceProfile) {
  const value = configStringMap(profile.parserConfig.operationPrefixes);
  return {
    operation: value.operation || "Op.",
    complete: value.complete || "OpC.",
    nonconformance: value.nonconformance || "OpenNonConfOp.",
    sequence: value.sequence || "OprSeq.",
  };
}

export async function getOperationMainMap(): Promise<Record<string, { code: string; label: string }>> {
  try {
    const result = await query(`
      SELECT upper(l.from_code) AS operation_code,
             l.to_code AS main_code,
             COALESCE(m.label,l.to_code) AS main_label
      FROM config_links l
      JOIN config_items m ON m.category='MAIN_OPERATION' AND m.code=l.to_code AND m.enabled=true
      WHERE l.enabled=true AND l.link_type='OPERATION_TO_MAIN'
      ORDER BY l.sort_order, l.from_code`);
    const out: Record<string, { code: string; label: string }> = {};
    for (const row of result.rows as Record<string, unknown>[]) {
      out[String(row.operation_code)] = { code: String(row.main_code), label: String(row.main_label) };
    }
    return out;
  } catch {
    return {};
  }
}

export function applyMainOperationMapping(
  operationCodes: string[],
  mapping: Record<string, { code: string; label: string }>
) {
  const seen = new Set<string>();
  const out: Array<{ code: string; label: string; sourceOperation: string }> = [];
  for (const operation of operationCodes) {
    const mapped = mapping[operation.trim().toUpperCase()];
    if (!mapped || seen.has(mapped.code)) continue;
    seen.add(mapped.code);
    out.push({ ...mapped, sourceOperation: operation });
  }
  return out;
}

export function sourceDisplayColumns(profile: SourceProfile): Record<string, string> {
  const raw = configStringMap(profile.parserConfig.displayColumns);
  const out: Record<string, string> = {};
  for (const [key, col] of Object.entries(raw)) {
    const upper = col.trim().toUpperCase();
    if (/^[A-Z]{1,4}$/.test(upper)) out[key] = upper;
  }
  return out;
}
