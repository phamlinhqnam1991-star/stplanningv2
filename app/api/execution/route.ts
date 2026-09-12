import { NextResponse } from "next/server";
import { z } from "zod";
import { query, withTransaction } from "@/lib/db";
import { getBatchModel } from "@/lib/batch-model";
import { ErpConflictError } from "@/lib/commitment-ledger";
import { mutateExecution } from "@/lib/execution-ledger";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const mutation=z.object({
  batchId:z.string().uuid(),jobNum:z.string().min(1).max(120).nullable().optional(),expectedBatchVersion:z.number().int().positive().nullable().optional(),
  action:z.enum(["START","COMPLETE","HOLD","RESET"]),actualAt:z.string().nullable().optional(),goodQty:z.number().nonnegative().nullable().optional(),rejectQty:z.number().nonnegative().nullable().optional(),actor:z.string().max(120).nullable().optional(),notes:z.string().max(1000).nullable().optional(),
});

function err(error:unknown){if(error instanceof ErpConflictError)return NextResponse.json({error:error.message,code:error.code,details:error.details},{status:409});return NextResponse.json({error:error instanceof Error?error.message:"Execution update failed."},{status:400});}

export async function GET(request:Request){
  try{
    const u=new URL(request.url);const batchId=(u.searchParams.get("batchId")||"").trim();const jobNum=(u.searchParams.get("jobNum")||"").trim();const params:unknown[]=[];const where:string[]=[];
    if(batchId){params.push(batchId);where.push(`e.batch_id=$${params.length}::uuid`);}if(jobNum){params.push(jobNum);where.push(`upper(btrim(e.job_num))=upper(btrim($${params.length}))`);}
    const rows=await query(`SELECT e.id::text,e.batch_id::text,e.batch_job_id,e.job_num,e.main_operation_code,e.route_occurrence_key,e.route_position,e.state,e.actual_start::text,e.actual_end::text,e.good_qty,e.reject_qty,e.version,e.metadata,e.actor,e.updated_at::text,b.batch_no,b.status AS batch_status,b.version AS batch_version FROM erp_job_operation_execution e LEFT JOIN planning_batches b ON b.id=e.batch_id ${where.length?`WHERE ${where.join(" AND ")}`:""} ORDER BY e.updated_at DESC LIMIT 1000`,params);
    const batches=await query(`SELECT b.id::text,b.batch_no,b.main_operation_code,b.status,b.version,b.job_count,b.total_surface_dm2,b.actual_start::text,b.actual_end::text,count(e.id) FILTER(WHERE e.state='DONE')::int AS done_jobs,count(e.id) FILTER(WHERE e.state='IN_PROGRESS')::int AS running_jobs FROM planning_batches b LEFT JOIN erp_job_operation_execution e ON e.batch_id=b.id WHERE b.status IN ('SCHEDULED','STARTED','COMPLETED') GROUP BY b.id ORDER BY CASE b.status WHEN 'STARTED' THEN 0 WHEN 'SCHEDULED' THEN 1 ELSE 2 END,b.updated_at DESC LIMIT 300`);
    return NextResponse.json({rows:rows.rows,batches:batches.rows});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load execution."},{status:500});}
}

export async function POST(request:Request){try{const x=mutation.parse(await request.json());const model=await getBatchModel();const result=await withTransaction(c=>mutateExecution(c,model,x));return NextResponse.json(result);}catch(error){return err(error);}}
