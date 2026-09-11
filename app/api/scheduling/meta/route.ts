import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dateRange = await query<{ min_date: string | null; max_date: string | null }>(
      `SELECT min(schedule_date)::text AS min_date, max(schedule_date)::text AS max_date
       FROM v_active_schedule_blocks`
    );
    const statuses = await query<{ value: string }>(
      `SELECT DISTINCT status AS value FROM v_active_schedule_blocks
       WHERE NULLIF(status,'') IS NOT NULL ORDER BY value`
    );
    const resources = await query<{ value: string }>(
      `SELECT DISTINCT resource_code AS value FROM v_active_schedule_resource_assignments
       WHERE NULLIF(resource_code,'') IS NOT NULL ORDER BY value`
    );
    return NextResponse.json({
      minDate: dateRange.rows[0]?.min_date ?? null,
      maxDate: dateRange.rows[0]?.max_date ?? null,
      statuses: statuses.rows.map((r) => r.value),
      resources: resources.rows.map((r) => r.value),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Scheduling filters.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
