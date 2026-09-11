import { NextResponse } from "next/server";
import { z } from "zod";
import { query, withTransaction } from "@/lib/db";
import { getPlanningModel } from "@/lib/planning-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const itemCategory = z.enum(["MAIN_OPERATION", "ST_GROUP", "PHYSICAL_AREA", "SCHEDULE_AREA", "PLANNER", "RESOURCE", "RECIPE_GROUP"]);
const linkType = z.enum([
  "MAIN_TO_ST_GROUP",
  "ST_GROUP_TO_PHYSICAL_AREA",
  "PHYSICAL_TO_SCHEDULE_AREA",
  "SCHEDULE_AREA_TO_PLANNER",
  "MAIN_TO_RESOURCE",
  "MAIN_TO_RECIPE_GROUP",
]);

function json(value: unknown) {
  return JSON.stringify(value ?? {});
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") || "").trim();
    const mapped = (url.searchParams.get("mapped") || "all").toLowerCase();
    const params: unknown[] = [];
    const where: string[] = ["i.category IN ('OPERATION_CODE','ST_OPERATION')", "i.enabled=true"];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(i.code ILIKE $${params.length} OR i.label ILIKE $${params.length})`);
    }
    if (mapped === "mapped") where.push("EXISTS (SELECT 1 FROM config_links l WHERE l.enabled=true AND l.link_type='OPERATION_TO_MAIN' AND upper(l.from_code)=upper(i.code))");
    if (mapped === "unmapped") where.push("NOT EXISTS (SELECT 1 FROM config_links l WHERE l.enabled=true AND l.link_type='OPERATION_TO_MAIN' AND upper(l.from_code)=upper(i.code))");

    const operations = await query(
      `SELECT i.category, i.code, i.label, i.sort_order, i.data,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', l.id,
                  'fromCategory', l.from_category,
                  'fromCode', l.from_code,
                  'toCode', l.to_code,
                  'sortOrder', l.sort_order
                ) ORDER BY CASE WHEN l.from_category='OPERATION_CODE' THEN 0 ELSE 1 END, l.sort_order)
                FROM config_links l
                WHERE l.enabled=true AND l.link_type='OPERATION_TO_MAIN' AND upper(l.from_code)=upper(i.code)
              ), '[]'::jsonb) AS mappings
       FROM config_items i
       WHERE ${where.join(" AND ")}
       ORDER BY i.code, CASE WHEN i.category='OPERATION_CODE' THEN 0 ELSE 1 END
       LIMIT 5000`,
      params
    );

    const model = await getPlanningModel();
    const masters = model.items.reduce<Record<string, unknown[]>>((acc, item) => {
      (acc[item.category] ||= []).push(item);
      return acc;
    }, {});

    const unique = new Map<string, Record<string, unknown>>();
    for (const row of operations.rows as Record<string, unknown>[]) {
      const k = String(row.code).trim().toUpperCase();
      const existing = unique.get(k);
      const mappings = Array.isArray(row.mappings) ? row.mappings as Record<string, unknown>[] : [];
      if (!existing) {
        unique.set(k, {
          code: String(row.code),
          label: String(row.label || row.code),
          sources: [String(row.category)],
          data: row.data || {},
          mappings,
          resolved: model.operationMappings[k] || null,
        });
      } else {
        const sources = new Set([...(existing.sources as string[]), String(row.category)]);
        existing.sources = [...sources];
        if (!(existing.mappings as unknown[]).length && mappings.length) existing.mappings = mappings;
      }
    }

    const operationRows = [...unique.values()];
    return NextResponse.json({
      operations: operationRows,
      masters,
      mainOperations: Object.values(model.mainOperations).sort((a, b) => a.planningOrder - b.planningOrder || a.code.localeCompare(b.code)),
      settings: model.settings,
      summary: {
        operations: operationRows.length,
        mapped: operationRows.filter((x) => Boolean(x.resolved)).length,
        unmapped: operationRows.filter((x) => !x.resolved).length,
        mainOperations: Object.keys(model.mainOperations).length,
        planningEnabled: Object.values(model.mainOperations).filter((x) => x.planningEnabled).length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Planning Model configuration.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("saveMainOperation"),
    code: z.string().min(1).max(200),
    label: z.string().min(1).max(300),
    planningOrder: z.number().int().min(0).max(999999).default(0),
    planningEnabled: z.boolean().default(true),
    scheduleEnabled: z.boolean().default(true),
    batchEnabled: z.boolean().default(true),
    shortCode: z.string().max(50).nullable().optional(),
    color: z.string().max(50).nullable().optional(),
  }),
  z.object({
    action: z.literal("mapOperation"),
    operationCode: z.string().min(1).max(200),
    sourceCategory: z.enum(["OPERATION_CODE", "ST_OPERATION"]).default("OPERATION_CODE"),
    mainOperationCode: z.string().max(200).nullable(),
  }),
  z.object({
    action: z.literal("saveMaster"),
    category: itemCategory,
    code: z.string().min(1).max(200),
    label: z.string().min(1).max(300),
    sortOrder: z.number().int().default(0),
    enabled: z.boolean().default(true),
    data: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({
    action: z.literal("setLink"),
    linkType,
    fromCategory: itemCategory,
    fromCode: z.string().min(1).max(200),
    toCategory: itemCategory,
    toCode: z.string().max(200).nullable(),
  }),
]);

export async function POST(request: Request) {
  try {
    const body = actionSchema.parse(await request.json());

    if (body.action === "saveMainOperation") {
      const data = {
        planningOrder: body.planningOrder,
        planningEnabled: body.planningEnabled,
        scheduleEnabled: body.scheduleEnabled,
        batchEnabled: body.batchEnabled,
        shortCode: body.shortCode || null,
        color: body.color || null,
      };
      await query(
        `INSERT INTO config_items (category,code,label,enabled,sort_order,data)
         VALUES ('MAIN_OPERATION',$1,$2,true,$3,$4::jsonb)
         ON CONFLICT (category,code) DO UPDATE SET
           label=EXCLUDED.label, enabled=true, sort_order=EXCLUDED.sort_order,
           data=config_items.data || EXCLUDED.data, updated_at=now()`,
        [body.code, body.label, body.planningOrder, json(data)]
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "saveMaster") {
      await query(
        `INSERT INTO config_items (category,code,label,enabled,sort_order,data)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT (category,code) DO UPDATE SET
           label=EXCLUDED.label, enabled=EXCLUDED.enabled, sort_order=EXCLUDED.sort_order,
           data=EXCLUDED.data, updated_at=now()`,
        [body.category, body.code, body.label, body.enabled, body.sortOrder, json(body.data)]
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "mapOperation") {
      await withTransaction(async (client) => {
        await client.query(
          `DELETE FROM config_links
           WHERE link_type='OPERATION_TO_MAIN'
             AND from_category IN ('OPERATION_CODE','ST_OPERATION')
             AND upper(from_code)=upper($1)`,
          [body.operationCode]
        );
        if (body.mainOperationCode) {
          await client.query(
            `INSERT INTO config_links
             (link_type,from_category,from_code,to_category,to_code,enabled,sort_order,data)
             VALUES ('OPERATION_TO_MAIN',$1,$2,'MAIN_OPERATION',$3,true,0,'{}'::jsonb)
             ON CONFLICT (link_type,from_category,from_code,to_category,to_code)
             DO UPDATE SET enabled=true, updated_at=now()`,
            [body.sourceCategory, body.operationCode, body.mainOperationCode]
          );
        }
      });
      return NextResponse.json({ ok: true });
    }

    await withTransaction(async (client) => {
      await client.query(
        `DELETE FROM config_links
         WHERE link_type=$1 AND from_category=$2 AND upper(from_code)=upper($3)`,
        [body.linkType, body.fromCategory, body.fromCode]
      );
      if (body.toCode) {
        await client.query(
          `INSERT INTO config_links
           (link_type,from_category,from_code,to_category,to_code,enabled,sort_order,data)
           VALUES ($1,$2,$3,$4,$5,true,0,'{}'::jsonb)
           ON CONFLICT (link_type,from_category,from_code,to_category,to_code)
           DO UPDATE SET enabled=true, updated_at=now()`,
          [body.linkType, body.fromCategory, body.fromCode, body.toCategory, body.toCode]
        );
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save Planning Model configuration.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
