import { query } from "@/lib/db";

type JsonMap = Record<string, unknown>;

export type PlanningMasterItem = {
  category: string;
  code: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  data: JsonMap;
};

export type PlanningLink = {
  linkType: string;
  fromCategory: string;
  fromCode: string;
  toCategory: string;
  toCode: string;
  enabled: boolean;
  sortOrder: number;
  data: JsonMap;
};

export type MainOperationDefinition = {
  code: string;
  label: string;
  planningOrder: number;
  planningEnabled: boolean;
  scheduleEnabled: boolean;
  batchEnabled: boolean;
  color: string | null;
  shortCode: string | null;
  stGroup: { code: string; label: string } | null;
  physicalArea: { code: string; label: string } | null;
  scheduleArea: { code: string; label: string } | null;
  planner: { code: string; label: string } | null;
  resources: Array<{ code: string; label: string }>;
  recipeGroups: Array<{ code: string; label: string }>;
};

export type OperationPlanningMapping = {
  operationCode: string;
  sourceCategory: string;
  mainOperation: MainOperationDefinition | null;
};

export type PlanningRouteStep = {
  sourceOperation: string;
  mapped: boolean;
  mainOperationCode: string | null;
  mainOperationLabel: string | null;
  planningOrder: number | null;
  planningEnabled: boolean;
  scheduleEnabled: boolean;
  batchEnabled: boolean;
  color: string | null;
  stGroup: { code: string; label: string } | null;
  physicalArea: { code: string; label: string } | null;
  scheduleArea: { code: string; label: string } | null;
  planner: { code: string; label: string } | null;
  resources: Array<{ code: string; label: string }>;
  recipeGroups: Array<{ code: string; label: string }>;
};

export type PlanningModel = {
  items: PlanningMasterItem[];
  links: PlanningLink[];
  settings: Record<string, unknown>;
  mainOperations: Record<string, MainOperationDefinition>;
  operationMappings: Record<string, OperationPlanningMapping>;
};

export type PlanningRouteClassification = {
  steps: PlanningRouteStep[];
  mappedCount: number;
  unmappedCount: number;
  nextMainOperation: MainOperationDefinition | null;
  nextPlanningOperation: MainOperationDefinition | null;
  remainingMainOperations: MainOperationDefinition[];
  remainingPlanningOperations: MainOperationDefinition[];
  unmappedOperations: string[];
};

const RELEVANT_CATEGORIES = [
  "MAIN_OPERATION",
  "ST_GROUP",
  "PHYSICAL_AREA",
  "SCHEDULE_AREA",
  "PLANNER",
  "RESOURCE",
  "RECIPE_GROUP",
] as const;

const RELEVANT_LINKS = [
  "OPERATION_TO_MAIN",
  "MAIN_TO_ST_GROUP",
  "ST_GROUP_TO_PHYSICAL_AREA",
  "PHYSICAL_TO_SCHEDULE_AREA",
  "SCHEDULE_AREA_TO_PLANNER",
  "MAIN_TO_RESOURCE",
  "MAIN_TO_RECIPE_GROUP",
] as const;

function record(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function str(value: unknown): string | null {
  const x = value == null ? "" : String(value).trim();
  return x || null;
}

function key(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

function toItem(row: Record<string, unknown>): PlanningMasterItem {
  return {
    category: String(row.category),
    code: String(row.code),
    label: String(row.label),
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order || 0),
    data: record(row.data),
  };
}

function toLink(row: Record<string, unknown>): PlanningLink {
  return {
    linkType: String(row.link_type),
    fromCategory: String(row.from_category),
    fromCode: String(row.from_code),
    toCategory: String(row.to_category),
    toCode: String(row.to_code),
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order || 0),
    data: record(row.data),
  };
}

function linkTargets(links: PlanningLink[], linkType: string, fromCategory: string, fromCode: string) {
  return links
    .filter((x) => x.enabled && x.linkType === linkType && x.fromCategory === fromCategory && key(x.fromCode) === key(fromCode))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.toCode.localeCompare(b.toCode));
}

function firstTarget(links: PlanningLink[], linkType: string, fromCategory: string, fromCode: string) {
  return linkTargets(links, linkType, fromCategory, fromCode)[0] || null;
}

function itemIndex(items: PlanningMasterItem[]) {
  const out = new Map<string, PlanningMasterItem>();
  for (const item of items) out.set(`${item.category}:${key(item.code)}`, item);
  return out;
}

function mappedLabel(index: Map<string, PlanningMasterItem>, category: string, code: string) {
  const item = index.get(`${category}:${key(code)}`);
  return item ? { code: item.code, label: item.label } : { code, label: code };
}

function settingArray(settings: Record<string, unknown>, name: string, fallback: string[]) {
  const value = settings[name];
  return Array.isArray(value) && value.every((x) => typeof x === "string") ? value as string[] : fallback;
}

export async function getPlanningModel(): Promise<PlanningModel> {
  try {
    const result = await query(`
      SELECT
        COALESCE((
          SELECT jsonb_agg(to_jsonb(i) ORDER BY i.category, i.sort_order, i.code)
          FROM config_items i
          WHERE i.enabled=true
            AND i.category = ANY($1::text[])
        ), '[]'::jsonb) AS items,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(l) ORDER BY l.link_type, l.sort_order, l.from_code, l.to_code)
          FROM config_links l
          WHERE l.enabled=true
            AND l.link_type = ANY($2::text[])
        ), '[]'::jsonb) AS links,
        COALESCE((
          SELECT jsonb_object_agg(s.setting_key, s.value_json)
          FROM config_settings s
          WHERE s.enabled=true AND s.category='PLANNING_MODEL'
        ), '{}'::jsonb) AS settings`,
      [RELEVANT_CATEGORIES, RELEVANT_LINKS]
    );

    const row = (result.rows[0] || {}) as Record<string, unknown>;
    const items = ((Array.isArray(row.items) ? row.items : []) as Record<string, unknown>[]).map(toItem);
    const links = ((Array.isArray(row.links) ? row.links : []) as Record<string, unknown>[]).map(toLink);
    const settings = record(row.settings);
    const index = itemIndex(items);

    const mains = items.filter((x) => x.category === "MAIN_OPERATION");
    const mainOperations: Record<string, MainOperationDefinition> = {};
    for (const main of mains) {
      const stGroupLink = firstTarget(links, "MAIN_TO_ST_GROUP", "MAIN_OPERATION", main.code);
      const stGroup = stGroupLink ? mappedLabel(index, "ST_GROUP", stGroupLink.toCode) : null;
      const physicalLink = stGroup ? firstTarget(links, "ST_GROUP_TO_PHYSICAL_AREA", "ST_GROUP", stGroup.code) : null;
      const physicalArea = physicalLink ? mappedLabel(index, "PHYSICAL_AREA", physicalLink.toCode) : null;
      const scheduleLink = physicalArea ? firstTarget(links, "PHYSICAL_TO_SCHEDULE_AREA", "PHYSICAL_AREA", physicalArea.code) : null;
      const scheduleArea = scheduleLink ? mappedLabel(index, "SCHEDULE_AREA", scheduleLink.toCode) : null;
      const plannerLink = scheduleArea ? firstTarget(links, "SCHEDULE_AREA_TO_PLANNER", "SCHEDULE_AREA", scheduleArea.code) : null;
      const planner = plannerLink ? mappedLabel(index, "PLANNER", plannerLink.toCode) : null;
      const resources = linkTargets(links, "MAIN_TO_RESOURCE", "MAIN_OPERATION", main.code)
        .map((x) => mappedLabel(index, "RESOURCE", x.toCode));
      const recipeGroups = linkTargets(links, "MAIN_TO_RECIPE_GROUP", "MAIN_OPERATION", main.code)
        .map((x) => mappedLabel(index, "RECIPE_GROUP", x.toCode));

      const defaultPlanningEnabled = bool(settings["planningModel.defaultPlanningEnabled"], true);
      const requireHierarchy = bool(settings["planningModel.requireHierarchyForPlanning"], false);
      const configuredPlanningEnabled = bool(main.data.planningEnabled, defaultPlanningEnabled);
      const hierarchyReady = Boolean(stGroup && physicalArea && scheduleArea);
      mainOperations[key(main.code)] = {
        code: main.code,
        label: main.label,
        planningOrder: num(main.data.planningOrder, main.sortOrder || 9999),
        planningEnabled: configuredPlanningEnabled && (!requireHierarchy || hierarchyReady),
        scheduleEnabled: bool(main.data.scheduleEnabled, true),
        batchEnabled: bool(main.data.batchEnabled, true),
        color: str(main.data.color),
        shortCode: str(main.data.shortCode),
        stGroup,
        physicalArea,
        scheduleArea,
        planner,
        resources,
        recipeGroups,
      };
    }

    const precedence = settingArray(settings, "planningModel.operationMappingPrecedence", ["OPERATION_CODE", "ST_OPERATION"]);
    const precedenceRank = new Map(precedence.map((x, i) => [key(x), i]));
    const mappingLinks = links
      .filter((x) => x.linkType === "OPERATION_TO_MAIN")
      .sort((a, b) => (precedenceRank.get(key(a.fromCategory)) ?? 999) - (precedenceRank.get(key(b.fromCategory)) ?? 999) || a.sortOrder - b.sortOrder);

    const operationMappings: Record<string, OperationPlanningMapping> = {};
    for (const link of mappingLinks) {
      const opKey = key(link.fromCode);
      if (!opKey || operationMappings[opKey]) continue;
      operationMappings[opKey] = {
        operationCode: link.fromCode,
        sourceCategory: link.fromCategory,
        mainOperation: mainOperations[key(link.toCode)] || null,
      };
    }

    return { items, links, settings, mainOperations, operationMappings };
  } catch {
    return { items: [], links: [], settings: {}, mainOperations: {}, operationMappings: {} };
  }
}

export function classifyOperationRoute(operationCodes: string[], model: PlanningModel): PlanningRouteClassification {
  const steps: PlanningRouteStep[] = operationCodes.map((sourceOperation) => {
    const mapping = model.operationMappings[key(sourceOperation)] || null;
    const main = mapping?.mainOperation || null;
    return {
      sourceOperation,
      mapped: Boolean(main),
      mainOperationCode: main?.code || null,
      mainOperationLabel: main?.label || null,
      planningOrder: main?.planningOrder ?? null,
      planningEnabled: main?.planningEnabled ?? false,
      scheduleEnabled: main?.scheduleEnabled ?? false,
      batchEnabled: main?.batchEnabled ?? false,
      color: main?.color || null,
      stGroup: main?.stGroup || null,
      physicalArea: main?.physicalArea || null,
      scheduleArea: main?.scheduleArea || null,
      planner: main?.planner || null,
      resources: main?.resources || [],
      recipeGroups: main?.recipeGroups || [],
    };
  });

  const collapseConsecutive = model.settings["planningModel.collapseConsecutiveMainOperations"] !== false;
  const remainingMainOperations: MainOperationDefinition[] = [];
  const remainingPlanningOperations: MainOperationDefinition[] = [];
  const seenUnmapped = new Set<string>();
  const unmappedOperations: string[] = [];
  let lastMain = "";
  let lastPlanning = "";

  for (const step of steps) {
    if (!step.mapped || !step.mainOperationCode) {
      const k = key(step.sourceOperation);
      if (k && !seenUnmapped.has(k)) {
        seenUnmapped.add(k);
        unmappedOperations.push(step.sourceOperation);
      }
      lastMain = "";
      lastPlanning = "";
      continue;
    }
    const main = model.mainOperations[key(step.mainOperationCode)];
    if (!main) {
      lastMain = "";
      lastPlanning = "";
      continue;
    }
    const mainKey = key(main.code);
    if (!collapseConsecutive || mainKey !== lastMain) remainingMainOperations.push(main);
    lastMain = mainKey;
    if (main.planningEnabled) {
      if (!collapseConsecutive || mainKey !== lastPlanning) remainingPlanningOperations.push(main);
      lastPlanning = mainKey;
    } else {
      lastPlanning = "";
    }
  }

  return {
    steps,
    mappedCount: steps.filter((x) => x.mapped).length,
    unmappedCount: steps.filter((x) => !x.mapped).length,
    nextMainOperation: remainingMainOperations[0] || null,
    nextPlanningOperation: remainingPlanningOperations[0] || null,
    remainingMainOperations,
    remainingPlanningOperations,
    unmappedOperations,
  };
}
