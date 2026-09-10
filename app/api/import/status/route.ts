import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await query<{
      id: string;
      source_filename: string;
      imported_at: string;
      completed_at: string | null;
      status: string;
      is_active: boolean;
      planning_row_count: number | null;
      scheduling_row_count: number | null;
      planning_column_count: number | null;
      scheduling_column_count: number | null;
      error_message: string | null;
    }>(
      `SELECT id, source_filename, imported_at, completed_at, status, is_active,
              planning_row_count, scheduling_row_count,
              planning_column_count, scheduling_column_count, error_message
       FROM import_runs
       ORDER BY imported_at DESC
       LIMIT 10`
    );
    return NextResponse.json({ imports: result.rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load import status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
