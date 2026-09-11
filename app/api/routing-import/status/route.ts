import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await query<{
      id: string;
      source_filename: string;
      sheet_name: string;
      imported_at: string;
      completed_at: string | null;
      status: string;
      is_active: boolean;
      route_row_count: number | null;
      route_column_count: number | null;
      error_message: string | null;
    }>(
      `SELECT id, source_filename, sheet_name, imported_at, completed_at, status, is_active,
              route_row_count, route_column_count, error_message
       FROM route_import_runs
       ORDER BY imported_at DESC
       LIMIT 10`
    );
    return NextResponse.json({ imports: result.rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load routing import status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
