import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { SOURCE_SHEETS } from "@/lib/source-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const programs = await query<{ value: string }>(
      `SELECT DISTINCT program AS value FROM v_active_planning_jobs
       WHERE NULLIF(program,'') IS NOT NULL ORDER BY value LIMIT 300`
    );
    const nextOps = await query<{ value: string }>(
      `SELECT DISTINCT next_operation AS value FROM v_active_planning_jobs
       WHERE NULLIF(next_operation,'') IS NOT NULL ORDER BY value LIMIT 500`
    );
    const operations = await query<{ value: string }>(
      `SELECT DISTINCT o.operation_code AS value
       FROM planning_job_operations o
       JOIN v_active_planning_jobs p ON p.id=o.planning_job_id
       WHERE NULLIF(o.operation_code,'') IS NOT NULL ORDER BY value LIMIT 500`
    );
    const priorities = await query<{ value: string }>(
      `SELECT DISTINCT value FROM (
         SELECT rr.row_data->'CM'->>'v' AS value
         FROM raw_sheet_rows rr
         JOIN import_runs i ON i.id=rr.import_id
         WHERE i.is_active=true AND i.status='COMPLETED' AND rr.sheet_name=$1 AND rr.source_row_no > 3
         UNION
         SELECT rr.row_data->'CN'->>'v' AS value
         FROM raw_sheet_rows rr
         JOIN import_runs i ON i.id=rr.import_id
         WHERE i.is_active=true AND i.status='COMPLETED' AND rr.sheet_name=$1 AND rr.source_row_no > 3
         UNION
         SELECT rr.row_data->'CO'->>'v' AS value
         FROM raw_sheet_rows rr
         JOIN import_runs i ON i.id=rr.import_id
         WHERE i.is_active=true AND i.status='COMPLETED' AND rr.sheet_name=$1 AND rr.source_row_no > 3
       ) x WHERE NULLIF(value,'') IS NOT NULL ORDER BY value LIMIT 300`,
      [SOURCE_SHEETS.planning.name]
    );
    return NextResponse.json({
      programs: programs.rows.map((r) => r.value),
      nextOperations: nextOps.rows.map((r) => r.value),
      operations: operations.rows.map((r) => r.value),
      priorities: priorities.rows.map((r) => r.value),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Planning filters.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
