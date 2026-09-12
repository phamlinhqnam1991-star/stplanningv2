"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api-client";

type Batch = {
  id:string; batch_no:string; main_operation_code:string; main_operation_label:string|null; recipe_no:string|null; recipe_name:string|null;
  status:string; version:number; job_count:number; total_qty:string|number; total_surface_dm2:string|number; process_time_minutes:string|number|null; active_reservation_count:number;
};
type Resource = { baseResourceCode:string; resourceCode:string; label:string; maxConcurrent:number; calendarMode:string; windowStart:string|null; windowEnd:string|null };
type Reservation = {
  id:string; batch_id:string; batch_no:string; main_operation_code:string; base_resource_code:string; resource_code:string; resource_type:string; phase:string;
  schedule_date:string; start_at:string; end_at:string; state:string; source_type:string; capacity_units:number; version:number; batch_status:string; batch_version:number;
};
type Payload = { reservations:Reservation[]; schedulableBatches:Batch[]; resources:Resource[] };

function localInputValue(date = new Date()) {
  const pad=(n:number)=>String(n).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function toIso(value:string){const d=new Date(value);if(!Number.isFinite(d.getTime()))throw new Error("Invalid schedule time.");return d.toISOString();}
function fmt(value:string){const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString():value;}
function num(value:unknown){const n=Number(value);return Number.isFinite(n)?n:0;}

export function TransactionalSchedulingPanel(){
  const[data,setData]=useState<Payload|null>(null);
  const[error,setError]=useState("");
  const[message,setMessage]=useState("");
  const[loading,setLoading]=useState(false);
  const[batchId,setBatchId]=useState("");
  const[resourceCode,setResourceCode]=useState("");
  const[startAt,setStartAt]=useState(()=>localInputValue(new Date(Date.now()+60*60_000)));
  const[endAt,setEndAt]=useState(()=>localInputValue(new Date(Date.now()+3*60*60_000)));
  const[phase,setPhase]=useState("NORMAL");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{setData(await apiJson<Payload>("/api/scheduling/erp",{cache:"no-store"}));}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!batchId&&data?.schedulableBatches[0])setBatchId(data.schedulableBatches[0].id);},[data,batchId]);
  useEffect(()=>{if(!resourceCode&&data?.resources[0])setResourceCode(data.resources[0].resourceCode);},[data,resourceCode]);

  const batch=useMemo(()=>data?.schedulableBatches.find(x=>x.id===batchId)||null,[data,batchId]);
  const resource=useMemo(()=>data?.resources.find(x=>x.resourceCode===resourceCode)||null,[data,resourceCode]);

  async function create(){
    if(!batch||!resource)return;
    setError("");setMessage("");setLoading(true);
    try{
      const result=await apiJson<{batchNo:string;batchVersion:number}>("/api/scheduling/erp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        action:"CREATE",batchId:batch.id,expectedBatchVersion:batch.version,baseResourceCode:resource.baseResourceCode,resourceCode:resource.resourceCode,
        resourceType:"FINITE_RESOURCE",phase,startAt:toIso(startAt),endAt:toIso(endAt),capacityUnits:1,
      })});
      setMessage(`${result.batchNo} reserved on ${resource.resourceCode}. Batch version ${result.batchVersion}.`);await load();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  }
  async function cancel(r:Reservation){
    if(!confirm(`Cancel ${r.batch_no} reservation on ${r.resource_code}?`))return;
    setError("");setMessage("");setLoading(true);
    try{await apiJson("/api/scheduling/erp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"CANCEL",reservationId:r.id,expectedReservationVersion:r.version,expectedBatchVersion:r.batch_version,reason:"Cancelled from SCH-20"})});setMessage(`Reservation ${r.batch_no} / ${r.resource_code} cancelled.`);await load();}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  }

  return <section className="panel">
    <div className="panel-head"><div><span className="eyebrow">v026.3 · TRANSACTIONAL SCHEDULING</span><h2>ERP Resource Reservation Ledger</h2><p className="subcell">New schedules are saved transactionally. Exact resource overlaps and stale Batch versions are rejected with HTTP 409. Imported schedule remains read-only below.</p></div><button className="button" onClick={()=>void load()} disabled={loading}>{loading?"Loading…":"Refresh"}</button></div>
    {error?<div className="alert error"><strong>Scheduling conflict</strong><span>{error}</span></div>:null}
    {message?<div className="alert success"><strong>Saved</strong><span>{message}</span></div>:null}
    <div className="whatif-input-grid">
      <label><span>Ready / Scheduled Batch</span><select value={batchId} onChange={e=>setBatchId(e.target.value)}>{(data?.schedulableBatches||[]).map(b=><option value={b.id} key={b.id}>{b.batch_no} · {b.main_operation_code} · {b.status} · v{b.version}</option>)}</select></label>
      <label><span>Finite Resource</span><select value={resourceCode} onChange={e=>setResourceCode(e.target.value)}>{(data?.resources||[]).map(r=><option value={r.resourceCode} key={`${r.baseResourceCode}:${r.resourceCode}`}>{r.resourceCode} · {r.label}</option>)}</select></label>
      <label><span>Start</span><input type="datetime-local" value={startAt} onChange={e=>setStartAt(e.target.value)}/></label>
      <label><span>End</span><input type="datetime-local" value={endAt} onChange={e=>setEndAt(e.target.value)}/></label>
      <label><span>Phase</span><select value={phase} onChange={e=>setPhase(e.target.value)}><option>NORMAL</option><option>LOADING</option><option>PROCESS</option><option>NDT</option><option>UNLOADING</option><option>MASKING</option><option>UNMASKING</option></select></label>
      <div className="whatif-actions"><button className="button primary" onClick={()=>void create()} disabled={loading||!batch||!resource}>Reserve Resource</button>{batch?<small>{batch.main_operation_code} · {batch.job_count} jobs · {num(batch.total_surface_dm2).toLocaleString()} dm² · {num(batch.process_time_minutes)} min</small>:<small>No schedulable Batch.</small>}</div>
    </div>
    <div className="table-wrap"><table className="erp-table compact"><thead><tr><th>Batch</th><th>Main</th><th>Resource</th><th>Phase</th><th>Start</th><th>End</th><th>Source</th><th>Batch Status</th><th>Version</th><th></th></tr></thead><tbody>
      {!data?.reservations.length?<tr><td colSpan={10} className="empty-state">No ACTIVE ERP reservations yet.</td></tr>:data.reservations.map(r=><tr key={r.id}><td><strong className="mono">{r.batch_no}</strong></td><td>{r.main_operation_code}</td><td><span className="op-chip">{r.resource_code}</span></td><td>{r.phase}</td><td>{fmt(r.start_at)}</td><td>{fmt(r.end_at)}</td><td>{r.source_type}</td><td><span className="state-pill info">{r.batch_status}</span></td><td>R{r.version} / B{r.batch_version}</td><td><button className="button small" onClick={()=>void cancel(r)} disabled={loading||["STARTED","COMPLETED"].includes(r.batch_status)}>Cancel</button></td></tr>)}
    </tbody></table></div>
  </section>;
}
