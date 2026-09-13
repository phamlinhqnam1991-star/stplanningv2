import type { PoolClient } from "pg";
import type { BatchModel } from "@/lib/batch-model";
import { ErpConflictError, validateStatusTransition, writeAuditEvent } from "@/lib/commitment-ledger";

export type ExecutionAction = "START" | "COMPLETE" | "HOLD" | "RESET";

export type ExecutionMutation = {
  batchId: string;
  jobNum?: string | null;
  expectedBatchVersion?: number | null;
  action: ExecutionAction;
  actualAt?: string | null;
  goodQty?: number | null;
  rejectQty?: number | null;
  actor?: string | null;
  notes?: string | null;
};

const norm=(v:unknown)=>String(v??"").trim().toUpperCase();
const isoNow=()=>new Date().toISOString();

function resolveTimestamp(value?:string|null){
  const raw=value?.trim();
  if(!raw)return isoNow();
  const parsed=new Date(raw);
  if(!Number.isFinite(parsed.getTime()))throw new ErpConflictError("INVALID_ACTUAL_TIMESTAMP",`Invalid actual timestamp: ${raw}.`);
  return parsed.toISOString();
}

async function lockBatch(client:PoolClient,batchId:string){
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`ST_BATCH_EXEC:${batchId}`]);
  const r=await client.query<{id:string;batch_no:string;status:string;version:number;actual_start:string|null;actual_end:string|null}>(`SELECT id::text,batch_no,status,version,actual_start::text,actual_end::text FROM planning_batches WHERE id=$1 FOR UPDATE`,[batchId]);
  if(!r.rows[0])throw new Error("Batch not found.");
  return r.rows[0];
}

function checkVersion(actual:number,expected?:number|null){
  if(expected==null)return;
  if(actual!==expected)throw new ErpConflictError("STALE_BATCH_VERSION",`Batch changed from version ${expected} to ${actual}. Refresh before recording actual execution.`,{expectedVersion:expected,actualVersion:actual});
}

function actionState(action:ExecutionAction){
  if(action==="START")return "IN_PROGRESS";
  if(action==="COMPLETE")return "DONE";
  if(action==="HOLD")return "HOLD";
  return "WAITING";
}

export async function mutateExecution(client:PoolClient,model:BatchModel,input:ExecutionMutation){
  const batch=await lockBatch(client,input.batchId);
  checkVersion(batch.version,input.expectedBatchVersion);
  const actor=input.actor?.trim()||"PUBLIC_UI";
  const at=resolveTimestamp(input.actualAt);
  const memberResult=await client.query<{
    id:string;job_num:string;main_operation_code:string;route_occurrence_key:string;route_position:number|null;qty:string|null;
  }>(`
    SELECT j.id::text,j.job_num,COALESCE(NULLIF(j.main_operation_code,''),b.main_operation_code) AS main_operation_code,
           COALESCE(NULLIF(j.route_occurrence_key,''),'LEGACY:'||j.id::text) AS route_occurrence_key,j.route_position,j.qty::text
    FROM planning_batch_jobs j JOIN planning_batches b ON b.id=j.batch_id
    WHERE j.batch_id=$1 AND ($2::text IS NULL OR upper(btrim(j.job_num))=upper(btrim($2)))
    ORDER BY j.sequence_order,j.id`,[input.batchId,input.jobNum?.trim()||null]);
  if(!memberResult.rows.length)throw new Error(input.jobNum?`Job ${input.jobNum} is not a member of this Batch.`:"Batch has no Jobs.");

  const batchStatus=norm(batch.status);
  if(batchStatus==="CANCELLED")throw new ErpConflictError("TERMINAL_BATCH",`Batch ${batch.batch_no} is CANCELLED; actual execution cannot be changed.`);
  if(input.action==="START" && batchStatus!=="STARTED")validateStatusTransition(model,batch.status,"STARTED");
  if(input.action==="COMPLETE" && batchStatus!=="STARTED"){
    if(batchStatus==="COMPLETED")throw new ErpConflictError("TERMINAL_BATCH",`Batch ${batch.batch_no} is COMPLETED; actual execution is locked. Use a controlled correction workflow instead of rewriting history.`);
    throw new ErpConflictError("BATCH_NOT_STARTED",`Batch ${batch.batch_no} must be STARTED before completion.`);
  }
  if(input.action==="HOLD" && batchStatus!=="STARTED")throw new ErpConflictError("BATCH_NOT_STARTED",`Batch ${batch.batch_no} must be STARTED before a Job can be placed on HOLD.`);
  if(input.action==="RESET" && batchStatus!=="STARTED")throw new ErpConflictError("BATCH_NOT_STARTED",`Batch ${batch.batch_no} must be STARTED before execution can be reset.`);

  const targetState=actionState(input.action);
  const ids:string[]=[];
  for(const member of memberResult.rows){
    const existing=await client.query<{id:string;state:string;actual_start:string|null;actual_end:string|null;version:number}>(`SELECT id::text,state,actual_start::text,actual_end::text,version FROM erp_job_operation_execution WHERE upper(btrim(job_num))=upper(btrim($1)) AND route_occurrence_key=$2 FOR UPDATE`,[member.job_num,member.route_occurrence_key]);
    const old=existing.rows[0]||null;
    const oldState=norm(old?.state);
    if(oldState==="DONE" && input.action!=="COMPLETE")throw new ErpConflictError("EXECUTION_DONE_LOCKED",`${member.job_num} / ${member.route_occurrence_key} is DONE and cannot be reopened by ${input.action}.`,{jobNum:member.job_num,routeOccurrenceKey:member.route_occurrence_key,state:old?.state});
    if(input.action==="COMPLETE" && oldState==="DONE")throw new ErpConflictError("EXECUTION_DONE_LOCKED",`${member.job_num} / ${member.route_occurrence_key} is already DONE. Actual completion is locked.`,{jobNum:member.job_num,routeOccurrenceKey:member.route_occurrence_key,state:old?.state});
    if(input.action==="HOLD" && oldState!=="IN_PROGRESS" && oldState!=="HOLD")throw new ErpConflictError("EXECUTION_NOT_IN_PROGRESS",`${member.job_num} / ${member.route_occurrence_key} must be IN_PROGRESS before HOLD.`,{jobNum:member.job_num,routeOccurrenceKey:member.route_occurrence_key,state:old?.state||"WAITING"});
    if(input.action==="RESET" && oldState!=="IN_PROGRESS" && oldState!=="HOLD")throw new ErpConflictError("EXECUTION_NOT_RESETTABLE",`${member.job_num} / ${member.route_occurrence_key} can only reset from IN_PROGRESS or HOLD.`,{jobNum:member.job_num,routeOccurrenceKey:member.route_occurrence_key,state:old?.state||"WAITING"});
    let actualStart=old?.actual_start||null;
    let actualEnd=old?.actual_end||null;
    if(input.action==="START"){actualStart=actualStart||at;actualEnd=null;}
    if(input.action==="COMPLETE"){actualStart=actualStart||at;actualEnd=at;}
    if(input.action==="RESET"){actualStart=null;actualEnd=null;}
    const good=input.action==="COMPLETE"?(input.goodQty??Number(member.qty||0)):null;
    const reject=input.action==="COMPLETE"?(input.rejectQty??0):null;
    const saved=await client.query<{id:string}>(`
      INSERT INTO erp_job_operation_execution(
        batch_id,batch_job_id,job_num,main_operation_code,route_occurrence_key,route_position,state,actual_start,actual_end,good_qty,reject_qty,metadata,actor
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10,$11,$12::jsonb,$13)
      ON CONFLICT(job_num,route_occurrence_key) DO UPDATE SET
        batch_id=EXCLUDED.batch_id,batch_job_id=EXCLUDED.batch_job_id,main_operation_code=EXCLUDED.main_operation_code,route_position=EXCLUDED.route_position,
        state=EXCLUDED.state,actual_start=EXCLUDED.actual_start,actual_end=EXCLUDED.actual_end,
        good_qty=COALESCE(EXCLUDED.good_qty,erp_job_operation_execution.good_qty),reject_qty=COALESCE(EXCLUDED.reject_qty,erp_job_operation_execution.reject_qty),
        metadata=erp_job_operation_execution.metadata||EXCLUDED.metadata,actor=EXCLUDED.actor,version=erp_job_operation_execution.version+1,updated_at=now()
      RETURNING id::text`,[input.batchId,Number(member.id),member.job_num,member.main_operation_code,member.route_occurrence_key,member.route_position,targetState,actualStart,actualEnd,good,reject,JSON.stringify({notes:input.notes||null}),actor]);
    ids.push(saved.rows[0].id);
    await writeAuditEvent(client,{eventType:`EXECUTION_${input.action}`,entityType:"JOB_OPERATION_EXECUTION",entityId:saved.rows[0].id,jobNum:member.job_num,batchId:input.batchId,actor,oldState:old?{state:old.state,actualStart:old.actual_start,actualEnd:old.actual_end}:{},newState:{state:targetState,actualStart,actualEnd,goodQty:good,rejectQty:reject},metadata:{routeOccurrenceKey:member.route_occurrence_key,mainOperationCode:member.main_operation_code,notes:input.notes||null}});
  }

  const aggregate=await client.query<{total:number;done:number;running:number}>(`
    SELECT count(*)::int AS total,
           count(*) FILTER(WHERE e.state='DONE')::int AS done,
           count(*) FILTER(WHERE e.state='IN_PROGRESS')::int AS running
    FROM planning_batch_jobs j
    LEFT JOIN erp_job_operation_execution e ON upper(btrim(e.job_num))=upper(btrim(j.job_num)) AND e.route_occurrence_key=COALESCE(NULLIF(j.route_occurrence_key,''),'LEGACY:'||j.id::text)
    WHERE j.batch_id=$1`,[input.batchId]);
  const agg=aggregate.rows[0]||{total:0,done:0,running:0};
  let nextStatus=batch.status;
  if(input.action==="START" && norm(batch.status)!=="STARTED")nextStatus="STARTED";
  if(agg.total>0&&agg.done===agg.total){if(norm(batch.status)!=="COMPLETED")validateStatusTransition(model,norm(batch.status)==="STARTED"?"STARTED":nextStatus,"COMPLETED");nextStatus="COMPLETED";}
  const nextVersion=batch.version+1;
  await client.query(`UPDATE planning_batches SET status=$2,version=$3,status_changed_at=CASE WHEN status<>$2 THEN now() ELSE status_changed_at END,actual_start=CASE WHEN $2='STARTED' THEN COALESCE(actual_start,$4::timestamptz) ELSE actual_start END,actual_end=CASE WHEN $2='COMPLETED' THEN COALESCE(actual_end,$4::timestamptz) ELSE actual_end END,updated_at=now() WHERE id=$1`,[input.batchId,nextStatus,nextVersion,at]);
  if(nextStatus==="COMPLETED"){
    await client.query(`UPDATE erp_schedule_reservations SET state='COMPLETED',version=version+1,updated_at=now() WHERE batch_id=$1 AND state='ACTIVE'`,[input.batchId]);
    await client.query(`UPDATE erp_job_commitments SET state='COMPLETED',version=version+1,updated_at=now() WHERE batch_id=$1 AND state='ACTIVE'`,[input.batchId]);
  }
  await writeAuditEvent(client,{eventType:"BATCH_EXECUTION_ROLLUP",entityType:"BATCH",entityId:input.batchId,batchId:input.batchId,actor,oldState:{status:batch.status,version:batch.version},newState:{status:nextStatus,version:nextVersion,total:agg.total,done:agg.done,running:agg.running},metadata:{action:input.action,jobNum:input.jobNum||null}});
  return{ok:true,batchId:input.batchId,batchNo:batch.batch_no,batchStatus:nextStatus,batchVersion:nextVersion,executionIds:ids,summary:agg};
}

export type InspectionMutation={
  jobNum:string;routeOccurrenceKey:string;routePosition?:number|null;operationCode:string;inspectionType?:"INTERMEDIATE"|"FINAL";status:"WAITING"|"IN_PROGRESS"|"PASSED"|"FAILED"|"SKIPPED";actualAt?:string|null;resultCode?:string|null;notes?:string|null;expectedVersion?:number|null;actor?:string|null;
};

export async function upsertInspection(client:PoolClient,input:InspectionMutation){
  const lockKey=`ST_INSPECTION:${norm(input.jobNum)}|${input.routeOccurrenceKey}`;
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[lockKey]);
  const current=await client.query<{id:string;status:string;actual_start:string|null;actual_end:string|null;version:number}>(`SELECT id::text,status,actual_start::text,actual_end::text,version FROM erp_inspection_events WHERE upper(btrim(job_num))=upper(btrim($1)) AND route_occurrence_key=$2 FOR UPDATE`,[input.jobNum,input.routeOccurrenceKey]);
  const old=current.rows[0]||null;
  if(old&&input.expectedVersion!=null&&old.version!==input.expectedVersion)throw new ErpConflictError("STALE_INSPECTION_VERSION","Inspection state changed after the screen was loaded.",{expectedVersion:input.expectedVersion,actualVersion:old.version});
  const at=resolveTimestamp(input.actualAt);
  let actualStart=old?.actual_start||null;let actualEnd=old?.actual_end||null;
  if(input.status==="IN_PROGRESS"){actualStart=actualStart||at;actualEnd=null;}
  if(["PASSED","FAILED","SKIPPED"].includes(input.status)){actualStart=actualStart||at;actualEnd=at;}
  if(input.status==="WAITING"){actualStart=null;actualEnd=null;}
  const actor=input.actor?.trim()||"PUBLIC_UI";
  const saved=await client.query<{id:string;version:number}>(`
    INSERT INTO erp_inspection_events(job_num,route_occurrence_key,route_position,operation_code,inspection_type,status,actual_start,actual_end,result_code,notes,actor)
    VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9,$10,$11)
    ON CONFLICT(job_num,route_occurrence_key) DO UPDATE SET route_position=EXCLUDED.route_position,operation_code=EXCLUDED.operation_code,inspection_type=EXCLUDED.inspection_type,status=EXCLUDED.status,actual_start=EXCLUDED.actual_start,actual_end=EXCLUDED.actual_end,result_code=EXCLUDED.result_code,notes=EXCLUDED.notes,actor=EXCLUDED.actor,version=erp_inspection_events.version+1,updated_at=now()
    RETURNING id::text,version`,[input.jobNum,input.routeOccurrenceKey,input.routePosition??null,input.operationCode,input.inspectionType||"INTERMEDIATE",input.status,actualStart,actualEnd,input.resultCode||null,input.notes||null,actor]);
  await writeAuditEvent(client,{eventType:"INSPECTION_STATUS_CHANGED",entityType:"INSPECTION",entityId:saved.rows[0].id,jobNum:input.jobNum,actor,oldState:old?{status:old.status,actualStart:old.actual_start,actualEnd:old.actual_end,version:old.version}:{},newState:{status:input.status,actualStart,actualEnd,version:saved.rows[0].version,resultCode:input.resultCode||null},metadata:{routeOccurrenceKey:input.routeOccurrenceKey,operationCode:input.operationCode,inspectionType:input.inspectionType||"INTERMEDIATE",notes:input.notes||null}});
  return{ok:true,id:saved.rows[0].id,version:saved.rows[0].version,status:input.status,actualStart,actualEnd};
}
