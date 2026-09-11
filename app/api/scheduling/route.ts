import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getConfigBootstrap, numberSetting } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sortMap: Record<string, string> = {
  row: "s.source_row_no",
  date: "s.schedule_date",
  slot: "s.slot_no",
  batch: "s.batch_ref",
  recipe: "s.recipe_no",
  pcs: "s.pcs",
  surface: "s.surface_dm2",
  start: "s.start_time",
  duration: "s.duration_minutes",
  status: "s.status",
};

function addLike(params: unknown[], value: string) {
  params.push(`%${value}%`);
  return `$${params.length}`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const bootstrap = await getConfigBootstrap();
    const defaultPageSize = numberSetting(bootstrap.settings, "ui.defaultPageSize", 100, 20, 1000);
    const maxPageSize = numberSetting(bootstrap.settings, "ui.maxPageSize", 500, 20, 1000);
    const limit = Math.min(maxPageSize, Math.max(20, Number(url.searchParams.get("limit") || defaultPageSize)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const search = (url.searchParams.get("search") || "").trim();
    const status = (url.searchParams.get("status") || "").trim();
    const resource = (url.searchParams.get("resource") || "").trim();
    const dateFrom = (url.searchParams.get("dateFrom") || "").trim();
    const dateTo = (url.searchParams.get("dateTo") || "").trim();
    const sort = url.searchParams.get("sort") || "date";
    const direction = url.searchParams.get("direction") === "desc" ? "DESC" : "ASC";
    const sortSql = sortMap[sort] || sortMap.date;

    const params: unknown[] = [];
    const where: string[] = [];
    if (search) {
      const p = addLike(params, search);
      where.push(`(
        s.batch_ref ILIKE ${p} OR s.recipe_no ILIKE ${p} OR
        s.recipe_description ILIKE ${p} OR s.status ILIKE ${p} OR
        EXISTS (SELECT 1 FROM v_active_schedule_resource_assignments sa
                WHERE sa.schedule_block_id=s.id AND sa.batch_ref ILIKE ${p})
      )`);
    }
    if (status) {
      params.push(status);
      where.push(`s.status = $${params.length}`);
    }
    if (resource) {
      params.push(resource);
      where.push(`EXISTS (SELECT 1 FROM v_active_schedule_resource_assignments sr
                          WHERE sr.schedule_block_id=s.id AND sr.resource_code=$${params.length})`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      where.push(`s.schedule_date >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(`s.schedule_date <= $${params.length}::date`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const summary = await query<{
      total: number;
      total_pcs: string | null;
      total_surface: string | null;
      total_jobs: string | null;
      active_resources: number;
    }>(
      `WITH filtered AS (
         SELECT s.* FROM v_active_schedule_blocks s ${whereSql}
       )
       SELECT count(*)::int AS total,
              COALESCE(sum(f.pcs),0)::text AS total_pcs,
              COALESCE(sum(f.surface_dm2),0)::text AS total_surface,
              COALESCE(sum(f.job_count),0)::text AS total_jobs,
              (SELECT count(DISTINCT a.resource_code)::int
               FROM v_active_schedule_resource_assignments a
               JOIN filtered x ON x.id=a.schedule_block_id) AS active_resources
       FROM filtered f`,
      params
    );

    const rowParams = [...params, limit, offset];
    const limitParam = `$${rowParams.length - 1}`;
    const offsetParam = `$${rowParams.length}`;
    const rows = await query(
      `SELECT s.id, s.source_row_no, s.schedule_date, s.day_label, s.slot_no,
              s.batch_ref, s.recipe_no, s.recipe_description, s.job_count,
              s.pcs, s.surface_dm2, s.start_time, s.end_time, s.duration_minutes,
              s.status, s.comments,
              COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'resourceCode', a.resource_code,
                    'batchRef', a.batch_ref,
                    'sourceColumn', a.source_excel_column
                  ) ORDER BY a.resource_order
                ) FILTER (WHERE a.id IS NOT NULL), '[]'::jsonb
              ) AS resources
       FROM v_active_schedule_blocks s
       LEFT JOIN v_active_schedule_resource_assignments a ON a.schedule_block_id=s.id
       ${whereSql}
       GROUP BY s.id, s.source_row_no, s.schedule_date, s.day_label, s.slot_no,
                s.batch_ref, s.recipe_no, s.recipe_description, s.job_count,
                s.pcs, s.surface_dm2, s.start_time, s.end_time, s.duration_minutes,
                s.status, s.comments
       ORDER BY ${sortSql} ${direction} NULLS LAST, s.source_row_no ASC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      rowParams
    );

    const s = summary.rows[0] || { total: 0, total_pcs: "0", total_surface: "0", total_jobs: "0", active_resources: 0 };
    return NextResponse.json({
      total: s.total,
      rows: rows.rows,
      limit,
      offset,
      summary: {
        total: s.total,
        totalPcs: Number(s.total_pcs || 0),
        totalSurface: Number(s.total_surface || 0),
        totalJobs: Number(s.total_jobs || 0),
        activeResources: s.active_resources,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Scheduling data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
