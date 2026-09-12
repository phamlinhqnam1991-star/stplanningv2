import type { PoolClient } from "pg";
import type { BatchModel } from "@/lib/batch-model";
import { ErpConflictError, validateStatusTransition, writeAuditEvent } from "@/lib/commitment-ledger";

export type ScheduleReservationState = "ACTIVE" | "CANCELLED" | "COMPLETED";
export type ScheduleReservationSource = "MANUAL" | "PROPOSAL_ACCEPT" | "SYSTEM_RECOVERY";

export type ScheduleReservationInput = {
  batchId: string;
  expectedBatchVersion?: number | null;
  baseResourceCode: string;
  resourceCode: string;
  resourceType?: string | null;
  phase?: string | null;
  startAt: string;
  endAt: string;
  capacityUnits?: number | null;
  sourceType?: ScheduleReservationSource;
  actor?: string | null;
  metadata?: Record<string, unknown>;
};

export type ScheduleReservationRow = {
  id: string;
  batchId: string;
  batchNo: string;
  mainOperationCode: string;
  baseResourceCode: string;
  resourceCode: string;
  resourceType: string;
  phase: string;
  scheduleDate: string;
  startAt: string;
  endAt: string;
  state: ScheduleReservationState;
  sourceType: ScheduleReservationSource;
  capacityUnits: number;
  batchVersionSnapshot: number;
  version: number;
  metadata: Record<string, unknown>;
};

const norm = (value: unknown) => String(value ?? "").trim().toUpperCase();

function validTimestamp(value: string, field: string): number {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) throw new Error(`${field} must be a valid timestamp.`);
  return ms;
}

async function acquireScheduleLocks(client: PoolClient, batchId: string, resourceCode: string) {
  const keys = [`ST_BATCH_SCHEDULE:${batchId}`, `ST_RESOURCE:${norm(resourceCode)}`].sort();
  for (const key of keys) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
}

async function loadBatchForUpdate(client: PoolClient, batchId: string) {
  const result = await client.query<{
    id: string; batch_no: string; main_operation_code: string; status: string; version: number;
  }>(`SELECT id::text,batch_no,main_operation_code,status,version FROM planning_batches WHERE id=$1 FOR UPDATE`, [batchId]);
  const row = result.rows[0];
  if (!row) throw new Error("Batch not found.");
  return row;
}

function assertExpectedVersion(actual: number, expected?: number | null) {
  if (expected == null) return;
  if (actual !== expected) {
    throw new ErpConflictError(
      "STALE_BATCH_VERSION",
      `Batch changed from version ${expected} to ${actual}. Refresh Scheduling before saving.`,
      { expectedVersion: expected, actualVersion: actual },
    );
  }
}

async function assertNoExactResourceOverlap(
  client: PoolClient,
  resourceCode: string,
  startAt: string,
  endAt: string,
  excludeReservationId?: string | null,
) {
  const result = await client.query<{ id: string; batch_no: string; start_at: string; end_at: string }>(`
    SELECT id::text,batch_no,start_at::text,end_at::text
    FROM erp_schedule_reservations
    WHERE state='ACTIVE'
      AND upper(btrim(resource_code))=upper(btrim($1))
      AND start_at < $3::timestamptz
      AND end_at > $2::timestamptz
      AND ($4::uuid IS NULL OR id<>$4::uuid)
    ORDER BY start_at
    LIMIT 10`, [resourceCode, startAt, endAt, excludeReservationId || null]);
  if (result.rows.length) {
    throw new ErpConflictError(
      "RESOURCE_TIME_OVERLAP",
      `${resourceCode} is already reserved by ${result.rows[0].batch_no} during the requested time.`,
      { resourceCode, conflicts: result.rows },
    );
  }
}

export async function createScheduleReservation(client: PoolClient, model: BatchModel, input: ScheduleReservationInput) {
  const startMs = validTimestamp(input.startAt, "startAt");
  const endMs = validTimestamp(input.endAt, "endAt");
  if (endMs <= startMs) throw new Error("Schedule end must be after start.");
  const resourceCode = input.resourceCode.trim();
  if (!resourceCode) throw new Error("resourceCode is required.");
  const baseResourceCode = input.baseResourceCode.trim() || resourceCode;

  await acquireScheduleLocks(client, input.batchId, resourceCode);
  const batch = await loadBatchForUpdate(client, input.batchId);
  assertExpectedVersion(batch.version, input.expectedBatchVersion);
  if (["STARTED", "COMPLETED", "CANCELLED"].includes(norm(batch.status))) {
    throw new ErpConflictError("BATCH_NOT_SCHEDULABLE", `Batch ${batch.batch_no} is ${batch.status} and cannot receive a new reservation.`);
  }
  if (norm(batch.status) !== "SCHEDULED") validateStatusTransition(model, batch.status, "SCHEDULED");
  await assertNoExactResourceOverlap(client, resourceCode, input.startAt, input.endAt);

  const sourceType = input.sourceType || "MANUAL";
  const actor = input.actor?.trim() || "PUBLIC_UI";
  const scheduleDate = input.startAt.slice(0, 10);
  const capacityUnits = Math.max(1, Math.round(Number(input.capacityUnits || 1)));
  const inserted = await client.query<{
    id: string; version: number;
  }>(`
    INSERT INTO erp_schedule_reservations(
      batch_id,batch_no,main_operation_code,base_resource_code,resource_code,resource_type,phase,
      schedule_date,start_at,end_at,state,source_type,capacity_units,batch_version_snapshot,metadata,created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::timestamptz,$10::timestamptz,'ACTIVE',$11,$12,$13,$14::jsonb,$15)
    RETURNING id::text,version`, [
      input.batchId,batch.batch_no,batch.main_operation_code,baseResourceCode,resourceCode,
      input.resourceType?.trim() || "FINITE_RESOURCE",input.phase?.trim() || "NORMAL",scheduleDate,
      input.startAt,input.endAt,sourceType,capacityUnits,batch.version,JSON.stringify(input.metadata || {}),actor,
    ]);

  const nextVersion = batch.version + 1;
  await client.query(`UPDATE planning_batches SET status='SCHEDULED',scheduled_at=COALESCE(scheduled_at,now()),version=$2,status_changed_at=CASE WHEN status<>'SCHEDULED' THEN now() ELSE status_changed_at END,updated_at=now() WHERE id=$1`, [input.batchId,nextVersion]);
  await writeAuditEvent(client, {
    eventType:"SCHEDULE_RESERVED",entityType:"SCHEDULE_RESERVATION",entityId:inserted.rows[0].id,batchId:input.batchId,actor,
    oldState:{ batchStatus:batch.status,batchVersion:batch.version },
    newState:{ batchStatus:"SCHEDULED",batchVersion:nextVersion,resourceCode,startAt:input.startAt,endAt:input.endAt,phase:input.phase || "NORMAL" },
    metadata:{ sourceType,baseResourceCode,capacityUnits },
  });
  return { reservationId: inserted.rows[0].id, reservationVersion: inserted.rows[0].version, batchVersion: nextVersion, batchNo: batch.batch_no };
}

export async function cancelScheduleReservation(
  client: PoolClient,
  model: BatchModel,
  input: { reservationId: string; expectedReservationVersion?: number | null; expectedBatchVersion?: number | null; actor?: string | null; reason?: string | null },
) {
  const found = await client.query<{
    id:string; batch_id:string; batch_no:string; resource_code:string; start_at:string; end_at:string; state:string; version:number;
  }>(`SELECT id::text,batch_id::text,batch_no,resource_code,start_at::text,end_at::text,state,version FROM erp_schedule_reservations WHERE id=$1 FOR UPDATE`, [input.reservationId]);
  const reservation = found.rows[0];
  if (!reservation) throw new Error("Schedule reservation not found.");
  if (reservation.state !== "ACTIVE") throw new ErpConflictError("RESERVATION_NOT_ACTIVE", "Only ACTIVE reservations can be cancelled.");
  if (input.expectedReservationVersion != null && reservation.version !== input.expectedReservationVersion) {
    throw new ErpConflictError("STALE_RESERVATION_VERSION", "Reservation changed after the screen was loaded.", { expectedVersion:input.expectedReservationVersion,actualVersion:reservation.version });
  }
  await acquireScheduleLocks(client, reservation.batch_id, reservation.resource_code);
  const batch = await loadBatchForUpdate(client, reservation.batch_id);
  assertExpectedVersion(batch.version, input.expectedBatchVersion);
  if (["STARTED", "COMPLETED"].includes(norm(batch.status))) throw new ErpConflictError("EXECUTION_ALREADY_STARTED", `Batch ${batch.batch_no} is ${batch.status}; its reservation cannot be cancelled.`);

  await client.query(`UPDATE erp_schedule_reservations SET state='CANCELLED',version=version+1,updated_at=now(),metadata=metadata||jsonb_build_object('cancelReason',$2) WHERE id=$1`, [reservation.id,input.reason || null]);
  const remaining = await client.query<{count:number}>(`SELECT count(*)::int AS count FROM erp_schedule_reservations WHERE batch_id=$1 AND state='ACTIVE'`, [reservation.batch_id]);
  let nextStatus = batch.status;
  if (Number(remaining.rows[0]?.count || 0) === 0 && norm(batch.status) === "SCHEDULED") {
    validateStatusTransition(model, batch.status, "READY");
    nextStatus = "READY";
  }
  const nextVersion = batch.version + 1;
  await client.query(`UPDATE planning_batches SET status=$2,version=$3,status_changed_at=CASE WHEN status<>$2 THEN now() ELSE status_changed_at END,updated_at=now() WHERE id=$1`, [reservation.batch_id,nextStatus,nextVersion]);
  await writeAuditEvent(client, {
    eventType:"SCHEDULE_CANCELLED",entityType:"SCHEDULE_RESERVATION",entityId:reservation.id,batchId:reservation.batch_id,actor:input.actor,
    oldState:{ state:"ACTIVE",batchStatus:batch.status,batchVersion:batch.version,resourceCode:reservation.resource_code,startAt:reservation.start_at,endAt:reservation.end_at },
    newState:{ state:"CANCELLED",batchStatus:nextStatus,batchVersion:nextVersion },metadata:{ reason:input.reason || null },
  });
  return { ok:true,batchId:reservation.batch_id,batchVersion:nextVersion,batchStatus:nextStatus };
}
