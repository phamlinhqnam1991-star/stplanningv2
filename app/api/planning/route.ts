import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { SOURCE_SHEETS } from "@/lib/source-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sortMap: Record<string, string> = {
  row: "p.source_row_no",
  program: "p.program",
  part: "p.epicor_part",
  revision: "rr.row_data->'CG'->>'v'",
  job: "p.job_num",
  nextOperation: "p.next_operation",
  prodQty: "p.prod_qty",
  goodWip: "p.current_good_wip_qty",
  surface: "p.surface_dm2",
  priority: "rr.row_data->'CM'->>'v'",
};

function addLike(params: unknown[], value: string) {
  params.push(`%${value}%`);
  return `$${params.length}`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(500, Math.max(20, Number(url.searchParams.get("limit") || 100)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const search = (url.searchParams.get("search") || "").trim();
    const program = (url.searchParams.get("program") || "").trim();
    const nextOperation = (url.searchParams.get("nextOperation") || "").trim();
    const operation = (url.searchParams.get("operation") || "").trim();
    const priority = (url.searchParams.get("priority") || "").trim();
    const sort = url.searchParams.get("sort") || "row";
    const direction = url.searchParams.get("direction") === "desc" ? "DESC" : "ASC";
    const sortSql = sortMap[sort] || sortMap.row;

    const params: unknown[] = [SOURCE_SHEETS.planning.name];
    const where: string[] = [];

    if (search) {
      const p = addLike(params, search);
      where.push(`(
        p.job_num ILIKE ${p} OR p.epicor_part ILIKE ${p} OR p.program ILIKE ${p}
        OR p.part_description ILIKE ${p} OR p.next_operation ILIKE ${p}
        OR COALESCE(rr.row_data->'CM'->>'v','') ILIKE ${p}
        OR COALESCE(rr.row_data->'CN'->>'v','') ILIKE ${p}
        OR COALESCE(rr.row_data->'CO'->>'v','') ILIKE ${p}
      )`);
    }
    if (program) {
      params.push(program);
      where.push(`p.program = $${params.length}`);
    }
    if (nextOperation) {
      params.push(nextOperation);
      where.push(`p.next_operation = $${params.length}`);
    }
    if (operation) {
      params.push(operation);
      where.push(`EXISTS (
        SELECT 1 FROM planning_job_operations fo
        WHERE fo.planning_job_id = p.id AND fo.operation_code = $${params.length}
      )`);
    }
    if (priority) {
      const p = addLike(params, priority);
      where.push(`(
        COALESCE(rr.row_data->'CM'->>'v','') ILIKE ${p}
        OR COALESCE(rr.row_data->'CN'->>'v','') ILIKE ${p}
        OR COALESCE(rr.row_data->'CO'->>'v','') ILIKE ${p}
      )`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const fromSql = `
      FROM v_active_planning_jobs p
      LEFT JOIN raw_sheet_rows rr
        ON rr.import_id = p.import_id
       AND rr.sheet_name = $1
       AND rr.source_row_no = p.source_row_no`;

    const summary = await query<{
      total: number;
      total_qty: string | null;
      total_surface: string | null;
      programs: number;
      priority_rows: number;
    }>(
      `SELECT count(*)::int AS total,
              COALESCE(sum(p.prod_qty),0)::text AS total_qty,
              COALESCE(sum(p.surface_dm2),0)::text AS total_surface,
              count(DISTINCT p.program)::int AS programs,
              count(*) FILTER (WHERE
                NULLIF(rr.row_data->'CM'->>'v','') IS NOT NULL OR
                NULLIF(rr.row_data->'CN'->>'v','') IS NOT NULL OR
                NULLIF(rr.row_data->'CO'->>'v','') IS NOT NULL
              )::int AS priority_rows
       ${fromSql}
       ${whereSql}`,
      params
    );

    const rowParams = [...params, limit, offset];
    const limitParam = `$${rowParams.length - 1}`;
    const offsetParam = `$${rowParams.length}`;
    const rows = await query(
      `SELECT p.id, p.source_row_no, p.program, p.part_cluster, p.epicor_part,
              p.surface_dm2, p.part_description, p.job_num, p.last_labor_op,
              p.next_operation, p.last_labor_qty, p.prod_qty, p.current_good_wip_qty,
              p.st_source_value, p.st_wip_area, p.wip_sequence, p.all_operation,
              rr.row_data->'CD'->>'v' AS alloy,
              rr.row_data->'CE'->>'v' AS temper,
              rr.row_data->'CG'->>'v' AS revision_num,
              rr.row_data->'CM'->>'v' AS priority_type,
              rr.row_data->'CN'->>'v' AS cat_transit,
              rr.row_data->'CO'->>'v' AS impact_sale_value,
              COALESCE(op.operation_count,0)::int AS operation_count,
              COALESCE(op.operations,'[]'::jsonb) AS operations
       ${fromSql}
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS operation_count,
                jsonb_agg(
                  jsonb_build_object(
                    'code', o.operation_code,
                    'value', o.source_value,
                    'order', o.operation_order,
                    'sourceColumn', o.source_excel_column
                  ) ORDER BY o.operation_order
                ) AS operations
         FROM planning_job_operations o
         WHERE o.planning_job_id = p.id
       ) op ON true
       ${whereSql}
       ORDER BY ${sortSql} ${direction} NULLS LAST, p.source_row_no ASC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      rowParams
    );

    const s = summary.rows[0] || { total: 0, total_qty: "0", total_surface: "0", programs: 0, priority_rows: 0 };
    return NextResponse.json({
      total: s.total,
      rows: rows.rows,
      limit,
      offset,
      summary: {
        total: s.total,
        totalQty: Number(s.total_qty || 0),
        totalSurface: Number(s.total_surface || 0),
        programs: s.programs,
        priorityRows: s.priority_rows,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Planning data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
