import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import type { SourceProfile } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ importId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const { importId } = bodySchema.parse(await request.json());

    const validation = await withTransaction(async (client) => {
      const run = await client.query<{
        status: string;
        planning_row_count: number;
        scheduling_row_count: number;
        planning_column_count: number;
        scheduling_column_count: number;
        config_snapshot: unknown;
      }>(
        `SELECT status, planning_row_count, scheduling_row_count,
                planning_column_count, scheduling_column_count, config_snapshot
         FROM import_runs WHERE id = $1 FOR UPDATE`,
        [importId]
      );
      if (!run.rowCount) throw new Error("Import run not found.");
      if (run.rows[0].status !== "IMPORTING") throw new Error("Import run is not in IMPORTING status.");
      const snapshot = run.rows[0].config_snapshot as { planning?: SourceProfile; scheduling?: SourceProfile } | null;
      const planningProfile = snapshot?.planning;
      const schedulingProfile = snapshot?.scheduling;
      if (!planningProfile || !schedulingProfile) throw new Error("Import run has no configuration snapshot. Restart the import.");
      const planningName = planningProfile.sheetName || planningProfile.displayName;
      const schedulingName = schedulingProfile.sheetName || schedulingProfile.displayName;

      const counts = await client.query<{
        planning_raw: number;
        scheduling_raw: number;
        planning_columns: number;
        scheduling_columns: number;
        planning_jobs: number;
        schedule_blocks: number;
      }>(
        `SELECT
          (SELECT count(*)::int FROM raw_sheet_rows WHERE import_id=$1 AND sheet_name=$2) AS planning_raw,
          (SELECT count(*)::int FROM raw_sheet_rows WHERE import_id=$1 AND sheet_name=$3) AS scheduling_raw,
          (SELECT count(*)::int FROM source_columns WHERE import_id=$1 AND sheet_name=$2) AS planning_columns,
          (SELECT count(*)::int FROM source_columns WHERE import_id=$1 AND sheet_name=$3) AS scheduling_columns,
          (SELECT count(*)::int FROM planning_jobs WHERE import_id=$1) AS planning_jobs,
          (SELECT count(*)::int FROM schedule_blocks WHERE import_id=$1) AS schedule_blocks`,
        [importId, planningName, schedulingName]
      );

      const actual = counts.rows[0];
      const expected = {
        planningRaw: run.rows[0].planning_row_count,
        schedulingRaw: run.rows[0].scheduling_row_count,
        planningColumns: run.rows[0].planning_column_count,
        schedulingColumns: run.rows[0].scheduling_column_count,
        planningJobs: Math.max(0, run.rows[0].planning_row_count - planningProfile.headerRows),
        scheduleBlocks: Math.max(0, run.rows[0].scheduling_row_count - schedulingProfile.headerRows),
      };

      const checks = {
        planningRaw: actual.planning_raw === expected.planningRaw,
        schedulingRaw: actual.scheduling_raw === expected.schedulingRaw,
        planningColumns: actual.planning_columns === expected.planningColumns,
        schedulingColumns: actual.scheduling_columns === expected.schedulingColumns,
        planningJobs: actual.planning_jobs === expected.planningJobs,
        scheduleBlocks: actual.schedule_blocks === expected.scheduleBlocks,
      };
      const passed = Object.values(checks).every(Boolean);

      if (!passed) {
        await client.query(
          `UPDATE import_runs SET status='FAILED', error_message=$2 WHERE id=$1`,
          [importId, `Import validation failed: ${JSON.stringify({ expected, actual, checks })}`]
        );
        return { passed, expected, actual, checks };
      }

      await client.query(`UPDATE import_runs SET is_active=false WHERE is_active=true AND id<>$1`, [importId]);
      await client.query(
        `UPDATE import_runs
         SET status='COMPLETED', is_active=true, completed_at=now(), error_message=null
         WHERE id=$1`,
        [importId]
      );

      return { passed, expected, actual, checks };
    });

    if (!validation.passed) {
      return NextResponse.json({ error: "Import validation failed.", importId, validation }, { status: 422 });
    }
    return NextResponse.json({ importId, validation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to finalize import.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
