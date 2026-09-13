import type { PoolClient } from "pg";
import type { BatchModel } from "@/lib/batch-model";
import { ErpConflictError, validateStatusTransition, writeAuditEvent } from "@/lib/commitment-ledger";
import { wallDateFromInstant, wallTimestampFromInstant } from "@/lib/plant-time";

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

export type ResourceReservationConflict = {
  source: "ERP" | "IMPORTED";
  id: string;
  batch_no: string;
  start_at: string;
  end_at: string;
};

async function plantTimezoneOffsetMinutes(client: PoolClient): Promise<number> {
  const result = await client.query<{ offset_minutes: number }>(`
    SELECT COALESCE((value_json #>> '{}')::numeric,420)::int AS offset_minutes
      FROM config_settings
     WHERE setting_key='stOutput.timezoneOffsetMinutes' AND enabled=true
     LIMIT 1`);
  const value = Number(result.rows[0]?.offset_minutes ?? 420);
  return Number.isFinite(value) ? Math.max(-840, Math.min(840, value)) : 420;
}

export async function findResourceReservationConflicts(
  client: PoolClient,
  resourceCode: string,
  startAt: string,
  endAt: string,
  options: { excludeReservationId?: string | null; excludeBatchId?: string | null } = {},
): Promise<ResourceReservationConflict[]> {
  const conflicts: ResourceReservationConflict[] = [];
  const erp = await client.query<{ id: string; batch_no: string; start_at: string; end_at: string }>(`
    SELECT id::text,batch_no,start_at::text,end_at::text
    FROM erp_schedule_reservations
    WHERE state='ACTIVE'
      AND upper(btrim(resource_code))=upper(btrim($1))
      AND start_at < $3::timestamptz
      AND end_at > $2::timestamptz
      AND ($4::uuid IS NULL OR id<>$4::uuid)
      AND ($5::uuid IS NULL OR batch_id<>$5::uuid)
    ORDER BY start_at
    LIMIT 20`, [resourceCode, startAt, endAt, options.excludeReservationId || null, options.excludeBatchId || null]);
  conflicts.push(...erp.rows.map((row) => ({ source:"ERP" as const, ...row })));

  // Imported schedule is the current read-only production baseline. Production
  // reservations must respect it even when What-if is allowed to ignore it.
  const offset = await plantTimezoneOffsetMinutes(client);
  const startWall = wallTimestampFromInstant(startAt, offset);
  const endWall = wallTimestampFromInstant(endAt, offset);
  const imported = await client.query<{ id: string; batch_no: string; start_at: string; end_at: string }>(`
    WITH imported AS (
      SELECT s.id::text AS id,
             COALESCE(NULLIF(a.batch_ref,''),NULLIF(s.batch_ref,''),'IMPORTED') AS batch_no,
             (s.schedule_date + s.start_time)::timestamp AS start_wall,
             CASE
               WHEN s.end_time IS NOT NULL THEN
                 (s.schedule_date + s.end_time)::timestamp
                 + CASE WHEN s.end_time<=s.start_time THEN interval '1 day' ELSE interval '0 day' END
               WHEN s.duration_minutes IS NOT NULL THEN
                 (s.schedule_date + s.start_time)::timestamp + (s.duration_minutes * interval '1 minute')
               ELSE NULL
             END AS end_wall
        FROM v_active_schedule_resource_assignments a
        JOIN v_active_schedule_blocks s ON s.id=a.schedule_block_id
       WHERE upper(btrim(a.resource_code))=upper(btrim($1))
         AND s.schedule_date IS NOT NULL
         AND s.start_time IS NOT NULL
    )
    SELECT id,batch_no,start_wall::text AS start_at,end_wall::text AS end_at
      FROM imported
     WHERE end_wall IS NOT NULL
       AND start_wall<$3::timestamp
       AND end_wall>$2::timestamp
     ORDER BY start_wall
     LIMIT 20`, [resourceCode, startWall, endWall]);
  conflicts.push(...imported.rows.map((row) => ({ source:"IMPORTED" as const, ...row })));
  return conflicts;
}

async function assertNoResourceOverlap(
  client: PoolClient,
  resourceCode: string,
  startAt: string,
  endAt: string,
  excludeReservationId?: string | null,
  excludeBatchId?: string | null,
) {
  const conflicts = await findResourceReservationConflicts(client, resourceCode, startAt, endAt, { excludeReservationId, excludeBatchId });
  if (conflicts.length) {
    const first = conflicts[0];
    throw new ErpConflictError(
      first.source === "IMPORTED" ? "IMPORTED_SCHEDULE_OVERLAP" : "RESOURCE_TIME_OVERLAP",
      `${resourceCode} overlaps ${first.source === "IMPORTED" ? "imported schedule" : "ERP reservation"} ${first.batch_no}.`,
      { resourceCode, conflicts },
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
  await assertNoResourceOverlap(client, resourceCode, input.startAt, input.endAt, null, input.batchId);

  const sourceType = input.sourceType || "MANUAL";
  const actor = input.actor?.trim() || "PUBLIC_UI";
  const timezoneOffsetMinutes = await plantTimezoneOffsetMinutes(client);
  const scheduleDate = wallDateFromInstant(input.startAt, timezoneOffsetMinutes);
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
    metadata:{ sourceType,baseResourceCode,capacityUnits,scheduleDate,timezoneOffsetMinutes },
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
