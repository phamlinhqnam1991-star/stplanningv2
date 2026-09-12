import { NextResponse } from "next/server";
import { z } from "zod";
import { query, withTransaction } from "@/lib/db";
import { ErpConflictError } from "@/lib/commitment-ledger";
import { upsertInspection } from "@/lib/execution-ledger";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const mutation=z.object({jobNum:z.string().min(1).max(120),routeOccurrenceKey:z.string().min(1).max(180),routePosition:z.number().int().nullable().optional(),operationCode:z.string().min(1).max(120),inspectionType:z.enum(["INTERMEDIATE","FINAL"]).optional(),status:z.enum(["WAITING","IN_PROGRESS","PASSED","FAILED","SKIPPED"]),actualAt:z.string().nullable().optional(),resultCode:z.string().max(120).nullable().optional(),notes:z.string().max(2000).nullable().optional(),expectedVersion:z.number().int().positive().nullable().optional(),actor:z.string().max(120).nullable().optional()});
function err(error:unknown){if(error instanceof ErpConflictError)return NextResponse.json({error:error.message,code:error.code,details:error.details},{status:409});return NextResponse.json({error:error instanceof Error?error.message:"Inspection update failed."},{status:400});}
export async function GET(request:Request){try{const u=new URL(request.url);const job=(u.searchParams.get("jobNum")||"").trim();const status=(u.searchParams.get("status")||"").trim();const params:unknown[]=[];const where:string[]=[];if(job){params.push(job);where.push(`upper(btrim(job_num))=upper(btrim($${params.length}))`);}if(status){params.push(status);where.push(`status=$${params.length}`);}const rows=await query(`SELECT id::text,job_num,route_occurrence_key,route_position,operation_code,inspection_type,status,actual_start::text,actual_end::text,result_code,notes,version,metadata,actor,updated_at::text FROM erp_inspection_events ${where.length?`WHERE ${where.join(" AND ")}`:""} ORDER BY updated_at DESC LIMIT 1000`,params);return NextResponse.json({rows:rows.rows});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load inspections."},{status:500});}}
export async function POST(request:Request){try{const x=mutation.parse(await request.json());const result=await withTransaction(c=>upsertInspection(c,x));return NextResponse.json(result);}catch(error){return err(error);}}
