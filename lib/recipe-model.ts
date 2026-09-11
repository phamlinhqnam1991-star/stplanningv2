
import { query } from "@/lib/db";

type JsonMap = Record<string, unknown>;

export type RecipeDefinition = {
  code: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  recipeNo: string;
  recipeName: string;
  recipeGroup: string;
  area: string;
  paintType: string;
  defaultProcessTimeMinutes: number | null;
  temperatureC: string | number | null;
  stagesMinutes: Record<string, number | null>;
  aliases: string[];
  needsReview: boolean;
  sourceOnly: boolean;
  data: JsonMap;
};

export type SourceFieldDefinition = {
  code: string;
  label: string;
  sourceColumn: string;
  valueKind: string;
  unit: string;
  sourceHeader: string;
  needsReview: boolean;
  data: JsonMap;
};

export type RecipeConfigRule = {
  ruleType: "RECIPE" | "PROCESS_TIME";
  code: string;
  name: string;
  enabled: boolean;
  priority: number;
  condition: JsonMap;
  action: JsonMap;
  notes: string | null;
};

export type ProcessTimeProfile = {
  code: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  data: JsonMap;
};

export type RecipeModel = {
  recipes: RecipeDefinition[];
  recipeByCode: Map<string, RecipeDefinition>;
  recipeNameIndex: Map<string, RecipeDefinition[]>;
  recipeSourceFields: Record<string, SourceFieldDefinition>;
  processSourceFields: Record<string, SourceFieldDefinition>;
  processTimeProfiles: ProcessTimeProfile[];
  recipeRules: RecipeConfigRule[];
  processTimeRules: RecipeConfigRule[];
  settings: Record<string, unknown>;
};

export type RecipeSuggestion = {
  status: "MATCHED" | "SOURCE_ONLY" | "AMBIGUOUS" | "NO_VALUE" | "NO_RULE";
  ruleCode: string | null;
  selector: string | null;
  recipeNo: string | null;
  recipeName: string | null;
  recipeGroup: string | null;
  sourceField: string | null;
  sourceColumn: string | null;
  sourceValue: string | null;
  confidence: string | null;
  needsReview: boolean;
  candidates: Array<{ code: string; label: string }>;
  secondaryValues?: Array<{ sourceField: string; sourceValue: string }>;
};

export type ProcessTimeSuggestion = {
  status: "RESOLVED" | "REVIEW_REQUIRED" | "NO_RULE" | "NO_VALUE";
  ruleCode: string | null;
  mode: string | null;
  minutes: number | null;
  unit: string | null;
  sourceField: string | null;
  sourceValue: string | null;
  profile: string | null;
  needsReview: boolean;
  details?: JsonMap;
};

function record(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}
function str(value: unknown): string {
  return value == null ? "" : String(value);
}
function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function key(value: unknown): string {
  return str(value).trim().toUpperCase();
}
function normName(value: unknown): string {
  return str(value).trim().replace(/\s+/g, " ").toUpperCase();
}
function arrayStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).map((x) => x.trim()).filter(Boolean) : [];
}
function rawValue(rawRow: unknown, excelColumn: string): unknown {
  const row = record(rawRow);
  const cell = record(row[excelColumn]);
  return Object.prototype.hasOwnProperty.call(cell, "v") ? cell.v : null;
}
function sourceText(model: RecipeModel, rawRow: unknown, fieldCode: string): { field: SourceFieldDefinition | null; text: string } {
  const field = model.recipeSourceFields[key(fieldCode)] || model.processSourceFields[key(fieldCode)] || null;
  if (!field?.sourceColumn) return { field, text: "" };
  const value = rawValue(rawRow, field.sourceColumn);
  return { field, text: value == null ? "" : String(value).trim() };
}
function toRecipe(row: Record<string, unknown>): RecipeDefinition {
  const data = record(row.data);
  const stagesRaw = record(data.stagesMinutes);
  const stages: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(stagesRaw)) stages[k] = num(v);
  return {
    code: String(row.code),
    label: String(row.label),
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order || 0),
    recipeNo: str(data.recipeNo) || String(row.code),
    recipeName: str(data.recipeName) || String(row.label),
    recipeGroup: str(data.recipeGroup),
    area: str(data.area),
    paintType: str(data.paintType),
    defaultProcessTimeMinutes: num(data.defaultProcessTimeMinutes),
    temperatureC: data.temperatureC == null ? null : data.temperatureC as string | number,
    stagesMinutes: stages,
    aliases: arrayStrings(data.aliases),
    needsReview: bool(data.needsReview, false),
    sourceOnly: bool(data.sourceOnly, false),
    data,
  };
}
function toSourceField(row: Record<string, unknown>): SourceFieldDefinition {
  const data = record(row.data);
  return {
    code: String(row.code),
    label: String(row.label),
    sourceColumn: str(data.sourceColumn),
    valueKind: str(data.valueKind),
    unit: str(data.unit),
    sourceHeader: str(data.sourceHeader),
    needsReview: bool(data.needsReview, false),
    data,
  };
}
function toRule(row: Record<string, unknown>): RecipeConfigRule {
  return {
    ruleType: String(row.rule_type) as "RECIPE" | "PROCESS_TIME",
    code: String(row.code),
    name: String(row.name),
    enabled: Boolean(row.enabled),
    priority: Number(row.priority || 100),
    condition: record(row.condition_json),
    action: record(row.action_json),
    notes: row.notes == null ? null : String(row.notes),
  };
}
function matchesMain(condition: JsonMap, mainOperationCode: string | null): boolean {
  if (!mainOperationCode) return false;
  const main = key(mainOperationCode);
  const exact = str(condition.mainOperation);
  if (exact && key(exact) !== main) return false;
  const list = arrayStrings(condition.mainOperationIn);
  if (list.length && !list.some((x) => key(x) === main)) return false;
  return true;
}

export async function getRecipeModel(): Promise<RecipeModel> {
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
          SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rule_type, r.priority, r.code)
          FROM config_rules r
          WHERE r.rule_type = ANY($2::text[])
        ), '[]'::jsonb) AS rules,
        COALESCE((
          SELECT jsonb_object_agg(s.setting_key, s.value_json)
          FROM config_settings s
          WHERE s.enabled=true AND s.category = ANY($3::text[])
        ), '{}'::jsonb) AS settings`,
      [
        ["RECIPE","RECIPE_SOURCE_FIELD","PROCESS_TIME_SOURCE_FIELD","PROCESS_TIME_PROFILE"],
        ["RECIPE","PROCESS_TIME"],
        ["RECIPE_MODEL","PROCESS_TIME"],
      ]
    );
    const row = (result.rows[0] || {}) as Record<string, unknown>;
    const items = (Array.isArray(row.items) ? row.items : []) as Record<string, unknown>[];
    const rules = (Array.isArray(row.rules) ? row.rules : []) as Record<string, unknown>[];
    const recipes = items.filter((x) => x.category === "RECIPE").map(toRecipe);
    const recipeByCode = new Map<string, RecipeDefinition>();
    const recipeNameIndex = new Map<string, RecipeDefinition[]>();
    for (const recipe of recipes) {
      recipeByCode.set(key(recipe.code), recipe);
      const names = [recipe.label, recipe.recipeName, ...recipe.aliases, ...arrayStrings(recipe.data.sourceNames)];
      for (const name of names) {
        const n = normName(name);
        if (!n) continue;
        const arr = recipeNameIndex.get(n) || [];
        if (!arr.some((x) => key(x.code) === key(recipe.code))) arr.push(recipe);
        recipeNameIndex.set(n, arr);
      }
    }
    const recipeSourceFields: Record<string, SourceFieldDefinition> = {};
    const processSourceFields: Record<string, SourceFieldDefinition> = {};
    for (const item of items) {
      if (item.category !== "RECIPE_SOURCE_FIELD" && item.category !== "PROCESS_TIME_SOURCE_FIELD") continue;
      const field = toSourceField(item);
      if (item.category === "RECIPE_SOURCE_FIELD") recipeSourceFields[key(field.code)] = field;
      else processSourceFields[key(field.code)] = field;
    }
    const processTimeProfiles = items.filter((x) => x.category === "PROCESS_TIME_PROFILE").map((x) => ({
      code: String(x.code), label: String(x.label), enabled: Boolean(x.enabled), sortOrder: Number(x.sort_order || 0), data: record(x.data),
    }));
    const parsedRules = rules.map(toRule);
    return {
      recipes,
      recipeByCode,
      recipeNameIndex,
      recipeSourceFields,
      processSourceFields,
      processTimeProfiles,
      recipeRules: parsedRules.filter((x) => x.ruleType === "RECIPE"),
      processTimeRules: parsedRules.filter((x) => x.ruleType === "PROCESS_TIME"),
      settings: record(row.settings),
    };
  } catch {
    return {
      recipes: [], recipeByCode: new Map(), recipeNameIndex: new Map(), recipeSourceFields: {},
      processSourceFields: {}, processTimeProfiles: [], recipeRules: [], processTimeRules: [], settings: {},
    };
  }
}

function candidatesForName(model: RecipeModel, value: string): RecipeDefinition[] {
  return model.recipeNameIndex.get(normName(value)) || [];
}
function acceptedValue(action: JsonMap, value: string): boolean {
  if (!value) return false;
  const ignore = arrayStrings(action.ignoreValues).map(key);
  if (ignore.includes(key(value))) return false;
  const prefixes = arrayStrings(action.allowedPrefixes);
  if (prefixes.length && !prefixes.some((p) => key(value).startsWith(key(p)))) return false;
  return true;
}
function suggestionFromRecipe(recipe: RecipeDefinition, rule: RecipeConfigRule, sourceField: SourceFieldDefinition | null, sourceValue: string, action: JsonMap): RecipeSuggestion {
  return {
    status: recipe.sourceOnly ? "SOURCE_ONLY" : "MATCHED",
    ruleCode: rule.code,
    selector: str(action.selector),
    recipeNo: recipe.recipeNo || recipe.code,
    recipeName: recipe.recipeName || recipe.label,
    recipeGroup: recipe.recipeGroup || null,
    sourceField: sourceField?.code || null,
    sourceColumn: sourceField?.sourceColumn || null,
    sourceValue: sourceValue || null,
    confidence: str(action.confidence) || null,
    needsReview: recipe.needsReview || bool(action.needsReview, false),
    candidates: [],
  };
}
function sourceFields(action: JsonMap, keyName = "sourceFields"): string[] {
  return arrayStrings(action[keyName]);
}

export function resolveRecipe(mainOperationCode: string | null, rawRow: unknown, model: RecipeModel): RecipeSuggestion {
  const rules = model.recipeRules.filter((r) => r.enabled && matchesMain(r.condition, mainOperationCode)).sort((a,b) => a.priority-b.priority || a.code.localeCompare(b.code));
  if (!rules.length) {
    return { status:"NO_RULE", ruleCode:null, selector:null, recipeNo:null, recipeName:null, recipeGroup:null, sourceField:null, sourceColumn:null, sourceValue:null, confidence:null, needsReview:false, candidates:[] };
  }
  const rule = rules[0];
  const action = rule.action;
  const selector = str(action.selector);

  if (selector === "STATIC_CODE") {
    const code = str(action.recipeNo);
    const recipe = model.recipeByCode.get(key(code));
    if (recipe) return suggestionFromRecipe(recipe, rule, null, code, action);
    return { status:"SOURCE_ONLY", ruleCode:rule.code, selector, recipeNo:code || null, recipeName:null, recipeGroup:null, sourceField:null, sourceColumn:null, sourceValue:code || null, confidence:str(action.confidence)||null, needsReview:true, candidates:[] };
  }

  if (selector === "SOURCE_IDENTIFIER") {
    const fieldCode = sourceFields(action)[0] || "";
    const src = sourceText(model, rawRow, fieldCode);
    if (!acceptedValue(action, src.text)) return { status:"NO_VALUE", ruleCode:rule.code, selector, recipeNo:null, recipeName:null, recipeGroup:null, sourceField:src.field?.code||fieldCode||null, sourceColumn:src.field?.sourceColumn||null, sourceValue:null, confidence:str(action.confidence)||null, needsReview:false, candidates:[] };
    return { status:"SOURCE_ONLY", ruleCode:rule.code, selector, recipeNo:null, recipeName:src.text, recipeGroup:null, sourceField:src.field?.code||fieldCode, sourceColumn:src.field?.sourceColumn||null, sourceValue:src.text, confidence:str(action.confidence)||null, needsReview:false, candidates:[] };
  }

  const fields = sourceFields(action);
  let selected: { field: SourceFieldDefinition | null; text: string } | null = null;
  for (const fieldCode of fields) {
    const src = sourceText(model, rawRow, fieldCode);
    if (acceptedValue(action, src.text)) { selected = src; break; }
  }
  if (!selected) {
    const fallback = str(action.fallbackRecipeNo);
    if (fallback) {
      const recipe = model.recipeByCode.get(key(fallback));
      if (recipe) return suggestionFromRecipe(recipe, rule, null, fallback, action);
    }
    return { status:"NO_VALUE", ruleCode:rule.code, selector, recipeNo:null, recipeName:null, recipeGroup:null, sourceField:fields[0]||null, sourceColumn:fields[0] ? model.recipeSourceFields[key(fields[0])]?.sourceColumn || null : null, sourceValue:null, confidence:str(action.confidence)||null, needsReview:bool(action.needsReview,false), candidates:[] };
  }

  if (selector === "SOURCE_NAME") {
    const matches = candidatesForName(model, selected.text);
    if (matches.length === 1) return suggestionFromRecipe(matches[0], rule, selected.field, selected.text, action);
    if (matches.length > 1) return {
      status:"AMBIGUOUS", ruleCode:rule.code, selector, recipeNo:null, recipeName:selected.text, recipeGroup:null,
      sourceField:selected.field?.code||null, sourceColumn:selected.field?.sourceColumn||null, sourceValue:selected.text,
      confidence:str(action.confidence)||null, needsReview:true, candidates:matches.map((x)=>({code:x.code,label:x.label})),
    };
    const fallback = str(action.fallbackRecipeNo);
    const fallbackRecipe = fallback ? model.recipeByCode.get(key(fallback)) : null;
    if (fallbackRecipe) return suggestionFromRecipe(fallbackRecipe, rule, selected.field, selected.text, action);
    return { status:"SOURCE_ONLY", ruleCode:rule.code, selector, recipeNo:null, recipeName:selected.text, recipeGroup:null, sourceField:selected.field?.code||null, sourceColumn:selected.field?.sourceColumn||null, sourceValue:selected.text, confidence:str(action.confidence)||null, needsReview:true, candidates:[] };
  }

  if (selector === "SOURCE_CODE_LIST") {
    const splitPattern = str(action.splitPattern) || "\\s*/\\s*";
    let values: string[] = [];
    try { values = selected.text.split(new RegExp(splitPattern, "g")).map((x)=>x.trim()).filter(Boolean); } catch { values = [selected.text]; }
    const first = values[0] || "";
    const recipe = model.recipeByCode.get(key(first));
    const base = recipe ? suggestionFromRecipe(recipe, rule, selected.field, first, action) : {
      status:"SOURCE_ONLY" as const, ruleCode:rule.code, selector, recipeNo:first || null, recipeName:null, recipeGroup:null,
      sourceField:selected.field?.code||null, sourceColumn:selected.field?.sourceColumn||null, sourceValue:first || null,
      confidence:str(action.confidence)||null, needsReview:bool(action.needsReview,false), candidates:[],
    };
    return { ...base, secondaryValues: values.slice(1).map((x)=>({sourceField:selected!.field?.code||"",sourceValue:x})) };
  }

  // SOURCE_CODE / FIRST_SOURCE_CODE both resolve a source value as Recipe No.
  const recipe = model.recipeByCode.get(key(selected.text));
  if (recipe) {
    const resolved = suggestionFromRecipe(recipe, rule, selected.field, selected.text, action);
    const secondary = sourceFields(action, "secondarySourceFields");
    if (secondary.length) resolved.secondaryValues = secondary.map((f) => ({ sourceField:f, sourceValue:sourceText(model,rawRow,f).text })).filter((x)=>x.sourceValue);
    return resolved;
  }
  return {
    status:"SOURCE_ONLY", ruleCode:rule.code, selector, recipeNo:selected.text, recipeName:null, recipeGroup:null,
    sourceField:selected.field?.code||null, sourceColumn:selected.field?.sourceColumn||null, sourceValue:selected.text,
    confidence:str(action.confidence)||null, needsReview:true, candidates:[],
  };
}

export function resolveProcessTime(
  mainOperationCode: string | null,
  rawRow: unknown,
  recipe: RecipeSuggestion,
  model: RecipeModel
): ProcessTimeSuggestion {
  const explicit = model.processTimeRules
    .filter((r) => r.enabled && matchesMain(r.condition, mainOperationCode) && str(r.action.mode) !== "RECIPE_DEFAULT_MINUTES")
    .sort((a,b)=>a.priority-b.priority || a.code.localeCompare(b.code));
  for (const rule of explicit) {
    const action = rule.action;
    const mode = str(action.mode);
    if (mode === "SOURCE_COLUMN") {
      const fieldCode = str(action.sourceField);
      const src = sourceText(model, rawRow, fieldCode);
      const minutes = num(src.text);
      if (minutes == null) continue;
      return {
        status:"RESOLVED", ruleCode:rule.code, mode, minutes,
        unit:str(action.unit)||src.field?.unit||null, sourceField:src.field?.code||fieldCode||null,
        sourceValue:src.text||null, profile:str(action.profile)||null, needsReview:bool(action.needsReview,false)||Boolean(src.field?.needsReview),
      };
    }
    return {
      status:"REVIEW_REQUIRED", ruleCode:rule.code, mode, minutes:null, unit:str(action.unit)||null,
      sourceField:null, sourceValue:null, profile:str(action.profile)||null, needsReview:true, details:action,
    };
  }

  const defaultRule = model.processTimeRules
    .filter((r) => r.enabled && str(r.action.mode) === "RECIPE_DEFAULT_MINUTES")
    .sort((a,b)=>a.priority-b.priority || a.code.localeCompare(b.code))[0] || null;
  if (defaultRule && recipe.recipeNo) {
    const def = model.recipeByCode.get(key(recipe.recipeNo));
    if (def?.defaultProcessTimeMinutes != null) {
      return {
        status:"RESOLVED", ruleCode:defaultRule.code, mode:"RECIPE_DEFAULT_MINUTES",
        minutes:def.defaultProcessTimeMinutes, unit:"MINUTE", sourceField:null, sourceValue:null,
        profile:str(defaultRule.action.profile)||"RECIPE_DEFAULT_FIXED", needsReview:def.needsReview||bool(defaultRule.action.needsReview,false),
      };
    }
  }
  return { status:"NO_RULE", ruleCode:null, mode:null, minutes:null, unit:null, sourceField:null, sourceValue:null, profile:null, needsReview:false };
}
