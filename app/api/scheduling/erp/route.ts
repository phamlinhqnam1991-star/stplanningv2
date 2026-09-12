import { NextResponse } from "next/server";
import { z } from "zod";
import { query, withTransaction } from "@/lib/db";
import { getBatchModel } from "@/lib/batch-model";
import { getCapacityModel, capacityInstanceCodes } from "@/lib/capacity-model";
import { ErpConflictError } from "@/lib/commitment-ledger";
import { cancelScheduleReservation, createScheduleReservation } from "@/lib/scheduling-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  action: z.literal("CREATE"),
  batchId: z.string().uuid(),
  expectedBatchVersion: z.number().int().positive().nullable().optional(),
  baseResourceCode: z.string().min(1).max(80),
  resourceCode: z.string().min(1).max(80),
  resourceType: z.string().max(80).nullable().optional(),
  phase: z.string().max(80).nullable().optional(),
  startAt: z.string().min(10).max(80),
  endAt: z.string().min(10).max(80),
  capacityUnits: z.number().int().positive().max(64).optional(),
  actor: z.string().max(120).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const cancelSchema = z.object({
  action: z.literal("CANCEL"),
  reservationId: z.string().uuid(),
  expectedReservationVersion: z.number().int().positive().nullable().optional(),
  expectedBatchVersion: z.number().int().positive().nullable().optional(),
  actor: z.string().max(120).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
});

function apiError(error: unknown, fallback: string) {
  if (error instanceof ErpConflictError) {
    return NextResponse.json({ error:error.message,code:error.code,details:error.details }, { status:409 });
  }
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error:message }, { status:400 });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dateFrom = (url.searchParams.get("dateFrom") || "").trim();
    const dateTo = (url.searchParams.get("dateTo") || "").trim();
    const params: unknown[] = [];
    const where: string[] = ["r.state='ACTIVE'"];
    if (dateFrom) { params.push(dateFrom); where.push(`r.schedule_date >= $${params.length}::date`); }
    if (dateTo) { params.push(dateTo); where.push(`r.schedule_date <= $${params.length}::date`); }
    const reservations = await query(`
      SELECT r.id::text,r.batch_id::text,r.batch_no,r.main_operation_code,r.base_resource_code,r.resource_code,
             r.resource_type,r.phase,r.schedule_date::text,r.start_at::text,r.end_at::text,r.state,r.source_type,
             r.capacity_units,r.batch_version_snapshot,r.version,r.metadata,r.created_by,r.created_at::text,r.updated_at::text,
             b.status AS batch_status,b.version AS batch_version,b.recipe_no,b.recipe_name,b.total_qty,b.total_surface_dm2,b.job_count
      FROM erp_schedule_reservations r
      JOIN planning_batches b ON b.id=r.batch_id
      WHERE ${where.join(" AND ")}
      ORDER BY r.start_at,r.resource_code`, params);

    const schedulable = await query(`
      SELECT b.id::text,b.batch_no,b.main_operation_code,b.main_operation_label,b.recipe_no,b.recipe_name,b.status,b.version,
             b.job_count,b.total_qty,b.total_surface_dm2,b.process_time_minutes,b.created_at::text,
             count(r.id) FILTER (WHERE r.state='ACTIVE')::int AS active_reservation_count
      FROM planning_batches b
      LEFT JOIN erp_schedule_reservations r ON r.batch_id=b.id
      WHERE b.status IN ('READY','SCHEDULED')
      GROUP BY b.id
      ORDER BY CASE b.status WHEN 'READY' THEN 0 ELSE 1 END,b.created_at,b.batch_no
      LIMIT 1000`);

    const capacity = await getCapacityModel();
    const resources = capacity.resourceList.filter((r)=>r.enabled).flatMap((r)=>
      capacityInstanceCodes(r).map((instance)=>({
        baseResourceCode:r.baseResourceCode,resourceCode:instance,label:r.label,maxConcurrent:r.maxConcurrent,
        calendarMode:r.calendarMode,windowStart:r.windowStart,windowEnd:r.windowEnd,
      })),
    );
    return NextResponse.json({ reservations:reservations.rows,schedulableBatches:schedulable.rows,resources });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load ERP scheduling ledger.";
    return NextResponse.json({ error:message }, { status:500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const model = await getBatchModel();
    if (body?.action === "CANCEL") {
      const x = cancelSchema.parse(body);
      const result = await withTransaction((client)=>cancelScheduleReservation(client,model,x));
      return NextResponse.json(result);
    }
    const x = createSchema.parse(body);
    const result = await withTransaction((client)=>createScheduleReservation(client,model,x));
    return NextResponse.json({ ok:true,...result });
  } catch (error) {
    return apiError(error,"Unable to save ERP schedule reservation.");
  }
}
