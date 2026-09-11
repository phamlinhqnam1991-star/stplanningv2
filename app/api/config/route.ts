import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const entitySchema = z.enum(["items", "links", "rules", "settings", "sources", "views"]);
const jsonObject = z.record(z.string(), z.unknown()).default({});

const itemSchema = z.object({
  category: z.string().min(1).max(100), code: z.string().min(1).max(200), label: z.string().min(1).max(300),
  parentCode: z.string().max(200).nullable().optional(), enabled: z.boolean().default(true), sortOrder: z.number().int().default(0), data: jsonObject,
});
const linkSchema = z.object({
  linkType: z.string().min(1).max(100), fromCategory: z.string().min(1).max(100), fromCode: z.string().min(1).max(200),
  toCategory: z.string().min(1).max(100), toCode: z.string().min(1).max(200), enabled: z.boolean().default(true), sortOrder: z.number().int().default(0), data: jsonObject,
});
const ruleSchema = z.object({
  ruleType: z.string().min(1).max(100), code: z.string().min(1).max(200), name: z.string().min(1).max(300), enabled: z.boolean().default(true),
  priority: z.number().int().default(100), condition: jsonObject, action: jsonObject, notes: z.string().max(2000).nullable().optional(),
});
const settingSchema = z.object({
  settingKey: z.string().min(1).max(200), category: z.string().min(1).max(100), label: z.string().min(1).max(300),
  dataType: z.string().min(1).max(50).default("json"), value: z.unknown(), enabled: z.boolean().default(true), description: z.string().max(2000).nullable().optional(),
});
const sourceSchema = z.object({
  sourceKey: z.string().min(1).max(100), displayName: z.string().min(1).max(300), sheetName: z.string().max(300).nullable().optional(),
  headerRows: z.number().int().min(1).max(20), baselineColumns: z.number().int().min(1).max(2000), operationSlots: z.number().int().min(1).max(500).nullable().optional(),
  enabled: z.boolean().default(true), parserConfig: jsonObject,
});
const viewSchema = z.object({
  viewKey: z.string().min(1).max(100), profileCode: z.string().min(1).max(100), name: z.string().min(1).max(300),
  isDefault: z.boolean().default(false), enabled: z.boolean().default(true), config: jsonObject,
});

function json(value: unknown) { return JSON.stringify(value ?? {}); }

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const entity = entitySchema.parse(url.searchParams.get("entity") || "items");
    const filter = (url.searchParams.get("filter") || "").trim();
    const p = filter ? [`%${filter}%`] : [];

    if (entity === "items") {
      const result = await query(`SELECT id, category, code, label, parent_code, enabled, sort_order, data FROM config_items ${filter ? "WHERE category ILIKE $1 OR code ILIKE $1 OR label ILIKE $1" : ""} ORDER BY category, sort_order, code LIMIT 2000`, p);
      return NextResponse.json({ rows: result.rows });
    }
    if (entity === "links") {
      const result = await query(`SELECT id, link_type, from_category, from_code, to_category, to_code, enabled, sort_order, data FROM config_links ${filter ? "WHERE link_type ILIKE $1 OR from_code ILIKE $1 OR to_code ILIKE $1" : ""} ORDER BY link_type, sort_order, from_code, to_code LIMIT 2000`, p);
      return NextResponse.json({ rows: result.rows });
    }
    if (entity === "rules") {
      const result = await query(`SELECT id, rule_type, code, name, enabled, priority, condition_json, action_json, notes FROM config_rules ${filter ? "WHERE rule_type ILIKE $1 OR code ILIKE $1 OR name ILIKE $1" : ""} ORDER BY rule_type, priority, code LIMIT 2000`, p);
      return NextResponse.json({ rows: result.rows });
    }
    if (entity === "settings") {
      const result = await query(`SELECT setting_key, category, label, data_type, value_json, enabled, description FROM config_settings ${filter ? "WHERE setting_key ILIKE $1 OR category ILIKE $1 OR label ILIKE $1" : ""} ORDER BY category, setting_key LIMIT 2000`, p);
      return NextResponse.json({ rows: result.rows });
    }
    if (entity === "sources") {
      const result = await query(`SELECT source_key, display_name, sheet_name, header_rows, baseline_columns, operation_slots, enabled, parser_config FROM config_source_profiles ORDER BY source_key`);
      return NextResponse.json({ rows: result.rows });
    }
    const result = await query(`SELECT id, view_key, profile_code, name, is_default, enabled, config_json FROM config_view_profiles ${filter ? "WHERE view_key ILIKE $1 OR profile_code ILIKE $1 OR name ILIKE $1" : ""} ORDER BY view_key, is_default DESC, profile_code LIMIT 2000`, p);
    return NextResponse.json({ rows: result.rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load configuration rows.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const entity = entitySchema.parse(raw.entity);
    const action = z.enum(["upsert", "delete"]).parse(raw.action || "upsert");

    if (action === "delete") {
      if (entity === "settings") {
        const key = z.string().min(1).parse(raw.key); await query(`DELETE FROM config_settings WHERE setting_key=$1`, [key]);
      } else if (entity === "sources") {
        const key = z.string().min(1).parse(raw.key); await query(`DELETE FROM config_source_profiles WHERE source_key=$1`, [key]);
      } else {
        const id = z.string().uuid().parse(raw.id);
        const table = entity === "items" ? "config_items" : entity === "links" ? "config_links" : entity === "rules" ? "config_rules" : "config_view_profiles";
        await query(`DELETE FROM ${table} WHERE id=$1`, [id]);
      }
      return NextResponse.json({ ok: true });
    }

    if (entity === "items") {
      const x = itemSchema.parse(raw.row);
      await query(`INSERT INTO config_items (category,code,label,parent_code,enabled,sort_order,data) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (category,code) DO UPDATE SET label=EXCLUDED.label,parent_code=EXCLUDED.parent_code,enabled=EXCLUDED.enabled,sort_order=EXCLUDED.sort_order,data=EXCLUDED.data,updated_at=now()`, [x.category,x.code,x.label,x.parentCode??null,x.enabled,x.sortOrder,json(x.data)]);
    } else if (entity === "links") {
      const x = linkSchema.parse(raw.row);
      await query(`INSERT INTO config_links (link_type,from_category,from_code,to_category,to_code,enabled,sort_order,data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT (link_type,from_category,from_code,to_category,to_code) DO UPDATE SET enabled=EXCLUDED.enabled,sort_order=EXCLUDED.sort_order,data=EXCLUDED.data,updated_at=now()`, [x.linkType,x.fromCategory,x.fromCode,x.toCategory,x.toCode,x.enabled,x.sortOrder,json(x.data)]);
    } else if (entity === "rules") {
      const x = ruleSchema.parse(raw.row);
      await query(`INSERT INTO config_rules (rule_type,code,name,enabled,priority,condition_json,action_json,notes) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8) ON CONFLICT (rule_type,code) DO UPDATE SET name=EXCLUDED.name,enabled=EXCLUDED.enabled,priority=EXCLUDED.priority,condition_json=EXCLUDED.condition_json,action_json=EXCLUDED.action_json,notes=EXCLUDED.notes,updated_at=now()`, [x.ruleType,x.code,x.name,x.enabled,x.priority,json(x.condition),json(x.action),x.notes??null]);
    } else if (entity === "settings") {
      const x = settingSchema.parse(raw.row);
      await query(`INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT (setting_key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,enabled=EXCLUDED.enabled,description=EXCLUDED.description,updated_at=now()`, [x.settingKey,x.category,x.label,x.dataType,json(x.value),x.enabled,x.description??null]);
    } else if (entity === "sources") {
      const x = sourceSchema.parse(raw.row);
      await query(`INSERT INTO config_source_profiles (source_key,display_name,sheet_name,header_rows,baseline_columns,operation_slots,enabled,parser_config) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT (source_key) DO UPDATE SET display_name=EXCLUDED.display_name,sheet_name=EXCLUDED.sheet_name,header_rows=EXCLUDED.header_rows,baseline_columns=EXCLUDED.baseline_columns,operation_slots=EXCLUDED.operation_slots,enabled=EXCLUDED.enabled,parser_config=EXCLUDED.parser_config,updated_at=now()`, [x.sourceKey,x.displayName,x.sheetName??null,x.headerRows,x.baselineColumns,x.operationSlots??null,x.enabled,json(x.parserConfig)]);
    } else {
      const x = viewSchema.parse(raw.row);
      if (x.isDefault) await query(`UPDATE config_view_profiles SET is_default=false WHERE view_key=$1`, [x.viewKey]);
      await query(`INSERT INTO config_view_profiles (view_key,profile_code,name,is_default,enabled,config_json) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (view_key,profile_code) DO UPDATE SET name=EXCLUDED.name,is_default=EXCLUDED.is_default,enabled=EXCLUDED.enabled,config_json=EXCLUDED.config_json,updated_at=now()`, [x.viewKey,x.profileCode,x.name,x.isDefault,x.enabled,json(x.config)]);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save configuration.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
