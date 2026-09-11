
import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jsonObject = z.record(z.string(), z.unknown()).default({});
const editableItemCategories = z.enum(["RECIPE","RECIPE_SOURCE_FIELD","PROCESS_TIME_PROFILE","PROCESS_TIME_SOURCE_FIELD"]);

const itemSchema = z.object({
  category: editableItemCategories,
  code: z.string().min(1).max(200),
  label: z.string().min(1).max(300),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  data: jsonObject,
});

const ruleSchema = z.object({
  ruleType: z.enum(["RECIPE","PROCESS_TIME"]),
  code: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
  enabled: z.boolean().default(true),
  priority: z.number().int().default(100),
  condition: jsonObject,
  action: jsonObject,
  notes: z.string().max(4000).nullable().optional(),
});

function json(value: unknown) { return JSON.stringify(value ?? {}); }

export async function GET() {
  try {
    const result = await query(`
      SELECT
        COALESCE((
          SELECT jsonb_agg(to_jsonb(i) ORDER BY i.category, i.sort_order, i.code)
          FROM config_items i
          WHERE i.category = ANY($1::text[])
        ), '[]'::jsonb) AS items,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rule_type, r.priority, r.code)
          FROM config_rules r
          WHERE r.rule_type = ANY($2::text[])
        ), '[]'::jsonb) AS rules,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(m) ORDER BY COALESCE((m.data->>'planningOrder')::int,m.sort_order),m.code)
          FROM config_items m
          WHERE m.category='MAIN_OPERATION' AND m.enabled=true
        ), '[]'::jsonb) AS main_operations,
        COALESCE((
          SELECT jsonb_object_agg(s.setting_key,s.value_json)
          FROM config_settings s
          WHERE s.enabled=true AND s.category = ANY($3::text[])
        ), '{}'::jsonb) AS settings`,
      [
        ["RECIPE","RECIPE_SOURCE_FIELD","PROCESS_TIME_PROFILE","PROCESS_TIME_SOURCE_FIELD"],
        ["RECIPE","PROCESS_TIME"],
        ["RECIPE_MODEL","PROCESS_TIME"],
      ]
    );
    const row = result.rows[0] || {};
    const items = Array.isArray(row.items) ? row.items : [];
    const rules = Array.isArray(row.rules) ? row.rules : [];
    const recipes = items.filter((x: Record<string,unknown>) => x.category === "RECIPE");
    const recipeFields = items.filter((x: Record<string,unknown>) => x.category === "RECIPE_SOURCE_FIELD");
    const processProfiles = items.filter((x: Record<string,unknown>) => x.category === "PROCESS_TIME_PROFILE");
    const processFields = items.filter((x: Record<string,unknown>) => x.category === "PROCESS_TIME_SOURCE_FIELD");
    const recipeRules = rules.filter((x: Record<string,unknown>) => x.rule_type === "RECIPE");
    const processTimeRules = rules.filter((x: Record<string,unknown>) => x.rule_type === "PROCESS_TIME");
    return NextResponse.json({
      recipes, recipeFields, processProfiles, processFields, recipeRules, processTimeRules,
      mainOperations: row.main_operations || [], settings: row.settings || {},
      summary: {
        recipes: recipes.length,
        recipeReview: recipes.filter((x: Record<string,unknown>) => Boolean((x.data as Record<string,unknown> | null)?.needsReview)).length,
        recipeRules: recipeRules.length,
        processProfiles: processProfiles.length,
        processTimeRules: processTimeRules.length,
        processTimeEnabled: processTimeRules.filter((x: Record<string,unknown>) => Boolean(x.enabled)).length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Recipe Model.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const action = z.enum(["saveItem","saveRule","deleteItem","deleteRule"]).parse(raw.action);
    if (action === "saveItem") {
      const x = itemSchema.parse(raw.row);
      await query(
        `INSERT INTO config_items (category,code,label,enabled,sort_order,data)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT (category,code) DO UPDATE SET
           label=EXCLUDED.label, enabled=EXCLUDED.enabled, sort_order=EXCLUDED.sort_order,
           data=config_items.data || EXCLUDED.data, updated_at=now()`,
        [x.category,x.code,x.label,x.enabled,x.sortOrder,json(x.data)]
      );
      return NextResponse.json({ ok:true });
    }
    if (action === "saveRule") {
      const x = ruleSchema.parse(raw.row);
      await query(
        `INSERT INTO config_rules (rule_type,code,name,enabled,priority,condition_json,action_json,notes)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
         ON CONFLICT (rule_type,code) DO UPDATE SET
           name=EXCLUDED.name,enabled=EXCLUDED.enabled,priority=EXCLUDED.priority,
           condition_json=EXCLUDED.condition_json,action_json=EXCLUDED.action_json,
           notes=EXCLUDED.notes,updated_at=now()`,
        [x.ruleType,x.code,x.name,x.enabled,x.priority,json(x.condition),json(x.action),x.notes??null]
      );
      return NextResponse.json({ ok:true });
    }
    if (action === "deleteItem") {
      const category = editableItemCategories.parse(raw.category);
      const code = z.string().min(1).parse(raw.code);
      await query(`DELETE FROM config_items WHERE category=$1 AND code=$2`,[category,code]);
      return NextResponse.json({ ok:true });
    }
    const ruleType = z.enum(["RECIPE","PROCESS_TIME"]).parse(raw.ruleType);
    const code = z.string().min(1).parse(raw.code);
    await query(`DELETE FROM config_rules WHERE rule_type=$1 AND code=$2`,[ruleType,code]);
    return NextResponse.json({ ok:true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save Recipe Model.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
