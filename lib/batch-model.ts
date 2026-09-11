import { query } from "@/lib/db";
import type { MainOperationDefinition } from "@/lib/planning-model";
import type { RecipeSuggestion, ProcessTimeSuggestion } from "@/lib/recipe-model";

type JsonMap = Record<string, unknown>;

export type BatchKeyFieldDefinition = {
  code: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  sourceKind: "BUILTIN" | "RAW_COLUMN";
  builtInField: string | null;
  sourceColumn: string | null;
  data: JsonMap;
};

export type BatchConfigRule = {
  code: string;
  name: string;
  enabled: boolean;
  priority: number;
  condition: JsonMap;
  action: JsonMap;
  notes: string | null;
};

export type BatchModel = {
  keyFields: Record<string, BatchKeyFieldDefinition>;
  keyFieldList: BatchKeyFieldDefinition[];
  rules: BatchConfigRule[];
  statuses: Array<{ code: string; label: string; sortOrder: number; data: JsonMap }>;
  settings: Record<string, unknown>;
};

export type CandidateBatchContext = {
  planningJobId: number;
  jobNum: string;
  program: string | null;
  partCluster: string | null;
  part: string | null;
  revision: string | null;
  nextOperation: string | null;
  nextStOperation: string | null;
  mainOperation: MainOperationDefinition | null;
  recipe: RecipeSuggestion;
  processTime: ProcessTimeSuggestion;
  qty: number | null;
  surfaceDm2: number | null;
  rawRow: unknown;
};

export type BatchProposal = {
  eligible: boolean;
  eligibilityReason: string | null;
  ruleCode: string | null;
  batchKey: string | null;
  keyParts: Array<{ fieldCode: string; label: string; value: string }>;
  keyFields: string[];
  delimiter: string;
  maxJobs: number | null;
  maxQty: number | null;
  maxSurfaceDm2: number | null;
  processTimeAggregation: string;
  allowManualKey: boolean;
  warnings: string[];
};

function record(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}
function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}
function key(value: unknown): string {
  return str(value).toUpperCase();
}
function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function arrayStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter(Boolean) : [];
}
function rawValue(rawRow: unknown, excelColumn: string | null): string {
  if (!excelColumn) return "";
  const row = record(rawRow);
  const cell = record(row[excelColumn]);
  return Object.prototype.hasOwnProperty.call(cell, "v") ? str(cell.v) : "";
}
function setting<T>(settings: Record<string, unknown>, name: string, fallback: T): T {
  return Object.prototype.hasOwnProperty.call(settings, name) ? settings[name] as T : fallback;
}

export async function getBatchModel(): Promise<BatchModel> {
  try {
    const result = await query(`
      SELECT
        COALESCE((
          SELECT jsonb_agg(to_jsonb(i) ORDER BY i.category, i.sort_order, i.code)
          FROM config_items i
          WHERE i.enabled=true AND i.category = ANY($1::text[])
        ), '[]'::jsonb) AS items,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(r) ORDER BY r.priority, r.code)
          FROM config_rules r
          WHERE r.rule_type='BATCH'
        ), '[]'::jsonb) AS rules,
        COALESCE((
          SELECT jsonb_object_agg(s.setting_key, s.value_json)
          FROM config_settings s
          WHERE s.enabled=true AND s.category='BATCH_MODEL'
        ), '{}'::jsonb) AS settings`,
      [["BATCH_KEY_FIELD", "BATCH_STATUS"]]
    );
    const row = (result.rows[0] || {}) as Record<string, unknown>;
    const items = (Array.isArray(row.items) ? row.items : []) as Record<string, unknown>[];
    const rules = (Array.isArray(row.rules) ? row.rules : []) as Record<string, unknown>[];
    const keyFieldList: BatchKeyFieldDefinition[] = items
      .filter((x) => x.category === "BATCH_KEY_FIELD")
      .map((x) => {
        const data = record(x.data);
        return {
          code: String(x.code),
          label: String(x.label),
          enabled: Boolean(x.enabled),
          sortOrder: Number(x.sort_order || 0),
          sourceKind: key(data.sourceKind) === "RAW_COLUMN" ? "RAW_COLUMN" : "BUILTIN",
          builtInField: str(data.builtInField) || null,
          sourceColumn: str(data.sourceColumn) || null,
          data,
        };
      });
    const keyFields: Record<string, BatchKeyFieldDefinition> = {};
    for (const field of keyFieldList) keyFields[key(field.code)] = field;
    return {
      keyFields,
      keyFieldList,
      rules: rules.map((r) => ({
        code: String(r.code), name: String(r.name), enabled: Boolean(r.enabled), priority: Number(r.priority || 100),
        condition: record(r.condition_json), action: record(r.action_json), notes: r.notes == null ? null : String(r.notes),
      })),
      statuses: items.filter((x) => x.category === "BATCH_STATUS").map((x) => ({
        code: String(x.code), label: String(x.label), sortOrder: Number(x.sort_order || 0), data: record(x.data),
      })),
      settings: record(row.settings),
    };
  } catch {
    return { keyFields: {}, keyFieldList: [], rules: [], statuses: [], settings: {} };
  }
}

function conditionMatches(condition: JsonMap, ctx: CandidateBatchContext): boolean {
  const main = key(ctx.mainOperation?.code);
  const recipe = key(ctx.recipe.recipeNo);
  const exactMain = key(condition.mainOperation);
  if (exactMain && exactMain !== main) return false;
  const mainList = arrayStrings(condition.mainOperationIn).map(key);
  if (mainList.length && !mainList.includes(main)) return false;
  const exactRecipe = key(condition.recipeNo);
  if (exactRecipe && exactRecipe !== recipe) return false;
  const recipeRequired = bool(condition.recipeRequired, false);
  if (recipeRequired && !recipe) return false;
  return true;
}

function builtInValue(field: string, ctx: CandidateBatchContext): string {
  switch (key(field)) {
    case "MAIN_OPERATION": return ctx.mainOperation?.code || "";
    case "MAIN_OPERATION_LABEL": return ctx.mainOperation?.label || "";
    case "RECIPE_NO": return ctx.recipe.recipeNo || ctx.recipe.sourceValue || "";
    case "RECIPE_NAME": return ctx.recipe.recipeName || ctx.recipe.sourceValue || "";
    case "PROGRAM": return ctx.program || "";
    case "PART_CLUSTER": return ctx.partCluster || "";
    case "PART": return ctx.part || "";
    case "REVISION": return ctx.revision || "";
    case "JOB_NUM": return ctx.jobNum || "";
    case "NEXT_OPERATION": return ctx.nextOperation || "";
    case "NEXT_ST_OPERATION": return ctx.nextStOperation || "";
    case "PLANNER": return ctx.mainOperation?.planner?.code || "";
    case "SCHEDULE_AREA": return ctx.mainOperation?.scheduleArea?.code || "";
    case "PHYSICAL_AREA": return ctx.mainOperation?.physicalArea?.code || "";
    case "ST_GROUP": return ctx.mainOperation?.stGroup?.code || "";
    case "PROCESS_TIME_MINUTES": return ctx.processTime.minutes == null ? "" : String(ctx.processTime.minutes);
    default: return "";
  }
}

function resolveField(fieldCode: string, ctx: CandidateBatchContext, model: BatchModel): { label: string; value: string } {
  const def = model.keyFields[key(fieldCode)];
  if (!def) return { label: fieldCode, value: builtInValue(fieldCode, ctx) };
  if (def.sourceKind === "RAW_COLUMN") return { label: def.label, value: rawValue(ctx.rawRow, def.sourceColumn) };
  return { label: def.label, value: builtInValue(def.builtInField || def.code, ctx) };
}

export function resolveBatchProposal(ctx: CandidateBatchContext, model: BatchModel): BatchProposal {
  const allowManualKey = bool(setting(model.settings, "batchModel.manualKeyAllowed", true), true);
  if (!ctx.mainOperation) {
    return { eligible:false, eligibilityReason:"No mapped Planning Operation.", ruleCode:null, batchKey:null, keyParts:[], keyFields:[], delimiter:"|", maxJobs:null, maxQty:null, maxSurfaceDm2:null, processTimeAggregation:"MAX", allowManualKey, warnings:["MAIN_OPERATION_UNMAPPED"] };
  }
  if (!ctx.mainOperation.batchEnabled) {
    return { eligible:false, eligibilityReason:"Batch is disabled for this Main Operation.", ruleCode:null, batchKey:null, keyParts:[], keyFields:[], delimiter:"|", maxJobs:null, maxQty:null, maxSurfaceDm2:null, processTimeAggregation:"MAX", allowManualKey, warnings:["BATCH_DISABLED"] };
  }
  const rules = model.rules.filter((r) => r.enabled && conditionMatches(r.condition, ctx)).sort((a,b) => a.priority-b.priority || a.code.localeCompare(b.code));
  const rule = rules[0] || null;
  const action = rule?.action || {};
  const keyFields = arrayStrings(action.keyFields).length
    ? arrayStrings(action.keyFields)
    : arrayStrings(setting(model.settings, "batchModel.defaultKeyFields", ["MAIN_OPERATION","RECIPE_NO"]));
  const delimiter = str(action.delimiter) || str(setting(model.settings, "batchModel.defaultDelimiter", "|")) || "|";
  const parts = keyFields.map((fieldCode) => {
    const resolved = resolveField(fieldCode, ctx, model);
    return { fieldCode, label: resolved.label, value: resolved.value };
  });
  const ignoreEmpty = bool(action.ignoreEmptyKeyParts, true);
  const keyValues = parts.filter((p) => !ignoreEmpty || p.value !== "").map((p) => p.value);
  const warnings: string[] = [];
  if (!ctx.recipe.recipeNo && !ctx.recipe.recipeName && keyFields.some((x) => key(x).startsWith("RECIPE"))) warnings.push("RECIPE_MISSING");
  if (ctx.recipe.needsReview) warnings.push("RECIPE_REVIEW");
  if (ctx.processTime.needsReview || ctx.processTime.status === "REVIEW_REQUIRED") warnings.push("PROCESS_TIME_REVIEW");
  const requireRecipe = bool(action.requireRecipe, false);
  if (requireRecipe && !ctx.recipe.recipeNo && !ctx.recipe.recipeName) {
    return { eligible:false, eligibilityReason:"Recipe is required by the Batch Rule.", ruleCode:rule?.code||null, batchKey:keyValues.join(delimiter)||null, keyParts:parts, keyFields, delimiter, maxJobs:num(action.maxJobs), maxQty:num(action.maxQty), maxSurfaceDm2:num(action.maxSurfaceDm2), processTimeAggregation:str(action.processTimeAggregation)||"MAX", allowManualKey, warnings };
  }
  const blockReview = bool(action.blockReviewCandidates, false);
  if (blockReview && warnings.length) {
    return { eligible:false, eligibilityReason:"Candidate requires review and the Batch Rule blocks review items.", ruleCode:rule?.code||null, batchKey:keyValues.join(delimiter)||null, keyParts:parts, keyFields, delimiter, maxJobs:num(action.maxJobs), maxQty:num(action.maxQty), maxSurfaceDm2:num(action.maxSurfaceDm2), processTimeAggregation:str(action.processTimeAggregation)||"MAX", allowManualKey, warnings };
  }
  return {
    eligible:true,
    eligibilityReason:null,
    ruleCode:rule?.code||null,
    batchKey:keyValues.join(delimiter) || ctx.mainOperation.code,
    keyParts:parts,
    keyFields,
    delimiter,
    maxJobs:num(action.maxJobs),
    maxQty:num(action.maxQty),
    maxSurfaceDm2:num(action.maxSurfaceDm2),
    processTimeAggregation:str(action.processTimeAggregation) || str(setting(model.settings,"batchModel.defaultProcessTimeAggregation","MAX")) || "MAX",
    allowManualKey,
    warnings,
  };
}

export function aggregateProcessTime(minutes: Array<number | null>, mode: string): number | null {
  const values = minutes.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!values.length) return null;
  switch (key(mode)) {
    case "SUM": return values.reduce((a,b)=>a+b,0);
    case "MIN": return Math.min(...values);
    case "FIRST": return values[0];
    case "MAX":
    default: return Math.max(...values);
  }
}

export function batchNumberPattern(model: BatchModel): string {
  return str(setting(model.settings,"batchModel.batchNumberPattern","{SHORT}_{YYYYMMDD}_{SEQ3}")) || "{SHORT}_{YYYYMMDD}_{SEQ3}";
}
