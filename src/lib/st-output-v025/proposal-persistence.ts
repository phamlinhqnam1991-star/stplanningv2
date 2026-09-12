import { withTransaction } from "@/lib/db";
import type {
  CombinedTimelineModel,
  ProductionStateSnapshot,
  TimelineItem,
} from "./types";

function proposalNo(now = new Date()) {
  const d = now.toISOString().slice(0, 10).replace(/-/g, "");
  const t = now.toISOString().slice(11, 19).replace(/:/g, "");
  return `PP-${d}-${t}`;
}

export async function persistProductionSnapshot(args: {
  snapshot: ProductionStateSnapshot;
  horizonStart?: string | null;
  horizonEnd?: string | null;
  sourceHash?: string | null;
}) {
  const result = await withTransaction(async (client) => {
    return client.query<{ id: number; snapshot_no: string; captured_at: Date }>(
      `insert into public.planning_production_snapshot(
         snapshot_no,captured_at,horizon_start,horizon_end,source_hash,snapshot_json,summary_json
       ) values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
       returning id,snapshot_no,captured_at`,
      [
        args.snapshot.snapshotId,
        args.snapshot.capturedAt,
        args.horizonStart ?? null,
        args.horizonEnd ?? null,
        args.sourceHash ?? null,
        JSON.stringify(args.snapshot),
        JSON.stringify(args.snapshot.summary),
      ],
    );
  });

  return result.rows[0];
}

export interface ProposedPlacementInput {
  sourceMode: "EXISTING_UNSCHEDULED" | "NEW_PROPOSED";
  existingBatchId?: number | null;
  mainOperation: string;
  recipeId?: number | null;
  recipeNo?: string | null;
  recipeName?: string | null;
  batchKey?: string | null;
  resourceType?: string | null;
  resourceCode?: string | null;
  loadingStart?: string | null;
  loadingEnd?: string | null;
  processStart?: string | null;
  processEnd?: string | null;
  ndtStart?: string | null;
  ndtEnd?: string | null;
  unloadingStart?: string | null;
  unloadingEnd?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  qty?: number;
  surfaceDm2?: number;
  processMinutes?: number | null;
  jobs: Array<{
    planningJobOperationId: number;
    jobNum: string;
    qty?: number;
    surfaceDm2?: number;
    sequenceNo?: number;
  }>;
}

export async function createProposedPlan(args: {
  snapshotDbId: number;
  whatIfRunId?: number | null;
  scenarioName?: string | null;
  model: CombinedTimelineModel;
  proposedPlacements: ProposedPlacementInput[];
  proposalNo?: string;
  cutoff?: string | null;
}) {
  const no = args.proposalNo || proposalNo();
  const s = args.model.outputSummary;

  return withTransaction(async (client) => {
    const planResult = await client.query<{
      id: number;
      proposal_no: string;
      status: string;
      created_at: Date;
    }>(
      `insert into public.planning_proposed_plan(
         proposal_no,snapshot_id,what_if_run_id,scenario_name,target_dm2,cutoff_time,status,
         already_final_dm2,existing_scheduled_dm2,existing_unscheduled_dm2,existing_plan_dm2,
         proposed_dm2,forecast_dm2,gap_dm2,output_ledger_json,timeline_json
       ) values(
         $1,$2,$3,$4,$5,$6,'READY',$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb
       ) returning id,proposal_no,status,created_at`,
      [
        no,
        args.snapshotDbId,
        args.whatIfRunId ?? null,
        args.scenarioName ?? null,
        s.targetDm2,
        args.cutoff ?? null,
        s.alreadyReachedFinalDm2,
        s.existingScheduledForecastDm2,
        s.existingUnscheduledForecastDm2,
        s.existingPlanForecastDm2,
        s.proposedAdditionalDm2,
        s.totalForecastDm2,
        s.gapDm2,
        JSON.stringify(args.model.outputLedger),
        JSON.stringify(args.model.items),
      ],
    );

    const plan = planResult.rows[0];

    for (const placement of args.proposedPlacements) {
      const batchResult = await client.query<{ id: number }>(
        `insert into public.planning_proposed_batch(
           proposed_plan_id,source_mode,existing_batch_id,main_operation,recipe_id,recipe_no,recipe_name,
           batch_key,resource_type,resource_code,loading_start,loading_end,process_start,process_end,
           ndt_start,ndt_end,unloading_start,unloading_end,start_time,end_time,qty,surface_dm2,
           process_minutes,status
         ) values(
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'PROPOSED'
         ) returning id`,
        [
          plan.id,
          placement.sourceMode,
          placement.existingBatchId ?? null,
          placement.mainOperation,
          placement.recipeId ?? null,
          placement.recipeNo ?? null,
          placement.recipeName ?? null,
          placement.batchKey ?? null,
          placement.resourceType ?? null,
          placement.resourceCode ?? null,
          placement.loadingStart ?? null,
          placement.loadingEnd ?? null,
          placement.processStart ?? null,
          placement.processEnd ?? null,
          placement.ndtStart ?? null,
          placement.ndtEnd ?? null,
          placement.unloadingStart ?? null,
          placement.unloadingEnd ?? null,
          placement.startTime ?? null,
          placement.endTime ?? null,
          placement.qty ?? 0,
          placement.surfaceDm2 ?? 0,
          placement.processMinutes ?? null,
        ],
      );

      const batchId = batchResult.rows[0].id;
      for (let index = 0; index < placement.jobs.length; index += 1) {
        const job = placement.jobs[index];
        await client.query(
          `insert into public.planning_proposed_batch_job(
             proposed_batch_id,planning_job_operation_id,job_num,qty,surface_dm2,sequence_no
           ) values($1,$2,$3,$4,$5,$6)`,
          [
            batchId,
            job.planningJobOperationId,
            job.jobNum,
            job.qty ?? 0,
            job.surfaceDm2 ?? 0,
            job.sequenceNo ?? index + 1,
          ],
        );
      }
    }

    return plan;
  });
}

export function proposedItemsFromTimeline(items: TimelineItem[]) {
  return items.filter(
    (item) =>
      item.state === "PROPOSED_EXISTING_BATCH" ||
      item.state === "PROPOSED_NEW_BATCH",
  );
}
