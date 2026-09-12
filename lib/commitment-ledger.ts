import type { PoolClient } from "pg";
import type { BatchModel } from "@/lib/batch-model";

export class ErpConflictError extends Error {
  status = 409;
  code: string;
  details: Record<string, unknown>;
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ErpConflictError";
    this.code = code;
    this.details = details;
  }
}

export type CommitmentTarget = {
  jobNum: string;
  planningJobId: number | null;
  mainOperationCode: string;
  routeOccurrenceKey: string;
  routePosition: number | null;
};

export type AuditEventInput = {
  eventType: string;
  entityType: string;
  entityId: string;
  jobNum?: string | null;
  batchId?: string | null;
  actor?: string | null;
  oldState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase();

function statusDef(model: BatchModel, code: string) {
  return model.statuses.find((status) => normalize(status.code) === normalize(code)) || null;
}

export function statusBlocksCandidate(model: BatchModel, code: string): boolean {
  const def = statusDef(model, code);
  return def ? def.data.blocksCandidate !== false : true;
}

export function statusIsTerminal(model: BatchModel, code: string): boolean {
  const def = statusDef(model, code);
  return def?.data.terminal === true;
}

export function allowedStatusTargets(model: BatchModel, currentCode: string): string[] {
  const current = statusDef(model, currentCode);
  if (!current) return model.statuses.map((status) => status.code);
  const configured = current.data.allowedTo;
  if (Array.isArray(configured)) {
    return configured.map((value) => String(value)).filter((code) => model.statuses.some((status) => status.code === code));
  }
  // Backward compatibility for custom statuses created before v026.2.
  return model.statuses.filter((status) => status.code !== current.code).map((status) => status.code);
}

export function validateStatusTransition(model: BatchModel, currentCode: string, targetCode: string) {
  if (currentCode === targetCode) return;
  const current = statusDef(model, currentCode);
  const target = statusDef(model, targetCode);
  if (!target) throw new Error(`Batch status ${targetCode} is not enabled in Configuration.`);
  if (!current) return;
  const allowed = allowedStatusTargets(model, currentCode);
  if (!allowed.includes(targetCode)) {
    throw new Error(`Invalid Batch lifecycle transition: ${currentCode} → ${targetCode}. Allowed: ${allowed.join(", ") || "none"}.`);
  }
}

export function commitmentStateForBatchStatus(model: BatchModel, statusCode: string): string {
  if (statusBlocksCandidate(model, statusCode)) return "ACTIVE";
  const code = normalize(statusCode);
  if (code === "COMPLETED") return "COMPLETED";
  if (code === "CANCELLED") return "CANCELLED";
  return "RELEASED";
}

export async function acquireCommitmentLocks(client: PoolClient, targets: Array<Pick<CommitmentTarget, "jobNum" | "mainOperationCode">>) {
  const lockKeys = [...new Set(targets
    .map((target) => `${normalize(target.jobNum)}|${normalize(target.mainOperationCode)}`)
    .filter((value) => value !== "|"))]
    .sort();
  for (const lockKey of lockKeys) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`ST_BATCH_COMMIT:${lockKey}`]);
  }
}

export async function findActiveCommitmentConflicts(client: PoolClient, targets: Array<Pick<CommitmentTarget, "jobNum" | "mainOperationCode">>, excludeBatchId?: string) {
  if (!targets.length) return [] as Array<{ job_num: string; main_operation_code: string; batch_id: string }>;
  const jobs = [...new Set(targets.map((target) => target.jobNum.trim()).filter(Boolean))];
  const mains = [...new Set(targets.map((target) => target.mainOperationCode.trim()).filter(Boolean))];
  const result = await client.query<{ job_num: string; main_operation_code: string; batch_id: string }>(`
    SELECT c.job_num,c.main_operation_code,c.batch_id::text AS batch_id
    FROM erp_job_commitments c
    WHERE c.state='ACTIVE'
      AND upper(btrim(c.job_num)) = ANY($1::text[])
      AND upper(btrim(c.main_operation_code)) = ANY($2::text[])
      AND ($3::uuid IS NULL OR c.batch_id<>$3::uuid)`,
    [jobs.map(normalize), mains.map(normalize), excludeBatchId || null]);
  const wanted = new Set(targets.map((target) => `${normalize(target.jobNum)}|${normalize(target.mainOperationCode)}`));
  return result.rows.filter((row) => wanted.has(`${normalize(row.job_num)}|${normalize(row.main_operation_code)}`));
}

export async function insertCommitment(
  client: PoolClient,
  input: CommitmentTarget & { batchId: string; batchJobId: number; state?: string },
) {
  try {
    const result = await client.query<{ id: string }>(`
      INSERT INTO erp_job_commitments (
        batch_id,batch_job_id,planning_job_id,job_num,main_operation_code,route_occurrence_key,route_position,state
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id::text`,
    [input.batchId,input.batchJobId,input.planningJobId,input.jobNum,input.mainOperationCode,input.routeOccurrenceKey,input.routePosition,input.state || 'ACTIVE']);
    return Number(result.rows[0]?.id || 0);
  } catch (error) {
    const e = error as { code?: string };
    if (e?.code === "23505") {
      throw new ErpConflictError(
        "ACTIVE_COMMITMENT_EXISTS",
        `Job ${input.jobNum} already has an active commitment for ${input.mainOperationCode}. Refresh Candidates and review the existing Batch.`,
        { jobNum: input.jobNum, mainOperationCode: input.mainOperationCode },
      );
    }
    throw error;
  }
}

export async function updateBatchCommitmentsForStatus(client: PoolClient, batchId: string, newState: string) {
  await client.query(`
    UPDATE erp_job_commitments
    SET state=$2,version=version+1,updated_at=now()
    WHERE batch_id=$1`, [batchId,newState]);
}

export async function writeAuditEvent(client: PoolClient, input: AuditEventInput) {
  await client.query(`
    INSERT INTO erp_audit_events (
      event_type,entity_type,entity_id,job_num,batch_id,actor,old_state,new_state,metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)`,
    [
      input.eventType,
      input.entityType,
      input.entityId,
      input.jobNum ?? null,
      input.batchId ?? null,
      input.actor?.trim() || "PUBLIC_UI",
      JSON.stringify(input.oldState ?? {}),
      JSON.stringify(input.newState ?? {}),
      JSON.stringify(input.metadata ?? {}),
    ]);
}

export function expectedVersionRequired(model: BatchModel): boolean {
  return model.settings["batchModel.requireExpectedVersion"] !== false;
}
