"use client";

import { useMemo, useState } from "react";
import { apiJson } from "@/lib/api-client";

type Batch = {
  id:string;batchNo:string;sourceKind:string;mainOperationCode:string;mainOperationLabel:string;batchKey:string|null;
  recipeNo:string|null;recipeName:string|null;jobCount:number;jobs:string[];totalQty:number;totalSurfaceDm2:number;durationMinutes:number;
  batchRuleCode:string|null;resourceBase:string|null;resourceInstance:string|null;startAt:string|null;endAt:string|null;mustStartBy:string|null;
  status:string;reason:string|null;warnings:string[];
};
type Timeline = {id:string;batchNo:string;sourceKind:string;baseResourceCode:string;resourceInstance:string;resourceLabel:string;mainOperationCode:string|null;recipeNo:string|null;startAt:string;endAt:string;durationMinutes:number;status:string;jobs:string[];surfaceDm2:number};
type Resource = {baseResourceCode:string;label:string;instanceCount:number;maxConcurrent:number;existingMinutes:number;simulatedMinutes:number;availableMinutes:number;utilizationPct:number;lateOrUnscheduledBatches:number};
type Result = {
  targetDate:string;cutoffTime:string;cutoffAt:string;targetValue:number;scenarioStartAt:string;horizonEndAt:string;endpointOperation:string;
  targetFeasibility:"CONFIRMED"|"PROVISIONAL"|"NOT_FEASIBLE";
  summary:{actualSurface:number;committedSurface:number;finitePlannedSurface:number;finiteRecommendedSurface:number;selectedCandidateSurface:number;processTimeForecastSurface:number;finiteCapacityForecastSurface:number;remainingGap:number;achievementPct:number;proposedBatchCount:number;existingBatchToScheduleCount:number;lateBatchCount:number;unscheduledBatchCount:number;capacityReviewJobCount:number};
  selectedJobNums:string[];finiteRecommendedJobNums:string[];batches:Batch[];timeline:Timeline[];resources:Resource[];warnings:string[];
};
function fmt(v:number|null|undefined,d=0){return v==null||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString(undefined,{maximumFractionDigits:d})}
function time(v:string|null|undefined){return v?v.replace("T"," "):"—"}
function wallMs(v:string){const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);return m?Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5])):0}
function badge(status:string){if(status==="ON_TIME"||status==="FIXED")return"good";if(status==="LATE_START")return"warn";if(status==="UNSCHEDULED"||status==="DEPENDENCY_CONFLICT")return"bad";return"neutral"}

export function FiniteCapacityPanel({targetDate,cutoffTime,targetValue}:{targetDate:string;cutoffTime:string;targetValue:number}){
  const[data,setData]=useState<Result|null>(null);const[loading,setLoading]=useState(false);const[error,setError]=useState("");const[resourceFilter,setResourceFilter]=useState("");
  async function run(){setLoading(true);setError("");try{const q=new URLSearchParams({targetDate,cutoffTime,targetValue:String(Math.max(0,targetValue||0))});setData(await apiJson<Result>(`/api/st-output/capacity?${q}`,{cache:"no-store"}))}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}}
  const laneKeys=useMemo(()=>{if(!data)return[];return [...new Set(data.timeline.map(x=>x.resourceInstance))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))},[data]);
  const entries=useMemo(()=>!data?[]:data.timeline.filter(x=>!resourceFilter||x.resourceInstance===resourceFilter),[data,resourceFilter]);
  const start=data?wallMs(data.scenarioStartAt):0,end=data?wallMs(data.horizonEndAt):1,cutoff=data?wallMs(data.cutoffAt):0,span=Math.max(1,end-start);
  const groups=useMemo(()=>{const m=new Map<string,Timeline[]>();for(const x of entries){const a=m.get(x.resourceInstance)||[];a.push(x);m.set(x.resourceInstance,a)}return [...m.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true}))},[entries]);
  const s=data?.summary;
  return <section className="panel finite-capacity-panel">
    <div className="panel-head"><div><span className="eyebrow">FINITE CAPACITY / OUT-41</span><h2>Proposed Batch → Resource Timeline → Target Feasibility</h2><p className="subcell">Simulates current schedule occupancy, existing unscheduled batches and new proposed batches on configured Flybar / Cabin / resource capacity before confirming the ST Output target.</p></div><button className="button primary" disabled={loading} onClick={()=>void run()}>{loading?"Simulating…":"Run Finite Capacity"}</button></div>
    {error?<div className="alert error"><strong>Finite-capacity error</strong><span>{error}</span></div>:null}
    {!data&&!loading?<div className="capacity-empty"><strong>Process-time recommendation is not yet a capacity confirmation.</strong><span>Run this simulation after Calculate to test real resource slots and create proposed batches.</span></div>:null}
    {data?<>
      <div className="capacity-verdict"><div><span>TARGET FEASIBILITY</span><strong className={`state-pill ${data.targetFeasibility==="CONFIRMED"?"good":data.targetFeasibility==="PROVISIONAL"?"warn":"bad"}`}>{data.targetFeasibility}</strong></div><div><span>Simulation window</span><strong>{time(data.scenarioStartAt)} → {time(data.cutoffAt)}</strong></div><div><span>Spill horizon</span><strong>{time(data.horizonEndAt)}</strong></div></div>
      <div className="kpi-grid capacity-kpis">
        <article className="kpi-card"><span>PROCESS-TIME FORECAST</span><strong>{fmt(s?.processTimeForecastSurface,1)}</strong><small>Before finite-resource constraints</small></article>
        <article className="kpi-card output-forecast"><span>FINITE CAPACITY FORECAST</span><strong>{fmt(s?.finiteCapacityForecastSurface,1)}</strong><small>Actual + committed + capacity-feasible work</small></article>
        <article className="kpi-card output-gap"><span>FINITE GAP</span><strong>{fmt(s?.remainingGap,1)}</strong><small>Target {fmt(data.targetValue,1)} dm²</small></article>
        <article className="kpi-card output-recommend"><span>PROPOSED BATCHES</span><strong>{s?.proposedBatchCount||0}</strong><small>{s?.existingBatchToScheduleCount||0} existing batches also placed</small></article>
        <article className="kpi-card"><span>LATE / UNSCHEDULED</span><strong>{(s?.lateBatchCount||0)+(s?.unscheduledBatchCount||0)}</strong><small>{s?.lateBatchCount||0} late · {s?.unscheduledBatchCount||0} no slot/conflict</small></article>
        <article className="kpi-card"><span>CAPACITY REVIEW</span><strong>{s?.capacityReviewJobCount||0}</strong><small>Jobs crossing an area with no finite resource configured</small></article>
      </div>

      <div className="capacity-section-head"><div><span className="eyebrow">RESOURCE LOAD</span><h3>Finite Capacity by Resource</h3></div></div>
      <div className="table-wrap"><table className="erp-table compact"><thead><tr><th>Resource</th><th>Physical Slots</th><th>Max Concurrent</th><th>Existing Load</th><th>Simulated Load</th><th>Capacity</th><th>Utilization</th><th>Late / No Slot</th></tr></thead><tbody>{data.resources.map(r=><tr key={r.baseResourceCode}><td><strong>{r.label}</strong><small className="subcell mono">{r.baseResourceCode}</small></td><td className="num">{r.instanceCount}</td><td className="num">{r.maxConcurrent}</td><td className="num">{fmt(r.existingMinutes,0)} min</td><td className="num">{fmt(r.simulatedMinutes,0)} min</td><td className="num">{fmt(r.availableMinutes,0)} min</td><td><div className="capacity-util"><span style={{width:`${Math.min(100,r.utilizationPct)}%`}}/><b>{fmt(r.utilizationPct,1)}%</b></div></td><td className="num">{r.lateOrUnscheduledBatches}</td></tr>)}</tbody></table></div>

      <div className="capacity-section-head"><div><span className="eyebrow">TRIAL TIMELINE</span><h3>Flybar / Cabin / Area Resource Placement</h3></div><label><span>Lane</span><select value={resourceFilter} onChange={e=>setResourceFilter(e.target.value)}><option value="">All lanes</option>{laneKeys.map(x=><option key={x}>{x}</option>)}</select></label></div>
      <div className="capacity-timeline">
        <div className="capacity-time-axis"><span>{time(data.scenarioStartAt)}</span><strong style={{left:`${Math.max(0,Math.min(100,(cutoff-start)/span*100))}%`}}>FINSST {data.cutoffTime}</strong><span>{time(data.horizonEndAt)}</span></div>
        {groups.length?groups.map(([lane,list])=><div className="capacity-lane" key={lane}><div className="capacity-lane-name"><strong>{lane}</strong><small>{list[0]?.resourceLabel||"Resource"}</small></div><div className="capacity-lane-track"><i className="capacity-cutoff" style={{left:`${Math.max(0,Math.min(100,(cutoff-start)/span*100))}%`}}/>{list.map(x=>{const l=Math.max(0,(wallMs(x.startAt)-start)/span*100),w=Math.max(.6,(wallMs(x.endAt)-wallMs(x.startAt))/span*100);return <span key={x.id} className={`capacity-block ${x.sourceKind.toLowerCase()}`} style={{left:`${l}%`,width:`${Math.min(100-l,w)}%`}} title={`${x.batchNo}\n${x.mainOperationCode||"Existing schedule"}\n${time(x.startAt)} → ${time(x.endAt)}\n${x.recipeNo||"No recipe"}`}>{x.batchNo}</span>})}</div></div>):<div className="empty-state">No resource blocks in this simulation window.</div>}
      </div>
      <div className="capacity-legend"><span><i className="existing_schedule"/> Existing Schedule</span><span><i className="existing_batch"/> Existing Batch placed by simulation</span><span><i className="proposed_batch"/> Proposed Batch</span></div>

      <div className="capacity-section-head"><div><span className="eyebrow">PROPOSED / UNSCHEDULED BATCHES</span><h3>Batch Placement Details</h3></div><span className="record-count"><strong>{data.batches.length}</strong> batches</span></div>
      <div className="table-wrap tall"><table className="erp-table compact"><thead><tr><th>Batch</th><th>Operation</th><th>Recipe</th><th>Jobs</th><th>Surface</th><th>Duration</th><th>Resource</th><th>Start</th><th>End</th><th>Must Start By</th><th>Status</th></tr></thead><tbody>{data.batches.length?data.batches.map(b=><tr key={b.id}><td><strong className="mono">{b.batchNo}</strong><small className="subcell">{b.sourceKind.replaceAll("_"," ")}</small></td><td><strong>{b.mainOperationLabel}</strong><small className="subcell mono">{b.mainOperationCode}</small></td><td><strong>{b.recipeNo||"—"}</strong><small className="subcell">{b.recipeName||"No recipe"}</small></td><td><strong>{b.jobCount}</strong><small className="subcell" title={b.jobs.join(", ")}>{b.jobs.slice(0,4).join(", ")}{b.jobs.length>4?` +${b.jobs.length-4}`:""}</small></td><td className="num">{fmt(b.totalSurfaceDm2,1)}</td><td className="num">{fmt(b.durationMinutes,0)} min</td><td><strong>{b.resourceInstance||"—"}</strong><small className="subcell mono">{b.resourceBase||"NO RESOURCE"}</small></td><td>{time(b.startAt)}</td><td>{time(b.endAt)}</td><td>{time(b.mustStartBy)}</td><td><span className={`state-pill ${badge(b.status)}`}>{b.status}</span>{b.reason?<small className="subcell">{b.reason}</small>:null}</td></tr>):<tr><td colSpan={11} className="empty-state">No capacity batches required.</td></tr>}</tbody></table></div>
      {data.warnings.length?<div className="alert error"><strong>Capacity warnings</strong><span>{data.warnings.join(" · ")}</span></div>:null}
    </>:null}
  </section>
}
