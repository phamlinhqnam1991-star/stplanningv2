
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

export type ProcessTimeContext = {
  operationCode?: string | null;
  qty?: number | null;
  surfaceDm2?: number | null;
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
function setting<T>(settings: Record<string, unknown>, name: string, fallback: T): T {
  return Object.prototype.hasOwnProperty.call(settings, name) ? settings[name] as T : fallback;
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
    const acceptSourceOnly = bool(setting(model.settings, "recipeModel.acceptSourceOnlyRecipeCodes", false), false);
    return { status:"SOURCE_ONLY", ruleCode:rule.code, selector, recipeNo:code || null, recipeName:null, recipeGroup:null, sourceField:null, sourceColumn:null, sourceValue:code || null, confidence:str(action.confidence)||"BASELINE_AUTO", needsReview:!acceptSourceOnly, candidates:[] };
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
    if (matches.length > 1) {
      const policy = key(setting(model.settings, "recipeModel.ambiguousNamePolicy", "REVIEW"));
      if (policy === "LOWEST_RECIPE_NO") {
        const chosen = [...matches].sort((a,b)=>{
          const an=Number(a.recipeNo), bn=Number(b.recipeNo);
          if (Number.isFinite(an) && Number.isFinite(bn) && an!==bn) return an-bn;
          return a.recipeNo.localeCompare(b.recipeNo, undefined, { numeric:true, sensitivity:"base" });
        })[0];
        const out = suggestionFromRecipe(chosen, rule, selected.field, selected.text, action);
        return { ...out, status:"MATCHED", needsReview:false, confidence:"BASELINE_AUTO", candidates:matches.map((x)=>({code:x.code,label:x.label})) };
      }
      return {
        status:"AMBIGUOUS", ruleCode:rule.code, selector, recipeNo:null, recipeName:selected.text, recipeGroup:null,
        sourceField:selected.field?.code||null, sourceColumn:selected.field?.sourceColumn||null, sourceValue:selected.text,
        confidence:str(action.confidence)||null, needsReview:true, candidates:matches.map((x)=>({code:x.code,label:x.label})),
      };
    }
    const fallback = str(action.fallbackRecipeNo);
    const fallbackRecipe = fallback ? model.recipeByCode.get(key(fallback)) : null;
    if (fallbackRecipe) return suggestionFromRecipe(fallbackRecipe, rule, selected.field, selected.text, action);
    const acceptSourceOnly = bool(setting(model.settings, "recipeModel.acceptSourceOnlyRecipeCodes", false), false);
    return { status:"SOURCE_ONLY", ruleCode:rule.code, selector, recipeNo:null, recipeName:selected.text, recipeGroup:null, sourceField:selected.field?.code||null, sourceColumn:selected.field?.sourceColumn||null, sourceValue:selected.text, confidence:str(action.confidence)||"BASELINE_AUTO", needsReview:!acceptSourceOnly, candidates:[] };
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
  const acceptSourceOnly = bool(setting(model.settings, "recipeModel.acceptSourceOnlyRecipeCodes", false), false);
  return {
    status:"SOURCE_ONLY", ruleCode:rule.code, selector, recipeNo:selected.text, recipeName:null, recipeGroup:null,
    sourceField:selected.field?.code||null, sourceColumn:selected.field?.sourceColumn||null, sourceValue:selected.text,
    confidence:str(action.confidence)||"BASELINE_AUTO", needsReview:!acceptSourceOnly, candidates:[],
  };
}

export function resolveProcessTime(
  mainOperationCode: string | null,
  rawRow: unknown,
  recipe: RecipeSuggestion,
  model: RecipeModel,
  context: ProcessTimeContext = {},
): ProcessTimeSuggestion {
  const operationCode = key(context.operationCode);
  const qty = Math.max(0, num(context.qty) ?? 0);
  const surfaceDm2 = Math.max(0, num(context.surfaceDm2) ?? 0);

  const conditionMatches = (condition: JsonMap) => {
    if (!matchesMain(condition, mainOperationCode)) return false;
    const exactOperation = key(condition.operationCode);
    if (exactOperation && exactOperation !== operationCode) return false;
    const operationList = arrayStrings(condition.operationCodeIn).map(key);
    if (operationList.length && !operationList.includes(operationCode)) return false;
    return true;
  };

  const minutesFromUnit = (value: number, unit: string) => {
    const u = key(unit);
    if (u === "HOUR" || u === "HOURS" || u === "HR" || u === "H") return value * 60;
    return value;
  };

  const resolved = (rule: RecipeConfigRule, mode: string, minutes: number, extra: JsonMap = {}): ProcessTimeSuggestion => ({
    status: "RESOLVED",
    ruleCode: rule.code,
    mode,
    minutes: Math.max(0, Math.round(minutes * 100) / 100),
    unit: "MINUTE",
    sourceField: str(extra.sourceField) || null,
    sourceValue: str(extra.sourceValue) || null,
    profile: str(rule.action.profile) || null,
    needsReview: bool(rule.action.needsReview, false),
    details: { ...extra, assumption: bool(rule.action.assumption, false), sourceBasis: str(rule.action.sourceBasis) || undefined },
  });

  const evaluate = (rule: RecipeConfigRule): ProcessTimeSuggestion | null => {
    const action = rule.action;
    const mode = key(action.mode);
    if (mode === "SOURCE_COLUMN") {
      const fieldCode = str(action.sourceField);
      const src = sourceText(model, rawRow, fieldCode);
      const value = num(src.text);
      if (value == null) return null;
      const minutes = minutesFromUnit(value, str(action.unit) || src.field?.unit || "MINUTE");
      return resolved(rule, mode, minutes, { sourceField: src.field?.code || fieldCode, sourceValue: src.text, rawValue: value });
    }
    if (mode === "SOURCE_BATCH_MINUTES") {
      const fieldCode = str(action.sourceField);
      const batchSizeField = str(action.batchSizeField);
      const src = sourceText(model, rawRow, fieldCode);
      const batchSrc = batchSizeField ? sourceText(model, rawRow, batchSizeField) : { field: null, text: "" };
      const perBatch = num(src.text);
      if (perBatch == null) return null;
      const batchSize = Math.max(1, num(batchSrc.text) ?? (qty || 1));
      const cycles = Math.max(1, Math.ceil((qty || batchSize) / batchSize));
      const minutes = minutesFromUnit(perBatch, str(action.unit) || src.field?.unit || "MINUTE") * cycles;
      return resolved(rule, mode, minutes, { sourceField: src.field?.code || fieldCode, sourceValue: src.text, batchSizeField: batchSrc.field?.code || batchSizeField, batchSize, cycles });
    }
    if (mode === "SOURCE_MINUTES_PER_PIECE" || mode === "SOURCE_MINUTES_PER_PIECE_FIELDS") {
      const fields = arrayStrings(action.sourceFields);
      if (!fields.length && str(action.sourceField)) fields.push(str(action.sourceField));
      const values = fields.map((fieldCode) => {
        const src = sourceText(model, rawRow, fieldCode);
        return { fieldCode, src, value: num(src.text) };
      }).filter((x) => x.value != null) as Array<{ fieldCode: string; src: { field: SourceFieldDefinition | null; text: string }; value: number }>;
      let standard = values[0] || null;
      if (values.length > 1) {
        const selector = key(action.sourceValueSelector) || "MAX";
        if (selector === "MIN") standard = values.reduce((a,b)=>a.value<=b.value?a:b);
        else if (selector === "FIRST") standard = values[0];
        else if (selector === "AVERAGE") {
          const average = values.reduce((sum,x)=>sum+x.value,0)/values.length;
          standard = { fieldCode: values.map(x=>x.fieldCode).join(","), src: { field:null, text:String(average) }, value: average };
        } else standard = values.reduce((a,b)=>a.value>=b.value?a:b);
      }
      let minPerPiece = standard?.value ?? num(action.fallbackMinutesPerPiece);
      if (minPerPiece == null) return null;
      const operators = Math.max(1, num(action.operators) ?? 1);
      const effectiveQty = Math.max(1, qty || num(action.defaultQty) || 1);
      const setupMinutes = Math.max(0, num(action.setupMinutes) ?? 0);
      const minutes = setupMinutes + (minPerPiece * effectiveQty) / operators;
      return resolved(rule, mode, minutes, { sourceField: standard?.src.field?.code || standard?.fieldCode || null, sourceValue: standard?.src.text || String(minPerPiece), minutesPerPiece: minPerPiece, qty: effectiveQty, operators, setupMinutes });
    }
    if (mode === "FIXED_MINUTES_PER_PIECE") {
      const minPerPiece = num(action.minutesPerPiece);
      if (minPerPiece == null) return null;
      const operators = Math.max(1, num(action.operators) ?? 1);
      const effectiveQty = Math.max(1, qty || num(action.defaultQty) || 1);
      const setupMinutes = Math.max(0, num(action.setupMinutes) ?? 0);
      return resolved(rule, mode, setupMinutes + (minPerPiece * effectiveQty) / operators, { minutesPerPiece: minPerPiece, qty: effectiveQty, operators, setupMinutes });
    }
    if (mode === "SOURCE_QTY_BREAKPOINTS") {
      const points = (Array.isArray(action.breakpoints) ? action.breakpoints : []).map((entry) => {
        const item = record(entry);
        const pointQty = num(item.qty);
        const fieldCode = str(item.sourceField);
        const src = fieldCode ? sourceText(model, rawRow, fieldCode) : { field:null, text:"" };
        const pointMinutes = num(src.text);
        return pointQty != null && pointMinutes != null ? { qty: pointQty, minutes: pointMinutes, fieldCode, sourceValue: src.text } : null;
      }).filter((x): x is { qty:number; minutes:number; fieldCode:string; sourceValue:string } => Boolean(x)).sort((a,b)=>a.qty-b.qty);
      if (!points.length) return null;
      const batchSizeField = str(action.batchSizeField);
      const batchSource = batchSizeField ? sourceText(model, rawRow, batchSizeField) : { field:null, text:"" };
      const configuredBatch = num(batchSource.text);
      const batchSize = Math.max(1, configuredBatch ?? points[points.length-1].qty);
      const totalQty = Math.max(1, qty || batchSize);
      const estimateCycle = (cycleQty: number) => {
        const upper = points.find((x)=>x.qty>=cycleQty);
        if (upper) return upper.minutes;
        const last = points[points.length-1];
        return last.minutes * Math.max(1, cycleQty / last.qty);
      };
      let remaining = totalQty;
      let minutes = 0;
      let cycles = 0;
      while (remaining > 0 && cycles < 10000) {
        const cycleQty = Math.min(batchSize, remaining);
        minutes += estimateCycle(cycleQty);
        remaining -= cycleQty;
        cycles += 1;
      }
      return resolved(rule, mode, minutes, { qty: totalQty, batchSize, cycles, availableBreakpoints: points.map(x=>({qty:x.qty,minutes:x.minutes,sourceField:x.fieldCode})) });
    }
    if (mode === "RECIPE_PLUS_OVERHEAD") {
      const recipeDef = recipe.recipeNo ? model.recipeByCode.get(key(recipe.recipeNo)) : null;
      const recipeMinutes = recipeDef?.defaultProcessTimeMinutes;
      if (recipeMinutes == null) return null;
      const tierMinutes = (specRaw: unknown) => {
        const spec = record(specRaw);
        const tiers = Array.isArray(spec.tiers) ? spec.tiers.map(record) : [];
        const tier = tiers.find((x) => {
          const qtyMin=num(x.qtyMin), qtyMax=num(x.qtyMax), surfaceMin=num(x.surfaceMinDm2), surfaceMax=num(x.surfaceMaxDm2);
          if (qtyMin!=null && qty<qtyMin) return false;
          if (qtyMax!=null && qty>qtyMax) return false;
          if (surfaceMin!=null && surfaceDm2<surfaceMin) return false;
          if (surfaceMax!=null && surfaceDm2>surfaceMax) return false;
          return true;
        });
        return num(tier?.minutes) ?? num(spec.defaultMinutes) ?? 0;
      };
      const loading = tierMinutes(action.loading);
      const unloading = tierMinutes(action.unloading);
      const normRecipe = (value: unknown) => {
        const x=str(value).trim();
        return /^\d+$/.test(x) ? String(Number(x)) : key(x);
      };
      const ndtRecipes = arrayStrings(action.ndtRecipeNos).map(normRecipe);
      const ndt = ndtRecipes.includes(normRecipe(recipe.recipeNo)) ? Math.max(0, num(action.ndtMinutes) ?? 0) : 0;
      return resolved(rule, mode, recipeMinutes + loading + unloading + ndt, { recipeMinutes, loadingMinutes:loading, unloadingMinutes:unloading, ndtMinutes:ndt, qty, surfaceDm2, recipeNo:recipe.recipeNo });
    }
    if (mode === "QTY_SURFACE_TIERS") {
      const tiers = Array.isArray(action.tiers) ? action.tiers.map(record) : [];
      const matches = (tier: JsonMap) => {
        const qtyMin = num(tier.qtyMin), qtyMax = num(tier.qtyMax), surfaceMin = num(tier.surfaceMinDm2), surfaceMax = num(tier.surfaceMaxDm2);
        if (qtyMin != null && qty < qtyMin) return false;
        if (qtyMax != null && qty > qtyMax) return false;
        if (surfaceMin != null && surfaceDm2 < surfaceMin) return false;
        if (surfaceMax != null && surfaceDm2 > surfaceMax) return false;
        return true;
      };
      const tier = tiers.find(matches) || null;
      const minutes = num(tier?.minutes) ?? num(action.defaultMinutes);
      if (minutes == null) return null;
      return resolved(rule, mode, minutes, { qty, surfaceDm2, matchedTier: tier || null });
    }
    if (mode === "FIXED_MINUTES") {
      const minutes = num(action.minutes);
      if (minutes == null) return null;
      return resolved(rule, mode, minutes, { qty, surfaceDm2 });
    }
    return {
      status:"REVIEW_REQUIRED", ruleCode:rule.code, mode, minutes:null, unit:str(action.unit)||null,
      sourceField:null, sourceValue:null, profile:str(action.profile)||null, needsReview:true, details:action,
    };
  };

  const matching = model.processTimeRules
    .filter((r) => r.enabled && conditionMatches(r.condition))
    .sort((a,b)=>a.priority-b.priority || a.code.localeCompare(b.code));

  const primary = matching.filter((r) => key(r.action.mode) !== "RECIPE_DEFAULT_MINUTES" && !bool(r.action.fallbackOnly, false));
  for (const rule of primary) {
    const result = evaluate(rule);
    if (result) return result;
  }

  const defaultRule = matching.find((r) => key(r.action.mode) === "RECIPE_DEFAULT_MINUTES")
    || model.processTimeRules.filter((r)=>r.enabled && key(r.action.mode)==="RECIPE_DEFAULT_MINUTES").sort((a,b)=>a.priority-b.priority||a.code.localeCompare(b.code))[0]
    || null;
  if (defaultRule && recipe.recipeNo) {
    const def = model.recipeByCode.get(key(recipe.recipeNo));
    if (def?.defaultProcessTimeMinutes != null) {
      return {
        status:"RESOLVED", ruleCode:defaultRule.code, mode:"RECIPE_DEFAULT_MINUTES",
        minutes:def.defaultProcessTimeMinutes, unit:"MINUTE", sourceField:null, sourceValue:null,
        profile:str(defaultRule.action.profile)||"RECIPE_DEFAULT_FIXED", needsReview:def.needsReview||bool(defaultRule.action.needsReview,false),
        details:{ sourceBasis:"STRecipe.Duration", assumption:false },
      };
    }
  }

  const fallback = matching.filter((r) => bool(r.action.fallbackOnly, false));
  for (const rule of fallback) {
    const result = evaluate(rule);
    if (result) return result;
  }

  return { status:"NO_RULE", ruleCode:null, mode:null, minutes:null, unit:null, sourceField:null, sourceValue:null, profile:null, needsReview:false };
}

