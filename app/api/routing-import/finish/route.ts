import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { ROUTING_SOURCE } from "@/lib/source-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ importId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const { importId } = bodySchema.parse(await request.json());

    const validation = await withTransaction(async (client) => {
      const run = await client.query<{
        status: string;
        route_row_count: number;
        route_column_count: number;
      }>(
        `SELECT status, route_row_count, route_column_count
         FROM route_import_runs WHERE id=$1 FOR UPDATE`,
        [importId]
      );
      if (!run.rowCount) throw new Error("Routing import run not found.");
      if (run.rows[0].status !== "IMPORTING") throw new Error("Routing import is not in IMPORTING status.");

      const counts = await client.query<{
        raw_rows: number;
        source_columns: number;
        job_rows: number;
        distinct_jobs: number;
        blank_jobs: number;
        jobs_without_operations: number;
        operation_rows: number;
        jobs_with_next: number;
        next_matched: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM raw_route_rows WHERE import_id=$1) AS raw_rows,
           (SELECT count(*)::int FROM route_source_columns WHERE import_id=$1) AS source_columns,
           (SELECT count(*)::int FROM job_routes WHERE import_id=$1) AS job_rows,
           (SELECT count(DISTINCT job_num)::int FROM job_routes WHERE import_id=$1 AND NULLIF(job_num,'') IS NOT NULL) AS distinct_jobs,
           (SELECT count(*)::int FROM job_routes WHERE import_id=$1 AND NULLIF(job_num,'') IS NULL) AS blank_jobs,
           (SELECT count(*)::int FROM job_routes WHERE import_id=$1 AND operation_count=0) AS jobs_without_operations,
           (SELECT count(*)::int FROM job_operation_sequence o JOIN job_routes j ON j.id=o.job_route_id WHERE j.import_id=$1) AS operation_rows,
           (SELECT count(*)::int FROM job_routes WHERE import_id=$1 AND NULLIF(next_operation,'') IS NOT NULL) AS jobs_with_next,
           (SELECT count(*)::int
              FROM job_routes j
              WHERE j.import_id=$1 AND NULLIF(j.next_operation,'') IS NOT NULL
                AND EXISTS (
                  SELECT 1 FROM job_operation_sequence o
                  WHERE o.job_route_id=j.id AND o.operation_code=j.next_operation
                )) AS next_matched`,
        [importId]
      );

      const actual = counts.rows[0];
      const expectedRaw = run.rows[0].route_row_count;
      const expectedJobs = Math.max(0, expectedRaw - ROUTING_SOURCE.headerRows);
      const issues: string[] = [];
      if (actual.raw_rows !== expectedRaw) issues.push(`RAW rows ${actual.raw_rows}/${expectedRaw}`);
      if (actual.source_columns !== run.rows[0].route_column_count) issues.push(`Source columns ${actual.source_columns}/${run.rows[0].route_column_count}`);
      if (actual.job_rows !== expectedJobs) issues.push(`Job routes ${actual.job_rows}/${expectedJobs}`);
      if (actual.blank_jobs !== 0) issues.push(`Blank JobNum rows ${actual.blank_jobs}`);
      if (actual.distinct_jobs !== actual.job_rows) issues.push(`Distinct JobNum ${actual.distinct_jobs}/${actual.job_rows}`);
      if (actual.jobs_without_operations !== 0) issues.push(`Jobs without operations ${actual.jobs_without_operations}`);

      if (issues.length) {
        const message = `Routing validation failed: ${issues.join("; ")}`;
        await client.query(
          `UPDATE route_import_runs SET status='FAILED', error_message=$2, completed_at=now() WHERE id=$1`,
          [importId, message]
        );
        return {
          passed: false as const,
          message,
          rawRows: actual.raw_rows,
          sourceColumns: actual.source_columns,
          jobRoutes: actual.job_rows,
          operationRows: actual.operation_rows,
          jobsWithNextOperation: actual.jobs_with_next,
          nextOperationMatched: actual.next_matched,
          nextOperationCoverage: actual.jobs_with_next
            ? Number(((actual.next_matched / actual.jobs_with_next) * 100).toFixed(2))
            : 100,
        };
      }

      await client.query(`UPDATE route_import_runs SET is_active=false WHERE is_active=true AND id<>$1`, [importId]);
      await client.query(
        `UPDATE route_import_runs
         SET status='COMPLETED', is_active=true, completed_at=now(), error_message=NULL
         WHERE id=$1`,
        [importId]
      );

      return {
        passed: true as const,
        rawRows: actual.raw_rows,
        sourceColumns: actual.source_columns,
        jobRoutes: actual.job_rows,
        operationRows: actual.operation_rows,
        jobsWithNextOperation: actual.jobs_with_next,
        nextOperationMatched: actual.next_matched,
        nextOperationCoverage: actual.jobs_with_next
          ? Number(((actual.next_matched / actual.jobs_with_next) * 100).toFixed(2))
          : 100,
      };
    });

    if (!validation.passed) {
      return NextResponse.json({ error: validation.message ?? "Routing validation failed.", importId, validation }, { status: 422 });
    }
    return NextResponse.json({ importId, validation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to finalize routing import.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
