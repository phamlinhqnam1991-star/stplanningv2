import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sortMap: Record<string, string> = {
  row: "j.source_row_no",
  job: "j.job_num",
  program: "j.program",
  part: "j.epicor_part",
  revision: "j.revision_num",
  next: "j.next_operation",
  count: "j.operation_count",
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit") || 25)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const search = (url.searchParams.get("search") || "").trim();
    const operation = (url.searchParams.get("operation") || "").trim();
    const sort = url.searchParams.get("sort") || "job";
    const direction = url.searchParams.get("direction") === "desc" ? "DESC" : "ASC";
    const sortSql = sortMap[sort] || sortMap.job;

    const params: unknown[] = [];
    const where: string[] = [];
    if (search) {
      params.push(`%${search}%`);
      const p = `$${params.length}`;
      where.push(`(
        j.job_num ILIKE ${p} OR j.epicor_part ILIKE ${p} OR j.program ILIKE ${p} OR
        j.revision_num ILIKE ${p} OR j.last_labor_op ILIKE ${p} OR j.next_operation ILIKE ${p}
      )`);
    }
    if (operation) {
      params.push(operation);
      where.push(`EXISTS (
        SELECT 1 FROM v_active_job_operation_sequence o
        WHERE o.job_route_id=j.id AND upper(o.operation_code)=upper($${params.length})
      )`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const summary = await query<{
      total: number;
      programs: number;
      operations: number;
      with_next: number;
    }>(
      `SELECT count(*)::int AS total,
              count(DISTINCT j.program)::int AS programs,
              COALESCE(sum(j.operation_count),0)::int AS operations,
              count(*) FILTER (WHERE NULLIF(j.next_operation,'') IS NOT NULL)::int AS with_next
       FROM v_active_job_routes j
       ${whereSql}`,
      params
    );

    const rowParams = [...params, limit, offset];
    const limitParam = `$${rowParams.length - 1}`;
    const offsetParam = `$${rowParams.length}`;
    const rows = await query(
      `SELECT j.id, j.source_row_no, j.program, j.epicor_part, j.revision_num, j.job_num,
              j.prod_qty, j.last_labor_op, j.last_labor_opr_seq, j.next_operation,
              j.last_complete_opr_seq, j.job_complete, j.operation_count,
              COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'position', o.operation_position,
                    'code', o.operation_code,
                    'sequence', o.operation_seq,
                    'complete', o.is_complete,
                    'openNonconformance', o.open_nonconformance,
                    'sourceText', o.source_operation_text
                  ) ORDER BY o.operation_position
                ) FILTER (WHERE o.id IS NOT NULL), '[]'::jsonb
              ) AS operations
       FROM v_active_job_routes j
       LEFT JOIN v_active_job_operation_sequence o ON o.job_route_id=j.id
       ${whereSql}
       GROUP BY j.id, j.source_row_no, j.program, j.epicor_part, j.revision_num, j.job_num,
                j.prod_qty, j.last_labor_op, j.last_labor_opr_seq, j.next_operation,
                j.last_complete_opr_seq, j.job_complete, j.operation_count
       ORDER BY ${sortSql} ${direction} NULLS LAST, j.source_row_no ASC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      rowParams
    );

    const s = summary.rows[0] || { total: 0, programs: 0, operations: 0, with_next: 0 };
    return NextResponse.json({
      total: s.total,
      rows: rows.rows,
      limit,
      offset,
      summary: {
        total: s.total,
        programs: s.programs,
        operations: s.operations,
        withNext: s.with_next,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Job Routing data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
