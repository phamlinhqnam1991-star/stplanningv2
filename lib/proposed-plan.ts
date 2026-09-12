import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";
import {
  calculateFiniteCapacityTarget,
  type FiniteCapacityOptions,
} from "@/lib/finite-capacity-scheduler";
import {
  calculateStOutputTarget,
  type StOutputJobAssessment,
} from "@/lib/st-output-engine";
import type { CapacityScenarioOverride } from "@/lib/capacity-scenario";
import {
  batchNumberPattern,
  getBatchModel,
  type BatchModel,
} from "@/lib/batch-model";
import {
  acquireCommitmentLocks,
  findActiveCommitmentConflicts,
  insertCommitment,
  writeAuditEvent,
  type CommitmentTarget,
} from "@/lib/commitment-ledger";
import { createScheduleReservation } from "@/lib/scheduling-ledger";
import { currentPlanningJobsSource } from "@/lib/current-job-read-model";

export type ProposalConflictCode =
  | "RESOURCE_CHANGED"
  | "TIME_OVERLAP"
  | "JOB_ALREADY_PLANNED"
  | "BATCH_CHANGED"
  | "RECIPE_CHANGED"
  | "DEPENDENCY_CHANGED"
  | "EXECUTION_CHANGED"
  | "FINAL_ROUTE_CHANGED"
  | "MISSING_RESOURCE_TIME";

export type ProposalConflict = {
  code: ProposalConflictCode;
  proposedBatchId: number;
  batchNo: string;
  jobNum?: string | null;
  detail: string;
};

export type ProposalAcceptMode = "ALL" | "SELECTED";

type LiveOutputMap = Map<string, StOutputJobAssessment>;

const norm = (v: unknown) => String(v ?? "").trim().toUpperCase();
function safePrefix(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 12) || "BAT";
}
function ddMon(date: Date) {
  const mon = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][date.getUTCMonth()];
  return `${String(date.getUTCDate()).padStart(2, "0")}${mon}`;
}
function yyyymmdd(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}
function renderBatchNo(pattern: string, prefix: string, main: string, seq: number, date: Date) {
  return pattern
    .replaceAll("{SHORT}", prefix)
    .replaceAll("{MAIN}", safePrefix(main))
    .replaceAll("{YYYYMMDD}", yyyymmdd(date))
    .replaceAll("{DDMMM}", ddMon(date))
    .replaceAll("{SEQ3}", String(seq).padStart(3, "0"))
    .replaceAll("{SEQ4}", String(seq).padStart(4, "0"));
}

async function lockProposalNumbering(client: PoolClient) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('ST_PROPOSAL_NUMBERING:'||CURRENT_DATE::text,0))",
  );
}
async function nextProposalNo(client: PoolClient) {
  const r = await client.query<{ n: string }>(
    `SELECT 'PROP_'||to_char(CURRENT_DATE,'YYYYMMDD')||'_'||lpad((count(*)+1)::text,3,'0') AS n
       FROM planning_proposed_plan
      WHERE created_at::date=CURRENT_DATE`,
  );
  return r.rows[0]?.n || `PROP_${Date.now()}`;
}
async function nextSnapshotNo(client: PoolClient) {
  const r = await client.query<{ n: string }>(
    `SELECT 'SNAP_'||to_char(CURRENT_DATE,'YYYYMMDD')||'_'||lpad((count(*)+1)::text,3,'0') AS n
       FROM planning_production_snapshot
      WHERE created_at::date=CURRENT_DATE`,
  );
  return r.rows[0]?.n || `SNAP_${Date.now()}`;
}

function routeOccurrenceForJob(
  outputRows: StOutputJobAssessment[],
  jobNum: string,
  mainOperation: string,
) {
  const row = outputRows.find((x) => norm(x.jobNum) === norm(jobNum));
  if (!row) {
    return {
      planningJobId: null as number | null,
      routePosition: null as number | null,
      routeOccurrenceKey: null as string | null,
      operationCode: null as string | null,
      recipeNo: null as string | null,
    };
  }
  const step = row.steps.find((x) => norm(x.mainOperation?.code) === norm(mainOperation));
  return {
    planningJobId: row.planningJobId,
    routePosition: step?.routePosition ?? null,
    routeOccurrenceKey: step?.routeOccurrenceKey ?? null,
    operationCode: step?.operationCode ?? null,
    recipeNo: step?.recipe.recipeNo ?? null,
  };
}

export async function createProposedPlan(
  input: FiniteCapacityOptions & {
    scenarioName?: string;
    scenario?: CapacityScenarioOverride | null;
  },
) {
  // Simulation remains read-only. Proposal persistence starts only after both
  // finite-capacity and canonical output projections have completed.
  const [capacity, output] = await Promise.all([
    calculateFiniteCapacityTarget(
      {
        targetDate: input.targetDate,
        cutoffTime: input.cutoffTime,
        targetValue: input.targetValue,
      },
      input.scenario || null,
    ),
    calculateStOutputTarget({
      targetDate: input.targetDate,
      cutoffTime: input.cutoffTime,
      targetValue: input.targetValue,
    }),
  ]);

  return withTransaction(async (client) => {
    await lockProposalNumbering(client);
    const snapshotNo = await nextSnapshotNo(client);
    const proposalNo = await nextProposalNo(client);
    const snapshot = await client.query<{ id: string }>(
      `INSERT INTO planning_production_snapshot(
         snapshot_no,horizon_start,horizon_end,source_hash,snapshot_json,summary_json
       ) VALUES($1,$2::timestamptz,$3::timestamptz,$4,$5::jsonb,$6::jsonb)
       RETURNING id::text`,
      [
        snapshotNo,
        capacity.scenarioStartAt,
        capacity.horizonEndAt,
        `${input.targetDate}|${input.cutoffTime}|${capacity.timeline.length}|${capacity.batches.length}`,
        JSON.stringify({
          targetDate: input.targetDate,
          cutoffTime: input.cutoffTime,
          scenario: input.scenario || null,
          timeline: capacity.timeline,
        }),
        JSON.stringify(capacity.summary),
      ],
    );
    const plan = await client.query<{ id: string }>(
      `INSERT INTO planning_proposed_plan(
         proposal_no,snapshot_id,scenario_name,target_dm2,cutoff_time,status,
         already_final_dm2,existing_scheduled_dm2,existing_unscheduled_dm2,
         existing_plan_dm2,proposed_dm2,forecast_dm2,gap_dm2,
         output_ledger_json,timeline_json
       ) VALUES(
         $1,$2,$3,$4,$5::timestamptz,'READY',$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb
       ) RETURNING id::text`,
      [
        proposalNo,
        Number(snapshot.rows[0].id),
        input.scenarioName?.trim() || input.scenario?.name || "Finite Capacity Best Plan",
        input.targetValue,
        capacity.cutoffAt,
        output.ledgerSummary.actualFinalSurfaceDm2,
        output.ledgerSummary.existingScheduledSurfaceDm2,
        output.ledgerSummary.existingUnscheduledSurfaceDm2,
        output.summary.existingPlanForecastSurface,
        capacity.ledgerSummary.proposedSurfaceDm2,
        capacity.ledgerSummary.countedSurfaceDm2,
        Math.max(0, input.targetValue - capacity.ledgerSummary.countedSurfaceDm2),
        JSON.stringify(capacity.outputLedger),
        JSON.stringify(capacity.timeline),
      ],
    );
    const planId = Number(plan.rows[0].id);
    let batchCount = 0;

    for (const b of capacity.batches.filter((x) => x.sourceKind !== "FIXED_SCHEDULE")) {
      const existing =
        b.sourceKind === "EXISTING_BATCH"
          ? await client.query<{ id: string; version: number }>(
              `SELECT id::text,version FROM planning_batches WHERE batch_no=$1 LIMIT 1`,
              [b.batchNo],
            )
          : null;
      const sourceMode =
        b.sourceKind === "EXISTING_BATCH" ? "EXISTING_UNSCHEDULED" : "NEW_PROPOSED";
      const pb = await client.query<{ id: string }>(
        `INSERT INTO planning_proposed_batch(
           proposed_plan_id,source_mode,existing_batch_id,main_operation,recipe_no,recipe_name,
           batch_key,resource_type,resource_code,start_time,end_time,qty,surface_dm2,
           process_minutes,status,expected_existing_batch_version,selected
         ) VALUES(
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz,$12,$13,$14,
           'PROPOSED',$15,true
         ) RETURNING id::text`,
        [
          planId,
          sourceMode,
          existing?.rows[0]?.id || null,
          b.mainOperationCode,
          b.recipeNo,
          b.recipeName,
          b.batchKey,
          b.resourceBase || "FINITE_RESOURCE",
          b.resourceInstance || b.resourceBase,
          b.startAt,
          b.endAt,
          b.totalQty,
          b.totalSurfaceDm2,
          b.durationMinutes,
          existing?.rows[0]?.version ?? null,
        ],
      );
      const proposedBatchId = Number(pb.rows[0].id);
      batchCount += 1;

      for (let i = 0; i < b.jobs.length; i += 1) {
        const job = b.jobs[i];
        const route = routeOccurrenceForJob(output.rows, job, b.mainOperationCode);
        const jobResult = capacity.jobs.find((x) => norm(x.jobNum) === norm(job));
        await client.query(
          `INSERT INTO planning_proposed_batch_job(
             proposed_batch_id,planning_job_operation_id,planning_job_id,job_num,qty,surface_dm2,
             sequence_no,route_occurrence_key,route_position,operation_code,main_operation_code,selected
           ) VALUES($1,NULL,$2,$3,NULL,$4,$5,$6,$7,$8,$9,true)`,
          [
            proposedBatchId,
            route.planningJobId,
            job,
            jobResult?.surfaceDm2 ?? 0,
            i + 1,
            route.routeOccurrenceKey,
            route.routePosition,
            route.operationCode,
            b.mainOperationCode,
          ],
        );
      }
    }

    await writeAuditEvent(client, {
      eventType: "PROPOSED_PLAN_CREATED",
      entityType: "PROPOSED_PLAN",
      entityId: String(planId),
      actor: "PUBLIC_UI",
      newState: {
        proposalNo,
        status: "READY",
        batchCount,
        targetDm2: input.targetValue,
        forecastDm2: capacity.ledgerSummary.countedSurfaceDm2,
        gapDm2: Math.max(0, input.targetValue - capacity.ledgerSummary.countedSurfaceDm2),
      },
      metadata: { snapshotNo, scenario: input.scenario || null },
    });
    return { proposalId: planId, proposalNo, snapshotNo, batchCount, capacity };
  });
}

async function resourceConflicts(
  client: PoolClient,
  resourceCode: string,
  startAt: string,
  endAt: string,
  excludeBatchId?: string | null,
) {
  const r = await client.query<{
    id: string;
    batch_no: string;
    start_at: string;
    end_at: string;
  }>(
    `SELECT id::text,batch_no,start_at::text,end_at::text
       FROM erp_schedule_reservations
      WHERE state='ACTIVE'
        AND upper(btrim(resource_code))=upper(btrim($1))
        AND start_at<$3::timestamptz
        AND end_at>$2::timestamptz
        AND ($4::uuid IS NULL OR batch_id<>$4::uuid)
      ORDER BY start_at
      LIMIT 20`,
    [resourceCode, startAt, endAt, excludeBatchId || null],
  );
  return r.rows;
}

async function loadLiveOutputForProposal(proposalId: number): Promise<LiveOutputMap> {
  const meta = await query<{
    target_date: string;
    cutoff_time_text: string;
    target_dm2: string;
  }>(
    `SELECT to_char(cutoff_time AT TIME ZONE 'UTC','YYYY-MM-DD') AS target_date,
            to_char(cutoff_time AT TIME ZONE 'UTC','HH24:MI') AS cutoff_time_text,
            target_dm2::text
       FROM planning_proposed_plan
      WHERE id=$1`,
    [proposalId],
  );
  if (!meta.rows[0]) throw new Error("Proposed Plan not found.");
  const output = await calculateStOutputTarget({
    targetDate: meta.rows[0].target_date,
    cutoffTime: meta.rows[0].cutoff_time_text,
    targetValue: Number(meta.rows[0].target_dm2 || 0),
  });
  return new Map(output.rows.map((row) => [norm(row.jobNum), row]));
}

function validateLiveJob(
  rawBatch: Record<string, unknown>,
  job: Record<string, unknown>,
  liveOutput: LiveOutputMap,
): ProposalConflict[] {
  const conflicts: ProposalConflict[] = [];
  const proposedBatchId = Number(rawBatch.id);
  const batchNo = String(rawBatch.existing_batch_no || `PROPOSED-${proposedBatchId}`);
  const jobNum = String(job.job_num || "");
  const live = liveOutput.get(norm(jobNum));
  if (!live) {
    conflicts.push({
      code: "FINAL_ROUTE_CHANGED",
      proposedBatchId,
      batchNo,
      jobNum,
      detail: `${jobNum} is no longer in the current ST Output population.`,
    });
    return conflicts;
  }
  if (live.outputStatus === "OUTPUT" || live.outputBucket === "ALREADY_REACHED_FINAL") {
    conflicts.push({
      code: "EXECUTION_CHANGED",
      proposedBatchId,
      batchNo,
      jobNum,
      detail: `${jobNum} already reached ${live.finalGateCode || "Final Gate"}.`,
    });
    return conflicts;
  }
  const occurrence = String(job.route_occurrence_key || "");
  const routePosition = job.route_position == null ? null : Number(job.route_position);
  const operationCode = norm(job.operation_code);
  const liveStep = live.steps.find(
    (step) =>
      (occurrence && step.routeOccurrenceKey === occurrence) ||
      (routePosition != null && step.routePosition === routePosition),
  );
  if (!liveStep || (operationCode && norm(liveStep.operationCode) !== operationCode)) {
    conflicts.push({
      code: "FINAL_ROUTE_CHANGED",
      proposedBatchId,
      batchNo,
      jobNum,
      detail: `${jobNum} physical route occurrence ${occurrence || routePosition || "?"} changed or disappeared.`,
    });
    return conflicts;
  }
  if (norm(liveStep.mainOperation?.code) !== norm(rawBatch.main_operation)) {
    conflicts.push({
      code: "DEPENDENCY_CHANGED",
      proposedBatchId,
      batchNo,
      jobNum,
      detail: `${jobNum} occurrence now resolves to ${liveStep.mainOperation?.code || "no Planning Main"}, not ${rawBatch.main_operation}.`,
    });
  }
  if (
    rawBatch.recipe_no &&
    liveStep.recipe.recipeNo &&
    norm(rawBatch.recipe_no) !== norm(liveStep.recipe.recipeNo)
  ) {
    conflicts.push({
      code: "RECIPE_CHANGED",
      proposedBatchId,
      batchNo,
      jobNum,
      detail: `${jobNum} Recipe changed from ${rawBatch.recipe_no} to ${liveStep.recipe.recipeNo}.`,
    });
  }
  if (["RUNNING", "COMPLETE"].includes(liveStep.state)) {
    conflicts.push({
      code: "EXECUTION_CHANGED",
      proposedBatchId,
      batchNo,
      jobNum,
      detail: `${jobNum} occurrence ${liveStep.routeOccurrenceKey} is already ${liveStep.state}.`,
    });
  }
  return conflicts;
}

async function revalidateProposalTx(
  client: PoolClient,
  proposalId: number,
  writeState: boolean,
  liveOutput: LiveOutputMap,
  selectedOnly = false,
) {
  const plan = await client.query<{ id: string; status: string; version: number }>(
    `SELECT id::text,status,version
       FROM planning_proposed_plan
      WHERE id=$1
      FOR UPDATE`,
    [proposalId],
  );
  const planRow = plan.rows[0];
  if (!planRow) throw new Error("Proposed Plan not found.");
  if (["ACCEPTED", "REJECTED"].includes(planRow.status)) {
    throw new Error(`Proposed Plan is ${planRow.status}.`);
  }

  const batches = await client.query(
    `SELECT pb.*,b.batch_no AS existing_batch_no,b.version AS live_batch_version,b.status AS live_batch_status
       FROM planning_proposed_batch pb
       LEFT JOIN planning_batches b ON b.id=pb.existing_batch_id
      WHERE pb.proposed_plan_id=$1
        AND pb.status IN ('PROPOSED','SELECTED','CONFLICT')
        AND ($2::boolean=false OR pb.selected=true)
      ORDER BY pb.id`,
    [proposalId, selectedOnly],
  );
  const conflicts: ProposalConflict[] = [];

  for (const raw of batches.rows as Record<string, unknown>[]) {
    const id = Number(raw.id);
    const batchNo = String(raw.existing_batch_no || `PROPOSED-${id}`);
    const resource = String(raw.resource_code || "");
    const start = raw.start_time ? String(raw.start_time) : "";
    const end = raw.end_time ? String(raw.end_time) : "";
    if (!resource || !start || !end) {
      conflicts.push({
        code: "MISSING_RESOURCE_TIME",
        proposedBatchId: id,
        batchNo,
        detail: "Proposal has no finite resource or start/end time.",
      });
      continue;
    }

    if (String(raw.source_mode) === "EXISTING_UNSCHEDULED") {
      if (raw.live_batch_version == null || !raw.existing_batch_no) {
        conflicts.push({
          code: "BATCH_CHANGED",
          proposedBatchId: id,
          batchNo,
          detail: "Existing Batch no longer exists.",
        });
        continue;
      }
      if (
        raw.expected_existing_batch_version != null &&
        Number(raw.live_batch_version) !== Number(raw.expected_existing_batch_version)
      ) {
        conflicts.push({
          code: "BATCH_CHANGED",
          proposedBatchId: id,
          batchNo,
          detail: `Existing Batch version changed from ${raw.expected_existing_batch_version} to ${raw.live_batch_version}.`,
        });
      }
      if (!['DRAFT','READY'].includes(norm(raw.live_batch_status))) {
        conflicts.push({
          code: "EXECUTION_CHANGED",
          proposedBatchId: id,
          batchNo,
          detail: `Existing Batch is now ${raw.live_batch_status}; proposal expected an unscheduled Batch.`,
        });
      }
      const reservationNow = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM erp_schedule_reservations
          WHERE batch_id=$1 AND state='ACTIVE'`,
        [raw.existing_batch_id],
      );
      if (Number(reservationNow.rows[0]?.count || 0) > 0) {
        conflicts.push({
          code: "RESOURCE_CHANGED",
          proposedBatchId: id,
          batchNo,
          detail: "Existing Batch received a live ERP resource reservation after this proposal was created.",
        });
      }
    }

    const jobs = await client.query<Record<string, unknown>>(
      `SELECT *
         FROM planning_proposed_batch_job
        WHERE proposed_batch_id=$1 AND selected=true
        ORDER BY sequence_no,id`,
      [id],
    );
    for (const job of jobs.rows) {
      conflicts.push(...validateLiveJob(raw, job, liveOutput));
    }

    if (String(raw.source_mode) === "NEW_PROPOSED") {
      const targets = jobs.rows.map((x) => ({
        jobNum: String(x.job_num),
        mainOperationCode: String(x.main_operation_code || raw.main_operation),
      }));
      const active = await findActiveCommitmentConflicts(client, targets);
      for (const c of active) {
        conflicts.push({
          code: "JOB_ALREADY_PLANNED",
          proposedBatchId: id,
          batchNo,
          jobNum: c.job_num,
          detail: `${c.job_num} already has active commitment for ${c.main_operation_code}.`,
        });
      }
    }

    const overlaps = await resourceConflicts(
      client,
      resource,
      start,
      end,
      raw.existing_batch_id ? String(raw.existing_batch_id) : null,
    );
    for (const c of overlaps) {
      conflicts.push({
        code: "TIME_OVERLAP",
        proposedBatchId: id,
        batchNo,
        detail: `${resource} overlaps ${c.batch_no} (${c.start_at} → ${c.end_at}).`,
      });
    }
  }

  if (writeState) {
    const scopeSql = selectedOnly ? " AND selected=true" : "";
    await client.query(
      `UPDATE planning_proposed_batch
          SET status='PROPOSED',conflict_code=NULL,conflict_detail=NULL,
              conflict_json='[]'::jsonb,revalidated_at=now(),updated_at=now()
        WHERE proposed_plan_id=$1 AND status<>'ACCEPTED'${scopeSql}`,
      [proposalId],
    );
    for (const c of conflicts) {
      await client.query(
        `UPDATE planning_proposed_batch
            SET status='CONFLICT',conflict_code=$2,conflict_detail=$3,
                conflict_json=conflict_json||$4::jsonb,revalidated_at=now(),updated_at=now()
          WHERE id=$1`,
        [c.proposedBatchId, c.code, c.detail, JSON.stringify([c])],
      );
    }
    const remaining = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM planning_proposed_batch
        WHERE proposed_plan_id=$1 AND status<>'ACCEPTED'`,
      [proposalId],
    );
    const noConflictStatus =
      Number(remaining.rows[0]?.count || 0) > 0 && planRow.status === "PARTIALLY_ACCEPTED"
        ? "PARTIALLY_ACCEPTED"
        : "READY";
    await client.query(
      `UPDATE planning_proposed_plan
          SET revalidated_at=now(),conflict_json=$2::jsonb,
              status=CASE WHEN jsonb_array_length($2::jsonb)>0 THEN 'STALE' ELSE $3 END,
              version=version+1
        WHERE id=$1`,
      [proposalId, JSON.stringify(conflicts), noConflictStatus],
    );
  }
  return { plan: planRow, batches: batches.rows, conflicts };
}

export async function revalidateProposedPlan(
  proposalId: number,
  selectedOnly = false,
) {
  const liveOutput = await loadLiveOutputForProposal(proposalId);
  return withTransaction((client) =>
    revalidateProposalTx(client, proposalId, true, liveOutput, selectedOnly),
  );
}

export async function setProposedBatchSelection(
  proposalId: number,
  selectedBatchIds: number[],
  actor = "PUBLIC_UI",
) {
  const ids = [...new Set(selectedBatchIds.filter((id) => Number.isInteger(id) && id > 0))];
  return withTransaction(async (client) => {
    const plan = await client.query<{ status: string }>(
      `SELECT status FROM planning_proposed_plan WHERE id=$1 FOR UPDATE`,
      [proposalId],
    );
    if (!plan.rows[0]) throw new Error("Proposed Plan not found.");
    if (["ACCEPTED", "REJECTED"].includes(plan.rows[0].status)) {
      throw new Error(`Proposed Plan is ${plan.rows[0].status}.`);
    }
    await client.query(
      `UPDATE planning_proposed_batch
          SET selected=(id=ANY($2::bigint[])),updated_at=now()
        WHERE proposed_plan_id=$1 AND status<>'ACCEPTED'`,
      [proposalId, ids],
    );
    await writeAuditEvent(client, {
      eventType: "PROPOSED_PLAN_SELECTION_CHANGED",
      entityType: "PROPOSED_PLAN",
      entityId: String(proposalId),
      actor,
      newState: { selectedBatchIds: ids },
    });
    return { ok: true, proposalId, selectedBatchIds: ids };
  });
}

async function createRealBatchFromProposal(
  client: PoolClient,
  model: BatchModel,
  raw: Record<string, unknown>,
  jobs: Array<Record<string, unknown>>,
  actor: string,
) {
  const main = String(raw.main_operation);
  const jobNums = jobs.map((j) => String(j.job_num));
  const currentJobs = await client.query<{id:number;job_num:string;program:string|null;epicor_part:string|null;prod_qty:string|null}>(
    `SELECT p.id,p.job_num,p.program,p.epicor_part,p.prod_qty::text
       FROM ${currentPlanningJobsSource("p")}
      WHERE upper(btrim(p.job_num))=ANY($1::text[])`,
    [jobNums.map(norm)],
  );
  const currentByJob = new Map(currentJobs.rows.map((row)=>[norm(row.job_num),row]));
  const targets: CommitmentTarget[] = jobs.map((j) => {
    const current = currentByJob.get(norm(j.job_num));
    if(!current) throw new Error(`Proposal stale: Job ${j.job_num} is no longer active.`);
    return {
      jobNum: String(j.job_num),
      planningJobId: Number(current.id),
      mainOperationCode: main,
      routeOccurrenceKey: String(j.route_occurrence_key || `${main}#PROPOSAL:${j.id}`),
      routePosition: j.route_position == null ? null : Number(j.route_position),
    };
  });
  await acquireCommitmentLocks(client, targets);
  const conflicts = await findActiveCommitmentConflicts(client, targets);
  if (conflicts.length) {
    throw new Error(
      `Proposal stale: ${conflicts[0].job_num} already committed to ${conflicts[0].main_operation_code}.`,
    );
  }

  const pattern = batchNumberPattern(model);
  const prefix = safePrefix(main.slice(0, 3));
  const seq = await client.query<{ last_sequence: number }>(
    `INSERT INTO batch_number_sequences(sequence_date,prefix,last_sequence)
     VALUES(CURRENT_DATE,$1,1)
     ON CONFLICT(sequence_date,prefix)
     DO UPDATE SET last_sequence=batch_number_sequences.last_sequence+1
     RETURNING last_sequence`,
    [prefix],
  );
  const batchNo = renderBatchNo(
    pattern,
    prefix,
    main,
    Number(seq.rows[0]?.last_sequence || 1),
    new Date(),
  );
  const batch = await client.query<{ id: string; version: number }>(
    `INSERT INTO planning_batches(
       batch_no,batch_key,main_operation_code,main_operation_label,recipe_no,recipe_name,status,
       job_count,total_qty,total_surface_dm2,process_time_minutes,batch_rule_code,batch_key_parts,
       config_snapshot,notes
     ) VALUES(
       $1,$2,$3,$3,$4,$5,'READY',$6,$7,$8,$9,'PROPOSED_ACCEPT','[]'::jsonb,$10::jsonb,$11
     ) RETURNING id::text,version`,
    [
      batchNo,
      String(raw.batch_key || main),
      main,
      raw.recipe_no || null,
      raw.recipe_name || null,
      jobs.length,
      Number(raw.qty || 0),
      Number(raw.surface_dm2 || 0),
      raw.process_minutes == null ? null : Number(raw.process_minutes),
      JSON.stringify({ source: "PROPOSED_PLAN", proposedBatchId: Number(raw.id) }),
      `Accepted from Proposed Plan #${raw.proposed_plan_id}`,
    ],
  );

  for (let i = 0; i < jobs.length; i += 1) {
    const j = jobs[i];
    const row = currentByJob.get(norm(j.job_num));
    if(!row) throw new Error(`Proposal stale: Job ${j.job_num} is no longer active.`);
    const bj = await client.query<{ id: string }>(
      `INSERT INTO planning_batch_jobs(
         batch_id,planning_job_id,job_num,part_num,program,qty,surface_dm2,recipe_no,recipe_name,
         process_time_minutes,sequence_order,candidate_snapshot,route_occurrence_key,route_position,
         main_operation_code
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15)
       RETURNING id::text`,
      [
        batch.rows[0].id,
        Number(row.id),
        String(j.job_num),
        row.epicor_part,
        row.program,
        row.prod_qty ? Number(row.prod_qty) : null,
        Number(j.surface_dm2 || 0),
        raw.recipe_no || null,
        raw.recipe_name || null,
        raw.process_minutes == null ? null : Number(raw.process_minutes),
        i + 1,
        JSON.stringify({
          source: "PROPOSAL_ACCEPT",
          proposedBatchId: Number(raw.id),
          operationCode: j.operation_code || null,
        }),
        String(j.route_occurrence_key || `${main}#PROPOSAL:${j.id}`),
        j.route_position == null ? null : Number(j.route_position),
        main,
      ],
    );
    await insertCommitment(client, {
      ...targets[i],
      batchId: batch.rows[0].id,
      batchJobId: Number(bj.rows[0].id),
      state: "ACTIVE",
    });
  }

  await writeAuditEvent(client, {
    eventType: "PROPOSED_BATCH_ACCEPTED_NEW",
    entityType: "BATCH",
    entityId: batch.rows[0].id,
    batchId: batch.rows[0].id,
    actor,
    newState: {
      batchNo,
      status: "READY",
      version: batch.rows[0].version,
      mainOperation: main,
      jobCount: jobs.length,
    },
    metadata: {
      proposedBatchId: Number(raw.id),
      proposedPlanId: Number(raw.proposed_plan_id),
    },
  });
  return {
    batchId: batch.rows[0].id,
    batchNo,
    batchVersion: batch.rows[0].version,
  };
}

export async function acceptProposedPlan(
  proposalId: number,
  actor = "PUBLIC_UI",
  mode: ProposalAcceptMode = "ALL",
) {
  // Expensive route/recipe resolution is performed before opening the write
  // transaction. The transaction then revalidates commitments, versions and
  // exact resource occupancy again under locks before writing anything.
  const [model, liveOutput] = await Promise.all([
    getBatchModel(),
    loadLiveOutputForProposal(proposalId),
  ]);
  const selectedOnly = mode === "SELECTED";

  return withTransaction(async (client) => {
    const check = await revalidateProposalTx(
      client,
      proposalId,
      false,
      liveOutput,
      selectedOnly,
    );
    if (check.conflicts.length) {
      throw new Error(
        `Proposal has ${check.conflicts.length} conflict(s). Revalidate and review before Accept.`,
      );
    }
    const accepted: Array<Record<string, unknown>> = [];

    for (const raw of check.batches as Record<string, unknown>[]) {
      if (String(raw.status) === "REJECTED") continue;
      const jobs = (
        await client.query(
          `SELECT *
             FROM planning_proposed_batch_job
            WHERE proposed_batch_id=$1 AND selected=true
            ORDER BY sequence_no,id`,
          [raw.id],
        )
      ).rows as Record<string, unknown>[];
      if (!jobs.length) continue;

      let real: { batchId: string; batchNo: string; batchVersion: number };
      if (String(raw.source_mode) === "EXISTING_UNSCHEDULED") {
        real = {
          batchId: String(raw.existing_batch_id),
          batchNo: String(raw.existing_batch_no),
          batchVersion: Number(raw.live_batch_version),
        };
      } else {
        real = await createRealBatchFromProposal(client, model, raw, jobs, actor);
      }
      const reservation = await createScheduleReservation(client, model, {
        batchId: real.batchId,
        expectedBatchVersion: real.batchVersion,
        baseResourceCode: String(raw.resource_type || raw.resource_code),
        resourceCode: String(raw.resource_code),
        resourceType: String(raw.resource_type || "FINITE_RESOURCE"),
        phase: "NORMAL",
        startAt: String(raw.start_time),
        endAt: String(raw.end_time),
        sourceType: "PROPOSAL_ACCEPT",
        actor,
        metadata: {
          proposedPlanId: proposalId,
          proposedBatchId: Number(raw.id),
        },
      });
      await client.query(
        `UPDATE planning_proposed_batch
            SET status='ACCEPTED',accepted_batch_id=$2::uuid,
                accepted_reservation_id=$3::uuid,revalidated_at=now(),updated_at=now()
          WHERE id=$1`,
        [raw.id, real.batchId, reservation.reservationId],
      );
      accepted.push({
        proposedBatchId: Number(raw.id),
        batchId: real.batchId,
        batchNo: real.batchNo,
        reservationId: reservation.reservationId,
      });
    }

    const remaining = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM planning_proposed_batch
        WHERE proposed_plan_id=$1 AND status NOT IN ('ACCEPTED','REJECTED')`,
      [proposalId],
    );
    const complete = Number(remaining.rows[0]?.count || 0) === 0;
    const nextStatus = complete ? "ACCEPTED" : "PARTIALLY_ACCEPTED";
    await client.query(
      `UPDATE planning_proposed_plan
          SET status=$2,accepted_at=CASE WHEN $2='ACCEPTED' THEN now() ELSE accepted_at END,
              revalidated_at=now(),conflict_json='[]'::jsonb,version=version+1
        WHERE id=$1`,
      [proposalId, nextStatus],
    );
    await writeAuditEvent(client, {
      eventType: complete ? "PROPOSED_PLAN_ACCEPTED" : "PROPOSED_PLAN_PARTIALLY_ACCEPTED",
      entityType: "PROPOSED_PLAN",
      entityId: String(proposalId),
      actor,
      newState: { status: nextStatus, mode, acceptedCount: accepted.length },
      metadata: { accepted },
    });
    return { ok: true, proposalId, status: nextStatus, mode, accepted };
  });
}

export async function getProposedPlans(limit = 30) {
  const plans = await query(
    `SELECT * FROM planning_proposed_plan ORDER BY created_at DESC LIMIT $1`,
    [Math.max(1, Math.min(100, limit))],
  );
  const ids = (plans.rows as Array<Record<string, unknown>>).map((x) => Number(x.id));
  const batches = ids.length
    ? await query(
        `SELECT pb.*,b.batch_no AS existing_batch_no
           FROM planning_proposed_batch pb
           LEFT JOIN planning_batches b ON b.id=pb.existing_batch_id
          WHERE pb.proposed_plan_id=ANY($1::bigint[])
          ORDER BY pb.proposed_plan_id,pb.start_time,pb.id`,
        [ids],
      )
    : { rows: [] };
  return { plans: plans.rows, batches: batches.rows };
}
