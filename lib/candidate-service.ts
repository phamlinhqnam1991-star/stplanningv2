import { query } from "@/lib/db";
import { getConfigBootstrap, routeConfigOptionsFromSettings, sourceDisplayColumns } from "@/lib/config";
import type { RouteOperationForAnalysis } from "@/lib/route-analysis";
import { currentPlanningJobsSource } from "@/lib/current-job-read-model";
import { resolveErpState } from "@/lib/erp-state-kernel";
import { classifyOperationRoute, getPlanningModel } from "@/lib/planning-model";
import { getRecipeModel, resolveProcessTime, resolveRecipe } from "@/lib/recipe-model";
import { getBatchModel, resolveBatchProposal, type BatchModel } from "@/lib/batch-model";

export type CandidateRow = {
  planningJobId: number;
  sourceRowNo: number;
  jobNum: string;
  program: string | null;
  partCluster: string | null;
  part: string | null;
  revision: string | null;
  description: string | null;
  qty: number | null;
  surfaceDm2: number | null;
  nextOperation: string | null;
  nextStOperation: string | null;
  routePosition: number | null;
  routeOccurrenceKey: string | null;
  routeAnchorConfidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  routeWarnings: string[];
  routeOperationCount: number | null;
  planningSourceOperation: string | null;
  planningRoutePosition: number | null;
  planningOccurrenceKey: string | null;
  nextPlanningOperation: ReturnType<typeof classifyOperationRoute>["nextPlanningOperation"];
  recipeSuggestion: ReturnType<typeof resolveRecipe>;
  processTimeSuggestion: ReturnType<typeof resolveProcessTime>;
  batchProposal: ReturnType<typeof resolveBatchProposal>;
};

type LoadOptions = {
  search?: string;
  mainOperation?: string;
  eligibleOnly?: boolean;
  planningJobIds?: number[];
  scanLimit?: number;
};


function operationOccurrenceKey(operations: RouteOperationForAnalysis[], target: RouteOperationForAnalysis | null): string | null {
  if (!target) return null;
  const sorted=[...operations].sort((a,b)=>a.position-b.position);
  let occurrence=0;
  for (const op of sorted) {
    if (String(op.code||"").trim().toUpperCase()===String(target.code||"").trim().toUpperCase()) occurrence+=1;
    if (op.position===target.position) return `${target.code}#${occurrence}`;
  }
  return null;
}

function addLike(params: unknown[], value: string) {
  params.push(`%${value}%`);
  return `$${params.length}`;
}

export async function loadCandidateRows(options: LoadOptions = {}): Promise<CandidateRow[]> {
  const [bootstrap, planningModel, recipeModel, batchModel] = await Promise.all([
    getConfigBootstrap(), getPlanningModel(), getRecipeModel(), getBatchModel(),
  ]);
  const planningProfile = bootstrap.sources.PLANNING;
  const sheetName = planningProfile.sheetName || planningProfile.displayName;
  const display = sourceDisplayColumns(planningProfile);
  const revisionColumn = display.revisionNum || "CG";
  const routeOptions = routeConfigOptionsFromSettings(bootstrap.settings);
  const params: unknown[] = [sheetName];
  const where: string[] = [];
  const search = (options.search || "").trim();
  if (search) {
    const p = addLike(params, search);
    where.push(`(p.job_num ILIKE ${p} OR p.epicor_part ILIKE ${p} OR p.program ILIKE ${p} OR p.part_description ILIKE ${p} OR p.next_operation ILIKE ${p})`);
  }
  if (options.planningJobIds?.length) {
    params.push(options.planningJobIds);
    where.push(`p.id = ANY($${params.length}::bigint[])`);
  }
  const settingsLimit = Number(batchModel.settings["batchModel.candidateScanLimit"] || 1000);
  const scanLimit = Math.max(1, Math.min(5000, options.scanLimit || (Number.isFinite(settingsLimit) ? settingsLimit : 1000)));
  params.push(scanLimit);
  const limitParam = `$${params.length}`;
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await query(`
    SELECT p.id, p.source_row_no, p.program, p.part_cluster, p.epicor_part, p.part_description,
           p.job_num, p.last_labor_op, p.next_operation, p.prod_qty, p.surface_dm2, p.all_operation,
           rr.row_data AS raw_row_data,
           rr.row_data->'${revisionColumn}'->>'v' AS revision_num,
           route.route_id, route.route_next_operation, route.route_last_labor_op, route.route_last_labor_opr_seq, route.route_operation_count,
           COALESCE(route.route_operations,'[]'::jsonb) AS route_operations
    FROM ${currentPlanningJobsSource("p")}
    LEFT JOIN raw_sheet_rows rr
      ON rr.import_id=p.import_id AND rr.sheet_name=$1 AND rr.source_row_no=p.source_row_no
    LEFT JOIN LATERAL (
      SELECT jr.id AS route_id, jr.next_operation AS route_next_operation, jr.last_labor_op AS route_last_labor_op, jr.last_labor_opr_seq AS route_last_labor_opr_seq, jr.operation_count AS route_operation_count,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'position', ro.operation_position,
                 'code', ro.operation_code,
                 'sequence', ro.operation_seq,
                 'complete', ro.is_complete,
                 'openNonconformance', ro.open_nonconformance,
                 'sourceText', ro.source_operation_text
               ) ORDER BY ro.operation_position)
               FROM v_active_job_operation_sequence ro WHERE ro.job_route_id=jr.id
             ), '[]'::jsonb) AS route_operations
      FROM v_active_job_routes jr
      WHERE jr.job_num=p.job_num
      ORDER BY jr.source_row_no DESC, jr.id DESC
      LIMIT 1
    ) route ON true
    ${whereSql}
    ORDER BY p.source_row_no
    LIMIT ${limitParam}`,
    params
  );

  const out: CandidateRow[] = [];
  for (const row of rows.rows as Record<string, unknown>[]) {
    const routeOperations = (row.route_operations || []) as RouteOperationForAnalysis[];
    const erpState = row.route_id
      ? resolveErpState({
          jobNum: String(row.job_num || ""),
          operations: routeOperations,
          allOperation: row.all_operation as string | null,
          evidence: {
            nextOperation: (row.route_next_operation as string | null) || (row.next_operation as string | null),
            lastLaborOp: (row.route_last_labor_op as string | null) || (row.last_labor_op as string | null),
            lastLaborSequence: row.route_last_labor_opr_seq == null ? null : Number(row.route_last_labor_opr_seq),
          },
          routeOptions,
        })
      : null;
    const routeAnalysis = erpState?.route || null;
    const planningClassification = routeAnalysis
      ? classifyOperationRoute(routeAnalysis.remainingStRoute.map((op) => op.code), planningModel)
      : null;
    const nextPlanning = planningClassification?.nextPlanningOperation || null;
    const nextPlanningStepIndex = nextPlanning
      ? (planningClassification?.steps.findIndex((step) => step.planningEnabled && step.mainOperationCode === nextPlanning.code) ?? -1)
      : -1;
    const nextPlanningSourceOperation = nextPlanningStepIndex >= 0
      ? planningClassification?.steps[nextPlanningStepIndex]?.sourceOperation || routeAnalysis?.nextStOperation || null
      : routeAnalysis?.nextStOperation || null;
    const planningRouteOperation = nextPlanningStepIndex >= 0
      ? routeAnalysis?.remainingStRoute[nextPlanningStepIndex] || null
      : null;
    const planningOccurrenceKey = operationOccurrenceKey(routeOperations, planningRouteOperation);
    const recipe = resolveRecipe(nextPlanning?.code || null, row.raw_row_data, recipeModel);
    const processTime = resolveProcessTime(nextPlanning?.code || null, row.raw_row_data, recipe, recipeModel, {
      operationCode: nextPlanningSourceOperation,
      qty: row.prod_qty == null ? null : Number(row.prod_qty),
      surfaceDm2: row.surface_dm2 == null ? null : Number(row.surface_dm2),
    });
    const proposal = resolveBatchProposal({
      planningJobId: Number(row.id), jobNum: String(row.job_num || ""), program: row.program as string | null,
      partCluster: row.part_cluster as string | null, part: row.epicor_part as string | null,
      revision: row.revision_num as string | null, nextOperation: row.next_operation as string | null,
      nextStOperation: routeAnalysis?.nextStOperation || null, mainOperation: nextPlanning,
      recipe, processTime, qty: row.prod_qty == null ? null : Number(row.prod_qty),
      surfaceDm2: row.surface_dm2 == null ? null : Number(row.surface_dm2), rawRow: row.raw_row_data,
    }, batchModel);
    if (options.mainOperation && nextPlanning?.code !== options.mainOperation) continue;
    if (options.eligibleOnly && !proposal.eligible) continue;
    out.push({
      planningJobId: Number(row.id), sourceRowNo: Number(row.source_row_no), jobNum: String(row.job_num || ""),
      program: row.program as string | null, partCluster: row.part_cluster as string | null,
      part: row.epicor_part as string | null, revision: row.revision_num as string | null,
      description: row.part_description as string | null,
      qty: row.prod_qty == null ? null : Number(row.prod_qty), surfaceDm2: row.surface_dm2 == null ? null : Number(row.surface_dm2),
      nextOperation: row.next_operation as string | null, nextStOperation: routeAnalysis?.nextStOperation || null,
      routePosition: routeAnalysis?.currentPosition || null,
      routeOccurrenceKey: routeAnalysis?.currentOccurrenceKey || null,
      routeAnchorConfidence: routeAnalysis?.anchorConfidence || "NONE",
      routeWarnings: routeAnalysis?.anchorWarnings || [],
      routeOperationCount: row.route_operation_count == null ? null : Number(row.route_operation_count),
      planningSourceOperation: nextPlanningSourceOperation,
      planningRoutePosition: planningRouteOperation?.position ?? null,
      planningOccurrenceKey,
      nextPlanningOperation: nextPlanning, recipeSuggestion: recipe, processTimeSuggestion: processTime, batchProposal: proposal,
    });
  }
  if (out.length) {
    const blockingStatuses = batchModel.statuses
      .filter((status: BatchModel["statuses"][number]) => status.data.blocksCandidate !== false)
      .map((status: BatchModel["statuses"][number]) => status.code);
    const jobNums=[...new Set(out.map((row)=>row.jobNum).filter(Boolean))];
    const blockedPairs=new Set<string>();
    if (jobNums.length && blockingStatuses.length) {
      // v026.2 canonical Commitment Ledger. Keep the legacy Batch join in the same
      // query so upgraded databases remain correct even before every historical
      // Batch has a backfilled commitment row.
      const open=await query<{job_num:string;main_operation_code:string}>(`
        SELECT DISTINCT x.job_num,x.main_operation_code
        FROM (
          SELECT c.job_num,c.main_operation_code
          FROM erp_job_commitments c
          WHERE c.state='ACTIVE' AND upper(btrim(c.job_num)) = ANY($1::text[])
          UNION
          SELECT j.job_num,b.main_operation_code
          FROM planning_batch_jobs j
          JOIN planning_batches b ON b.id=j.batch_id
          WHERE upper(btrim(j.job_num)) = ANY($1::text[])
            AND b.status = ANY($2::text[])
        ) x`, [jobNums.map((job)=>job.trim().toUpperCase()),blockingStatuses]);
      for(const row of open.rows) blockedPairs.add(`${String(row.job_num||"").trim().toUpperCase()}|${String(row.main_operation_code||"").trim().toUpperCase()}`);
    }
    for (const row of out) {
      const main=row.nextPlanningOperation?.code||"";
      const pair=`${row.jobNum.trim().toUpperCase()}|${main.trim().toUpperCase()}`;
      if (!main || !blockedPairs.has(pair)) continue;
      row.batchProposal = {
        ...row.batchProposal,
        eligible:false,
        eligibilityReason:`Job already has an active commitment for ${main}.`,
        warnings:[...row.batchProposal.warnings,"ACTIVE_COMMITMENT_EXISTS"],
      };
    }
  }
  return options.eligibleOnly ? out.filter((row) => row.batchProposal.eligible) : out;
}
