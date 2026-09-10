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
      ? `WHERE s.batch_ref ILIKE $1 OR s.recipe_no ILIKE $1 OR s.recipe_description ILIKE $1 OR s.status ILIKE $1`
      : "";
    const count = await query<{ total: number }>(
      `SELECT count(*)::int AS total FROM v_active_schedule_blocks s ${where}`,
      search ? [`%${search}%`] : []
    );

    const values = search ? [`%${search}%`, limit, offset] : [limit, offset];
    const limitParam = search ? "$2" : "$1";
    const offsetParam = search ? "$3" : "$2";
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
       ${where}
       GROUP BY s.id, s.source_row_no, s.schedule_date, s.day_label, s.slot_no,
                s.batch_ref, s.recipe_no, s.recipe_description, s.job_count,
                s.pcs, s.surface_dm2, s.start_time, s.end_time, s.duration_minutes,
                s.status, s.comments
       ORDER BY s.source_row_no
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values
    );

    return NextResponse.json({ total: count.rows[0]?.total ?? 0, rows: rows.rows, limit, offset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Scheduling data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
