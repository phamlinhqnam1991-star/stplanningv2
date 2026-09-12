"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api-client";

type Plan = {
  id:number; proposal_no:string; scenario_name:string|null; target_dm2:string|number; cutoff_time:string|null; status:string;
  already_final_dm2:string|number; existing_plan_dm2:string|number; proposed_dm2:string|number; forecast_dm2:string|number; gap_dm2:string|number;
  version:number; created_at:string; accepted_at:string|null; revalidated_at:string|null; conflict_json:unknown[];
};
type Batch = {
  id:number; proposed_plan_id:number; selected:boolean; source_mode:string; existing_batch_id:string|null; existing_batch_no:string|null;
  main_operation:string; recipe_no:string|null; recipe_name:string|null; batch_key:string|null; resource_type:string|null; resource_code:string|null;
  start_time:string|null; end_time:string|null; qty:string|number; surface_dm2:string|number; process_minutes:number|null; status:string;
  accepted_batch_id:string|null; accepted_reservation_id:string|null; conflict_code:string|null; conflict_detail:string|null; conflict_json:unknown[];
};
type Payload = { plans:Plan[]; batches:Batch[] };
function fmt(v:unknown,d=1){const n=Number(v);return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:d}):"—";}
function dateTime(v:string|null){if(!v)return"—";const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString():v;}
function pill(status:string){return status==="ACCEPTED"?"good":status==="CONFLICT"||status==="STALE"?"bad":status==="READY"||status==="SELECTED"||status==="PARTIALLY_ACCEPTED"?"info":status==="REJECTED"?"neutral":"warn";}

export function ProposedPlanWorkbench(){
  const[data,setData]=useState<Payload>({plans:[],batches:[]});
  const[selected,setSelected]=useState<number|null>(null);
  const[error,setError]=useState("");const[msg,setMsg]=useState("");const[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{setBusy(true);setError("");try{const p=await apiJson<Payload>("/api/proposals?limit=50",{cache:"no-store"});setData(p);if(!selected&&p.plans[0])setSelected(Number(p.plans[0].id));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}},[selected]);
  useEffect(()=>{void load();},[]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan=useMemo(()=>data.plans.find(p=>Number(p.id)===Number(selected))||null,[data.plans,selected]);
  const batches=useMemo(()=>data.batches.filter(b=>Number(b.proposed_plan_id)===Number(selected)),[data.batches,selected]);
  const selectedIds=useMemo(()=>batches.filter(b=>b.selected&&b.status!=="ACCEPTED").map(b=>Number(b.id)),[batches]);

  async function saveSelection(ids:number[]){
    if(!plan)return;setBusy(true);setError("");setMsg("");
    try{await apiJson("/api/proposals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"SET_SELECTION",proposalId:Number(plan.id),selectedBatchIds:ids})});await load();}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function action(action:"REVALIDATE"|"ACCEPT",mode:"ALL"|"SELECTED"="ALL"){
    if(!plan)return;
    if(mode==="SELECTED"&&!selectedIds.length){setError("Select at least one proposed Batch first.");return;}
    if(action==="ACCEPT"&&!confirm(`${mode==="SELECTED"?"Accept selected Batches from":"Accept all Batches in"} ${plan.proposal_no}? Acceptance is atomic for this scope and will not silently reschedule conflicts.`))return;
    setBusy(true);setError("");setMsg("");
    try{
      const r=await apiJson<{accepted?:unknown[];conflicts?:unknown[];status?:string}>("/api/proposals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action==="REVALIDATE"?{action,proposalId:Number(plan.id),selectedOnly:mode==="SELECTED"}:{action,proposalId:Number(plan.id),mode})});
      setMsg(action==="ACCEPT"?`Accepted ${r.accepted?.length||0} Batch(es) transactionally. Plan status: ${r.status||"updated"}.`:`Revalidation completed. ${r.conflicts?.length||0} conflict(s).`);
      await load();
    }catch(e){setError(e instanceof Error?e.message:String(e));await load();}finally{setBusy(false);}
  }

  return <div className="stack">
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">v026.7 · OUT-45</span><h2>Proposed Plan → Revalidate → Accept</h2><p className="subcell">Frozen optimizer plans are revalidated against live Job occurrence, Recipe, execution, Batch version and exact resource/time reservations. Accept Selected and Accept All are transactional; conflicts never trigger silent rescheduling.</p></div><button className="button" onClick={()=>void load()} disabled={busy}>{busy?"Refreshing…":"Refresh"}</button></div>
      {error?<div className="alert error"><strong>Proposal conflict</strong><span>{error}</span></div>:null}{msg?<div className="alert success"><strong>OUT-45</strong><span>{msg}</span></div>:null}
      <div className="two-col"><div className="table-wrap"><table className="erp-table compact"><thead><tr><th>Proposal</th><th>Scenario</th><th>Status</th><th>Forecast</th><th>Gap</th><th>Created</th></tr></thead><tbody>{!data.plans.length?<tr><td colSpan={6} className="empty-state">No Proposed Plan yet. Create one from OUT-40 What-if Optimizer.</td></tr>:data.plans.map(p=><tr key={p.id} className={Number(selected)===Number(p.id)?"selected-row":""} onClick={()=>setSelected(Number(p.id))}><td><strong className="mono">{p.proposal_no}</strong></td><td>{p.scenario_name||"—"}</td><td><span className={`state-pill ${pill(p.status)}`}>{p.status}</span></td><td className="num">{fmt(p.forecast_dm2)}</td><td className="num">{fmt(p.gap_dm2)}</td><td>{dateTime(p.created_at)}</td></tr>)}</tbody></table></div>
        <div className="panel inset">{plan?<><div className="panel-head"><div><span className="eyebrow">SELECTED PROPOSAL</span><h3>{plan.proposal_no}</h3></div><span className={`state-pill ${pill(plan.status)}`}>{plan.status} · v{plan.version}</span></div><div className="kpi-grid"><div className="kpi-card"><span>TARGET</span><strong>{fmt(plan.target_dm2)}</strong></div><div className="kpi-card"><span>EXISTING</span><strong>{fmt(plan.existing_plan_dm2)}</strong></div><div className="kpi-card"><span>PROPOSED</span><strong>{fmt(plan.proposed_dm2)}</strong></div><div className="kpi-card"><span>FORECAST</span><strong>{fmt(plan.forecast_dm2)}</strong></div></div><div className="header-actions"><button className="button" onClick={()=>void action("REVALIDATE","SELECTED")} disabled={busy||!selectedIds.length||["ACCEPTED","REJECTED"].includes(plan.status)}>Revalidate Selected</button><button className="button" onClick={()=>void action("REVALIDATE","ALL")} disabled={busy||["ACCEPTED","REJECTED"].includes(plan.status)}>Revalidate All</button><button className="button primary" onClick={()=>void action("ACCEPT","SELECTED")} disabled={busy||!selectedIds.length||["ACCEPTED","REJECTED"].includes(plan.status)}>Accept Selected ({selectedIds.length})</button><button className="button primary" onClick={()=>void action("ACCEPT","ALL")} disabled={busy||["ACCEPTED","REJECTED"].includes(plan.status)}>Accept All</button></div><small className="subcell">Last revalidated: {dateTime(plan.revalidated_at)} · Accepted: {dateTime(plan.accepted_at)}</small></>:<div className="empty-state">Select a proposal.</div>}</div>
      </div>
    </section>
    {plan?<section className="panel"><div className="panel-head"><div><span className="eyebrow">PROPOSED BATCHES</span><h2>Frozen Resource / Time Commitments</h2></div><div className="header-actions"><button className="button" disabled={busy} onClick={()=>void saveSelection(batches.filter(b=>b.status!=="ACCEPTED").map(b=>Number(b.id)))}>Select All</button><button className="button" disabled={busy} onClick={()=>void saveSelection([])}>Clear Selection</button><span className="record-count"><strong>{batches.length}</strong> batches</span></div></div><div className="table-wrap tall"><table className="erp-table compact"><thead><tr><th>Select</th><th>Mode</th><th>Existing Batch</th><th>Main</th><th>Recipe</th><th>Resource</th><th>Start</th><th>End</th><th>Surface</th><th>Status</th><th>Conflict</th><th>Accepted IDs</th></tr></thead><tbody>{!batches.length?<tr><td colSpan={12} className="empty-state">No proposal batches.</td></tr>:batches.map(b=><tr key={b.id}><td><input type="checkbox" checked={Boolean(b.selected)} disabled={busy||b.status==="ACCEPTED"} onChange={()=>void saveSelection(batches.filter(x=>x.status!=="ACCEPTED"&&(x.id===b.id?!x.selected:x.selected)).map(x=>Number(x.id)))}/></td><td><span className="op-chip">{b.source_mode}</span></td><td className="mono">{b.existing_batch_no||"NEW"}</td><td><strong>{b.main_operation}</strong></td><td>{b.recipe_no||b.recipe_name||"—"}</td><td><strong>{b.resource_code||"—"}</strong></td><td>{dateTime(b.start_time)}</td><td>{dateTime(b.end_time)}</td><td>{fmt(b.surface_dm2)} dm²</td><td><span className={`state-pill ${pill(b.status)}`}>{b.status}</span></td><td>{b.conflict_code?<><strong className="bad-text">{b.conflict_code}</strong><small className="subcell">{b.conflict_detail}</small></>:"—"}</td><td>{b.accepted_batch_id?<><small className="mono">B {b.accepted_batch_id.slice(0,8)}</small><small className="subcell mono">R {b.accepted_reservation_id?.slice(0,8)||"—"}</small></>:"—"}</td></tr>)}</tbody></table></div></section>:null}
  </div>;
}
