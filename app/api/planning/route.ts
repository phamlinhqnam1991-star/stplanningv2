import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(20, Number(url.searchParams.get("limit") || 100)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const search = (url.searchParams.get("search") || "").trim();

    const where = search
      ? `WHERE job_num ILIKE $1 OR epicor_part ILIKE $1 OR program ILIKE $1 OR next_operation ILIKE $1`
      : "";
    const values = search ? [`%${search}%`, limit, offset] : [limit, offset];
    const limitParam = search ? "$2" : "$1";
    const offsetParam = search ? "$3" : "$2";

    const count = await query<{ total: number }>(
      `SELECT count(*)::int AS total FROM v_active_planning_jobs ${where}`,
      search ? [`%${search}%`] : []
    );
    const rows = await query(
      `SELECT id, source_row_no, program, part_cluster, epicor_part, surface_dm2,
              part_description, job_num, last_labor_op, next_operation,
              last_labor_qty, prod_qty, current_good_wip_qty,
              st_source_value, st_wip_area, wip_sequence, all_operation
       FROM v_active_planning_jobs
       ${where}
       ORDER BY source_row_no
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values
    );

    return NextResponse.json({ total: count.rows[0]?.total ?? 0, rows: rows.rows, limit, offset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Planning data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
