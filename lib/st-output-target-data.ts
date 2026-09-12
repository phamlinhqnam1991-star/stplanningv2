import { query } from "@/lib/db";
import type { RouteOperationForAnalysis } from "@/lib/route-analysis";
import { currentPlanningJobsSource } from "@/lib/current-job-read-model";

export type StOutputSourceJobRow = Record<string, unknown>;

export type StOutputBatchAssignment = {
  batchNo: string;
  mainOperationCode: string;
  status: string;
  processTimeMinutes: number | null;
  createdAt: string;
  scheduleDate: string | null;
  startTime: string | null;
  endTime: string | null;
  scheduleDurationMinutes: number | null;
  scheduleStatus: string | null;
  routePosition: number | null;
  sourceOperation: string | null;
  nextPlanningOperation: string | null;
};

export type StOutputTargetData = {
  rows: StOutputSourceJobRow[];
  operationsByRouteId: Map<number, RouteOperationForAnalysis[]>;
  batchesByJob: Map<string, StOutputBatchAssignment[]>;
  warnings: string[];
  duplicateJobNums: string[];
};

export type LoadStOutputTargetDataOptions = {
  planningSheetName: string;
  search?: string;
  maxRows: number;
};

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * v025.5 source loader for ST Output Target.
 *
 * This intentionally reads the existing Clean Rebuild schema and does not
 * create a second planning/scheduling model. One active Planning row is kept
 * per Job Number so output dm2 can never be multiplied by duplicate source rows.
 */
export async function loadStOutputTargetData(
  options: LoadStOutputTargetDataOptions,
): Promise<StOutputTargetData> {
  const warnings: string[] = [];
  const params: unknown[] = [options.planningSheetName];
  const where: string[] = [];

  if (options.search?.trim()) {
    params.push(`%${options.search.trim()}%`);
    where.push(
      `(p.job_num ILIKE $${params.length} OR p.epicor_part ILIKE $${params.length} OR p.program ILIKE $${params.length})`,
    );
  }

  params.push(options.maxRows);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const base = await query(`
    SELECT
      p.id,
      p.source_row_no,
      p.program,
      p.epicor_part,
      p.job_num,
      p.next_operation,
      p.last_labor_op,
      p.prod_qty,
      p.current_good_wip_qty,
      p.surface_dm2,
      p.all_operation,
      p.current_job_duplicate_count,
      rr.row_data AS raw_row_data,
      jr.id AS route_id,
      jr.next_operation AS route_next_operation,
      jr.last_labor_op AS route_last_labor_op,
      jr.last_labor_opr_seq AS route_last_labor_opr_seq,
      jr.revision_num AS route_revision_num,
      COALESCE(ri.completed_at,ri.imported_at) AS route_snapshot_at
    FROM ${currentPlanningJobsSource("p")}
    LEFT JOIN raw_sheet_rows rr
      ON rr.import_id=p.import_id
     AND rr.sheet_name=$1
     AND rr.source_row_no=p.source_row_no
    LEFT JOIN LATERAL (
      SELECT jr0.*
      FROM v_active_job_routes jr0
      WHERE jr0.job_num=p.job_num
      ORDER BY jr0.source_row_no DESC,jr0.id DESC
      LIMIT 1
    ) jr ON true
    LEFT JOIN route_import_runs ri ON ri.id=jr.import_id
    ${whereSql}
    ORDER BY p.source_row_no
    LIMIT $${params.length}`,
    params,
  );

  // One Job contributes output only once. If the source contains duplicates,
  // keep the latest source row deterministically and surface a warning.
  const rowByJob = new Map<string, StOutputSourceJobRow>();
  const duplicateSet = new Set<string>();
  for (const raw of base.rows as StOutputSourceJobRow[]) {
    const jobNum = text(raw.job_num);
    if (!jobNum) continue;
    if (Number(raw.current_job_duplicate_count || 0) > 1) duplicateSet.add(jobNum);
    const previous = rowByJob.get(jobNum);
    if (!previous) {
      rowByJob.set(jobNum, raw);
      continue;
    }
    duplicateSet.add(jobNum);
    const previousRowNo = Number(previous.source_row_no ?? -1);
    const currentRowNo = Number(raw.source_row_no ?? -1);
    if (currentRowNo >= previousRowNo) rowByJob.set(jobNum, raw);
  }

  const rows = [...rowByJob.values()].sort(
    (a, b) => Number(a.source_row_no ?? 0) - Number(b.source_row_no ?? 0),
  );
  const duplicateJobNums = [...duplicateSet].sort();
  if (duplicateJobNums.length) {
    warnings.push(`DUPLICATE_JOB_ROWS_SUPPRESSED:${duplicateJobNums.length}`);
  }

  const routeIds = unique(
    rows
      .map((row) => Number(row.route_id))
      .filter((value) => Number.isFinite(value)),
  );
  const jobNums = unique(rows.map((row) => text(row.job_num)).filter(Boolean));

  const operationsByRouteId = new Map<number, RouteOperationForAnalysis[]>();
  if (routeIds.length) {
    const ops = await query(
      `SELECT job_route_id,operation_position,operation_code,operation_seq,is_complete,open_nonconformance,source_operation_text
       FROM v_active_job_operation_sequence
       WHERE job_route_id=ANY($1::bigint[])
       ORDER BY job_route_id,operation_position`,
      [routeIds],
    );

    for (const raw of ops.rows as Record<string, unknown>[]) {
      const routeId = Number(raw.job_route_id);
      if (!Number.isFinite(routeId)) continue;
      const list = operationsByRouteId.get(routeId) ?? [];
      list.push({
        position: Number(raw.operation_position),
        code: text(raw.operation_code),
        sequence: numberOrNull(raw.operation_seq),
        complete: raw.is_complete == null ? null : Boolean(raw.is_complete),
        openNonconformance:
          raw.open_nonconformance == null ? null : String(raw.open_nonconformance),
        sourceText: text(raw.source_operation_text),
      });
      operationsByRouteId.set(routeId, list);
    }
  }

  const batchesByJob = new Map<string, StOutputBatchAssignment[]>();
  if (jobNums.length) {
    const batches = await query(
      `SELECT
         j.job_num,
         b.batch_no,
         b.main_operation_code,
         b.status,
         b.process_time_minutes,
         b.created_at,
         NULLIF(j.candidate_snapshot->>'routePosition','')::integer AS route_position,
         COALESCE(
           NULLIF(j.candidate_snapshot->>'nextStOperation',''),
           NULLIF(j.candidate_snapshot->>'nextOperation','')
         ) AS source_operation,
         NULLIF(j.candidate_snapshot->>'nextPlanningOperation','') AS next_planning_operation,
         s.schedule_date,
         s.start_time,
         s.end_time,
         s.duration_minutes AS schedule_duration_minutes,
         s.status AS schedule_status
       FROM planning_batch_jobs j
       JOIN planning_batches b ON b.id=j.batch_id
       LEFT JOIN LATERAL (
         SELECT x.schedule_date,x.start_time,x.end_time,x.duration_minutes,x.status
         FROM v_active_schedule_blocks x
         WHERE x.batch_ref=b.batch_no
         ORDER BY x.schedule_date DESC,x.source_row_no DESC
         LIMIT 1
       ) s ON true
       WHERE j.job_num=ANY($1::text[])
         AND b.status<>'CANCELLED'
       ORDER BY j.job_num,b.created_at DESC`,
      [jobNums],
    );

    for (const raw of batches.rows as Record<string, unknown>[]) {
      const jobNum = text(raw.job_num);
      if (!jobNum) continue;
      const list = batchesByJob.get(jobNum) ?? [];
      list.push({
        batchNo: text(raw.batch_no),
        mainOperationCode: text(raw.main_operation_code),
        status: text(raw.status),
        processTimeMinutes: numberOrNull(raw.process_time_minutes),
        createdAt: text(raw.created_at),
        scheduleDate:
          raw.schedule_date == null ? null : String(raw.schedule_date).slice(0, 10),
        startTime: raw.start_time == null ? null : String(raw.start_time),
        endTime: raw.end_time == null ? null : String(raw.end_time),
        scheduleDurationMinutes: numberOrNull(raw.schedule_duration_minutes),
        scheduleStatus:
          raw.schedule_status == null ? null : String(raw.schedule_status),
        routePosition: numberOrNull(raw.route_position),
        sourceOperation:
          raw.source_operation == null ? null : String(raw.source_operation),
        nextPlanningOperation:
          raw.next_planning_operation == null
            ? null
            : String(raw.next_planning_operation),
      });
      batchesByJob.set(jobNum, list);
    }
  }

  return {
    rows,
    operationsByRouteId,
    batchesByJob,
    warnings,
    duplicateJobNums,
  };
}
