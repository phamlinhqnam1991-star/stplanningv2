import { NextResponse } from "next/server";
import { z } from "zod";
import { query, withTransaction } from "@/lib/db";
import { aggregateProcessTime, batchNumberPattern, getBatchModel } from "@/lib/batch-model";
import { loadCandidateRows } from "@/lib/candidate-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  action: z.literal("create"),
  planningJobIds: z.array(z.number().int().positive()).min(1).max(500),
  manualBatchKey: z.string().max(1000).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});
const statusSchema = z.object({
  action: z.literal("status"),
  batchId: z.string().uuid(),
  status: z.string().min(1).max(80),
});
const deleteSchema = z.object({ action: z.literal("delete"), batchId: z.string().uuid() });

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function boolSetting(value: unknown, fallback: boolean) { return typeof value === "boolean" ? value : fallback; }
function safePrefix(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 12) || "BAT"; }
function ddMon(date: Date) {
  const mon = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][date.getUTCMonth()];
  return `${String(date.getUTCDate()).padStart(2,"0")}${mon}`;
}
function yyyymmdd(date: Date) { return `${date.getUTCFullYear()}${String(date.getUTCMonth()+1).padStart(2,"0")}${String(date.getUTCDate()).padStart(2,"0")}`; }
function renderBatchNo(pattern: string, prefix: string, main: string, seq: number, date: Date) {
  return pattern
    .replaceAll("{SHORT}", prefix)
    .replaceAll("{MAIN}", safePrefix(main))
    .replaceAll("{YYYYMMDD}", yyyymmdd(date))
    .replaceAll("{DDMMM}", ddMon(date))
    .replaceAll("{SEQ3}", String(seq).padStart(3,"0"))
    .replaceAll("{SEQ4}", String(seq).padStart(4,"0"));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.max(20, Math.min(500, Number(url.searchParams.get("limit") || 100)));
    const status = (url.searchParams.get("status") || "").trim();
    const search = (url.searchParams.get("search") || "").trim();
    const params: unknown[] = [];
    const where: string[] = [];
    if (status) { params.push(status); where.push(`b.status=$${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`(b.batch_no ILIKE $${params.length} OR b.batch_key ILIKE $${params.length} OR b.main_operation_code ILIKE $${params.length} OR COALESCE(b.recipe_name,'') ILIKE $${params.length})`); }
    params.push(limit);
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await query(`
      SELECT b.*,
             COALESCE((SELECT jsonb_agg(jsonb_build_object(
               'jobNum',j.job_num,'part',j.part_num,'revision',j.revision_num,'qty',j.qty,
               'surfaceDm2',j.surface_dm2,'sequenceOrder',j.sequence_order
             ) ORDER BY j.sequence_order) FROM planning_batch_jobs j WHERE j.batch_id=b.id),'[]'::jsonb) AS jobs
      FROM planning_batches b
      ${whereSql}
      ORDER BY b.created_at DESC
      LIMIT $${params.length}`,
      params
    );
    const statuses = await getBatchModel();
    return NextResponse.json({ rows: rows.rows, statuses: statuses.statuses });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load batches.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const action = z.enum(["create","status","delete"]).parse(raw.action);
    if (action === "status") {
      const x = statusSchema.parse(raw);
      const model = await getBatchModel();
      if (!model.statuses.some((status) => status.code === x.status)) throw new Error("Batch status is not enabled in Configuration.");
      await query(`UPDATE planning_batches SET status=$2,updated_at=now() WHERE id=$1`, [x.batchId,x.status]);
      return NextResponse.json({ ok:true });
    }
    if (action === "delete") {
      const x = deleteSchema.parse(raw);
      const model = await getBatchModel();
      const current = await query<{ status:string }>(`SELECT status FROM planning_batches WHERE id=$1`, [x.batchId]);
      const currentStatus = current.rows[0]?.status || "";
      const statusConfig = model.statuses.find((status) => status.code === currentStatus);
      if (!statusConfig || statusConfig.data.allowDelete !== true) throw new Error(`Batch status ${currentStatus || "UNKNOWN"} does not allow deletion.`);
      await query(`DELETE FROM planning_batches WHERE id=$1`, [x.batchId]);
      return NextResponse.json({ ok:true });
    }

    const x = createSchema.parse(raw);
    const [candidates, model] = await Promise.all([
      loadCandidateRows({ planningJobIds:x.planningJobIds, eligibleOnly:false, scanLimit:x.planningJobIds.length }),
      getBatchModel(),
    ]);
    if (candidates.length !== x.planningJobIds.length) throw new Error(`Only ${candidates.length}/${x.planningJobIds.length} selected jobs are available in the active Planning snapshot.`);
    const ineligible = candidates.filter((c)=>!c.batchProposal.eligible);
    if (ineligible.length) throw new Error(`Selected jobs include ${ineligible.length} ineligible candidate(s).`);
    const mainCodes = [...new Set(candidates.map((c)=>c.nextPlanningOperation?.code).filter(Boolean))];
    if (mainCodes.length !== 1) throw new Error("A batch must contain one Next Planning Operation.");
    const main = candidates[0].nextPlanningOperation!;
    const autoKeys = [...new Set(candidates.map((c)=>c.batchProposal.batchKey || ""))];
    const requireSameKey = boolSetting(model.settings["batchModel.requireSameBatchKey"], true);
    const manualAllowed = boolSetting(model.settings["batchModel.manualKeyAllowed"], true);
    const manualKey = (x.manualBatchKey || "").trim();
    if (manualKey && !manualAllowed) throw new Error("Manual Batch Key is disabled by configuration.");
    if (requireSameKey && autoKeys.length !== 1 && !manualKey) throw new Error("Selected jobs do not share the same configured Batch Key. Enter a Manual Batch Key only if the configured policy allows that override.");
    const batchKey = manualKey || autoKeys[0] || main.code;

    const totalQty = candidates.reduce((s,c)=>s+(c.qty||0),0);
    const totalSurface = candidates.reduce((s,c)=>s+(c.surfaceDm2||0),0);
    const limits = {
      maxJobs: Math.min(...candidates.map((c)=>c.batchProposal.maxJobs).filter((v):v is number=>v!=null), Number.POSITIVE_INFINITY),
      maxQty: Math.min(...candidates.map((c)=>c.batchProposal.maxQty).filter((v):v is number=>v!=null), Number.POSITIVE_INFINITY),
      maxSurface: Math.min(...candidates.map((c)=>c.batchProposal.maxSurfaceDm2).filter((v):v is number=>v!=null), Number.POSITIVE_INFINITY),
    };
    if (Number.isFinite(limits.maxJobs) && candidates.length > limits.maxJobs) throw new Error(`Batch exceeds Max Jobs (${limits.maxJobs}).`);
    if (Number.isFinite(limits.maxQty) && totalQty > limits.maxQty) throw new Error(`Batch exceeds Max Qty (${limits.maxQty}).`);
    if (Number.isFinite(limits.maxSurface) && totalSurface > limits.maxSurface) throw new Error(`Batch exceeds Max Surface (${limits.maxSurface} dm²).`);

    const processMode = candidates[0].batchProposal.processTimeAggregation || "MAX";
    const processTime = aggregateProcessTime(candidates.map((c)=>c.processTimeSuggestion.minutes), processMode);
    const recipeNos = [...new Set(candidates.map((c)=>c.recipeSuggestion.recipeNo || "").filter(Boolean))];
    const recipeNames = [...new Set(candidates.map((c)=>c.recipeSuggestion.recipeName || c.recipeSuggestion.sourceValue || "").filter(Boolean))];
    const recipeNo = recipeNos.length === 1 ? recipeNos[0] : null;
    const recipeName = recipeNames.length === 1 ? recipeNames[0] : null;
    const firstProposal = candidates[0].batchProposal;
    const pattern = batchNumberPattern(model);
    const prefix = safePrefix(main.shortCode || main.code.slice(0,3));
    const initialStatus = String(model.settings["batchModel.initialStatus"] || "DRAFT");
    if (model.statuses.length && !model.statuses.some((status) => status.code === initialStatus)) throw new Error(`Configured initial Batch Status ${initialStatus} is not enabled.`);
    const today = new Date();

    const created = await withTransaction(async (client) => {
      const seqResult = await client.query<{ last_sequence:number }>(`
        INSERT INTO batch_number_sequences (sequence_date,prefix,last_sequence)
        VALUES (CURRENT_DATE,$1,1)
        ON CONFLICT (sequence_date,prefix) DO UPDATE SET last_sequence=batch_number_sequences.last_sequence+1
        RETURNING last_sequence`, [prefix]);
      const seq = Number(seqResult.rows[0]?.last_sequence || 1);
      const batchNo = renderBatchNo(pattern,prefix,main.code,seq,today);
      const snapshot = {
        batchModel: { pattern, requireSameKey, manualAllowed },
        ruleCode:firstProposal.ruleCode, keyFields:firstProposal.keyFields, keyParts:firstProposal.keyParts,
        limits:{ maxJobs:Number.isFinite(limits.maxJobs)?limits.maxJobs:null, maxQty:Number.isFinite(limits.maxQty)?limits.maxQty:null, maxSurfaceDm2:Number.isFinite(limits.maxSurface)?limits.maxSurface:null },
        processTimeAggregation:processMode,
      };
      const batch = await client.query<{ id:string }>(`
        INSERT INTO planning_batches (
          batch_no,batch_key,main_operation_code,main_operation_label,recipe_no,recipe_name,status,
          job_count,total_qty,total_surface_dm2,process_time_minutes,batch_rule_code,batch_key_parts,config_snapshot,notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15)
        RETURNING id`,
        [batchNo,batchKey,main.code,main.label,recipeNo,recipeName,initialStatus,candidates.length,totalQty,totalSurface,processTime,firstProposal.ruleCode,JSON.stringify(firstProposal.keyParts),JSON.stringify(snapshot),x.notes||null]
      );
      const batchId = batch.rows[0].id;
      for (let i=0;i<candidates.length;i++) {
        const c=candidates[i];
        await client.query(`
          INSERT INTO planning_batch_jobs (
            batch_id,planning_job_id,job_num,part_num,revision_num,program,qty,surface_dm2,recipe_no,recipe_name,
            process_time_minutes,sequence_order,candidate_snapshot
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
          [batchId,c.planningJobId,c.jobNum,c.part,c.revision,c.program,c.qty,c.surfaceDm2,c.recipeSuggestion.recipeNo,c.recipeSuggestion.recipeName||c.recipeSuggestion.sourceValue,c.processTimeSuggestion.minutes,i+1,JSON.stringify({
            nextOperation:c.nextOperation,nextStOperation:c.nextStOperation,routePosition:c.routePosition,
            nextPlanningOperation:c.nextPlanningOperation?.code || null,
            recipeSuggestion:c.recipeSuggestion,processTimeSuggestion:c.processTimeSuggestion,batchProposal:c.batchProposal,
          })]
        );
      }
      return { id:batchId,batchNo,batchKey };
    });
    return NextResponse.json({ ok:true, ...created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create batch.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
