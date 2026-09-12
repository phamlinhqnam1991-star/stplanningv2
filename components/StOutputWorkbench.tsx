"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { FiniteCapacityPanel } from "@/components/FiniteCapacityPanel";
import { WhatIfOptimizerPanel } from "@/components/WhatIfOptimizerPanel";

type Step = {
  routePosition:number; stepType:"PLANNING"|"INTERMEDIATE_INSPECTION"|"PHYSICAL_SUPPORT"; operationCode:string; operationSequence:number|null;
  mainOperation:{code:string;label:string;scheduleArea?:{code:string;label:string}|null}|null;
  recipe:{recipeNo:string|null;recipeName:string|null;sourceValue:string|null;needsReview:boolean};
  durationMinutes:number|null; state:string; batchNo:string|null; batchStatus:string|null;
  earliestStart:string|null; earliestFinish:string|null; latestStart:string|null; latestFinish:string|null;
  slackMinutes:number|null; planned:boolean; scheduled:boolean; needsReview:boolean;
};
type Row = {
  planningJobId:number; jobNum:string; program:string|null; part:string|null; revision:string|null; qty:number|null; surfaceDm2:number;
  outputKey:string; outputBucket:"ALREADY_REACHED_FINAL"|"EXISTING_PLAN_FORECAST"|"PROPOSED_ADDITIONAL"|"LATE"|"BLOCKED"|"TIME_UNKNOWN"|"NOT_APPLICABLE";
  finalGateCode:string|null; finalGateOccurrence:number|null; requiresNewPlan:boolean; selectedForTarget:boolean; existingScheduledCount:number; existingUnscheduledCount:number;
  nextOperation:string|null; endpointOperation:string; currentPosition:number|null; endpointPosition:number|null; remainingOperationCount:number;
  remainingProcessMinutes:number|null; remainingInspectionCount:number; nextInspectionCode:string|null; nextInspectionStatus:"READY"|"WAITING"|"IN_PROGRESS"|"REVIEW"|null; nextInspectionEta:string|null; nextInspectionFinishAt:string|null; routeSnapshotAt:string|null; projectedFinsstAt:string|null; latestRequiredStart:string|null;
  outputStatus:string; outputBasis:string; countsTowardTarget:boolean; needsReview:boolean; criticalAction:Step|null; steps:Step[]; warnings:string[];
};
type ActionGroup={areaCode:string;areaLabel:string;mainOperationCode:string;mainOperationLabel:string;recipeNo:string|null;recipeName:string|null;jobCount:number;surfaceDm2:number;processMinutes:number;latestStart:string|null;jobs:string[]};
type Payload={
  targetDate:string;cutoffTime:string;cutoffAt:string;targetValue:number;metricCode:string;endpointOperation:string;finalGateCodes:string[];routeSnapshotAt:string|null;
  summary:{scannedJobs:number;outputJobs:number;actualSurface:number;committedSurface:number;plannedSurface:number;needPlanSurface:number;atRiskSurface:number;reviewSurface:number;alreadyPlannedSurface:number;forecastBeforeNewPlan:number;gapBeforeRecommendation:number;recommendedSurface:number;forecastWithRecommendation:number;remainingGap:number;achievementPct:number;alreadyReachedFinalSurface:number;existingPlanForecastSurface:number;proposedAdditionalSurface:number;totalForecastSurface:number;lateSurface:number;blockedSurface:number;timeUnknownSurface:number;duplicateJobsSuppressed:number};
  rows:Row[];rowTotal?:number;recommendedJobNums:string[];actionGroups:ActionGroup[];warnings:string[];
  savedTarget?:{target_date:string;cutoff_time:string;target_value:number|string;metric_code:string}|null;
};

function localToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function fmt(v:number|null|undefined,d=0){return v==null||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString(undefined,{maximumFractionDigits:d})}
function fmtTime(v:string|null|undefined){if(!v)return"—";return v.replace("T"," ")}
function statusClass(status:string){switch(status){case"OUTPUT":return"good";case"COMMITTED":return"info";case"PLANNED":return"violet";case"NEED_PLAN":return"review";case"AT_RISK":return"bad";case"REVIEW":return"warn";default:return"neutral"}}
function bucketClass(bucket:string){switch(bucket){case"ALREADY_REACHED_FINAL":return"good";case"EXISTING_PLAN_FORECAST":return"info";case"PROPOSED_ADDITIONAL":return"violet";case"LATE":return"bad";case"BLOCKED":case"TIME_UNKNOWN":return"warn";default:return"neutral"}}
function bucketLabel(bucket:string){return bucket.replaceAll("_"," ")}

export function StOutputWorkbench(){
  const[targetDate,setTargetDate]=useState(localToday());
  const[cutoffTime,setCutoffTime]=useState("15:00");
  const[targetValue,setTargetValue]=useState("50000");
  const[search,setSearch]=useState("");const[searchApplied,setSearchApplied]=useState("");const[status,setStatus]=useState("");
  const[data,setData]=useState<Payload|null>(null);const[loading,setLoading]=useState(false);const[saving,setSaving]=useState(false);const[error,setError]=useState("");const[message,setMessage]=useState("");

  const load=useCallback(async(init=false)=>{setLoading(true);setError("");try{
    const q=new URLSearchParams({targetDate,rowLimit:"500"});
    if(!init){q.set("cutoffTime",cutoffTime);q.set("targetValue",String(Math.max(0,Number(targetValue)||0)));}
    if(searchApplied)q.set("search",searchApplied);if(status)q.set("status",status);
    const p=await apiJson<Payload>(`/api/st-output?${q}`,{cache:"no-store"});setData(p);
    if(init){setCutoffTime((p.cutoffTime||"15:00").slice(0,5));setTargetValue(String(p.targetValue||50000));}
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}},[targetDate,cutoffTime,targetValue,searchApplied,status]);
  useEffect(()=>{void load(true)},[targetDate]);
  useEffect(()=>{if(data)void load(false)},[status,searchApplied]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveTarget(){setSaving(true);setError("");setMessage("");try{await apiJson("/api/st-output",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({targetDate,cutoffTime,targetValue:Math.max(0,Number(targetValue)||0),metricCode:data?.metricCode||"SURFACE_DM2",status:"ACTIVE"})});setMessage(`Target ${fmt(Number(targetValue),1)} dm² saved for ${targetDate}.`);await load(false)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setSaving(false)}}
  function applySearch(e:React.FormEvent){e.preventDefault();setSearchApplied(search.trim())}
  const recommended=useMemo(()=>new Set(data?.recommendedJobNums||[]),[data?.recommendedJobNums]);
  const s=data?.summary;
  const achievement=Math.min(100,s?.achievementPct||0);

  return <div className="stack st-output-workbench">
    {error?<div className="alert error"><strong>ST Output error</strong><span>{error}</span></div>:null}
    {message?<div className="alert success"><strong>{message}</strong></div>:null}

    <section className="panel output-command-panel">
      <div className="output-target-grid">
        <label><span>Target Date</span><input type="date" value={targetDate} onChange={e=>setTargetDate(e.target.value)}/></label>
        <label><span>Final Gate Cutoff</span><input type="time" value={cutoffTime} onChange={e=>setCutoffTime(e.target.value)}/></label>
        <label><span>ST Output Target (dm²)</span><input type="number" min="0" step="100" value={targetValue} onChange={e=>setTargetValue(e.target.value)}/></label>
        <div className="output-command-actions"><button className="button primary" disabled={loading} onClick={()=>void load(false)}>{loading?"Calculating…":"Calculate"}</button><button className="button" disabled={saving} onClick={()=>void saveTarget()}>{saving?"Saving…":"Save Target"}</button></div>
      </div>
      <div className="output-policy-line"><span>FINAL GATES</span><strong>{data?.finalGateCodes?.join(" / ")||data?.endpointOperation||"FINSST / CFINM-VN"}</strong><span>CUTOFF</span><strong>{cutoffTime}</strong><span>ROUTE SNAPSHOT</span><strong>{fmtTime(data?.routeSnapshotAt)}</strong><span>LOGIC</span><strong>Current Physical Route → Intermediate Inspection → Existing Plan → Final ETA → Unique Job dm²</strong></div>
    </section>

    <section className="kpi-grid output-kpis">
      <article className="kpi-card output-actual"><span>ALREADY REACHED FINAL</span><strong>{fmt(s?.alreadyReachedFinalSurface,1)}</strong><small>{s?.outputJobs||0} unique Jobs at Final Gate</small></article>
      <article className="kpi-card output-planned"><span>EXISTING PLAN FORECAST</span><strong>{fmt(s?.existingPlanForecastSurface,1)}</strong><small>Scheduled / batched work forecast before cutoff</small></article>
      <article className="kpi-card output-recommend"><span>PROPOSED ADDITIONAL</span><strong>{fmt(s?.proposedAdditionalSurface,1)}</strong><small>{data?.recommendedJobNums.length||0} Jobs selected to close target</small></article>
      <article className="kpi-card output-forecast"><span>TOTAL FORECAST</span><strong>{fmt(s?.totalForecastSurface,1)}</strong><small>Remaining gap {fmt(s?.remainingGap,1)} dm²</small></article>
      <article className="kpi-card output-gap"><span>LATE / BLOCKED</span><strong>{fmt((s?.lateSurface||0)+(s?.blockedSurface||0),1)}</strong><small>Late {fmt(s?.lateSurface,1)} · Blocked {fmt(s?.blockedSurface,1)}</small></article>
      <article className="kpi-card output-achieve"><span>TIME UNKNOWN / ACHIEVEMENT</span><strong>{fmt(s?.timeUnknownSurface,1)}</strong><small>{fmt(s?.achievementPct,1)}% of target · duplicate Jobs suppressed {s?.duplicateJobsSuppressed||0}</small></article>
    </section>

    <section className="panel output-progress-panel">
      <div className="panel-head"><div><span className="eyebrow">TARGET COVERAGE</span><h2>ST Output Forecast Before {cutoffTime}</h2></div><span className={`state-pill ${s?.remainingGap===0?"good":"review"}`}>{s?.remainingGap===0?"TARGET COVERED":"PLAN REQUIRED"}</span></div>
      <div className="output-progress-body"><div className="output-progress-track"><div style={{width:`${achievement}%`}}/></div><div className="output-progress-labels"><span>0</span><strong>{fmt(s?.forecastWithRecommendation,1)} / {fmt(data?.targetValue,1)} dm²</strong><span>{fmt(data?.targetValue,1)}</span></div></div>
    </section>

    <FiniteCapacityPanel targetDate={targetDate} cutoffTime={cutoffTime} targetValue={Math.max(0,Number(targetValue)||0)} />

    <WhatIfOptimizerPanel targetDate={targetDate} cutoffTime={cutoffTime} targetValue={Math.max(0,Number(targetValue)||0)} />

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">BACKWARD REQUIREMENT</span><h2>Recommended Plan by Area / Operation / Recipe</h2></div><span className="record-count"><strong>{data?.actionGroups.length||0}</strong> action groups</span></div>
      <div className="table-wrap"><table className="erp-table compact"><thead><tr><th>Area</th><th>Main Operation</th><th>Recipe</th><th>Jobs</th><th>Surface dm²</th><th>Process Load</th><th>Must Start By</th><th>Job List</th></tr></thead><tbody>
        {!data?.actionGroups.length?<tr><td colSpan={8} className="empty-state">{s?.remainingGap===0?"Current Output + planned work already covers the target.":"No review-free NEED_PLAN jobs can close the current gap with the available process-time data."}</td></tr>:data.actionGroups.map((g,i)=><tr key={`${g.areaCode}-${g.mainOperationCode}-${g.recipeNo||i}`}><td><strong>{g.areaLabel}</strong><small className="subcell mono">{g.areaCode}</small></td><td><strong>{g.mainOperationLabel}</strong><small className="subcell mono">{g.mainOperationCode}</small></td><td><strong>{g.recipeNo||"—"}</strong><small className="subcell">{g.recipeName||"No recipe"}</small></td><td className="num">{g.jobCount}</td><td className="num"><strong>{fmt(g.surfaceDm2,1)}</strong></td><td className="num">{fmt(g.processMinutes,0)} min</td><td><strong>{fmtTime(g.latestStart)}</strong></td><td><span className="subcell output-job-list" title={g.jobs.join(", ")}>{g.jobs.slice(0,6).join(", ")}{g.jobs.length>6?` +${g.jobs.length-6}`:""}</span></td></tr>)}
      </tbody></table></div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">JOB FEASIBILITY</span><h2>Current Physical Route → Final Inspection Output</h2></div><span className="record-count"><strong>{data?.rowTotal??data?.rows.length??0}</strong> jobs</span></div>
      <div className="output-filter-ribbon"><form onSubmit={applySearch}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Job / Part / Program…"/><button className="button" type="submit">Search</button></form><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option>OUTPUT</option><option>COMMITTED</option><option>PLANNED</option><option>NEED_PLAN</option><option>AT_RISK</option><option>REVIEW</option><option>OUTPUT_OTHER_DAY</option><option>NOT_APPLICABLE</option></select><button className="button" onClick={()=>{setSearch("");setSearchApplied("");setStatus("")}}>Clear</button></div>
      <div className="table-wrap tall"><table className="erp-table compact output-job-table"><thead><tr><th>Job</th><th>Surface</th><th>Next Operation</th><th>Next Inspection</th><th>Inspection Status</th><th>Inspection ETA</th><th>Remaining</th><th>Remaining Time</th><th>Final Gate</th><th>Final ETA</th><th>Latest Start</th><th>Critical Action</th><th>Physical Route to Final</th><th>Output Bucket</th><th>Output Status</th></tr></thead><tbody>
        {loading&&!data?<tr><td colSpan={15} className="loading-cell">Calculating ST Output…</td></tr>:!data?.rows.length?<tr><td colSpan={15} className="empty-state">No Jobs match the current target filters.</td></tr>:data.rows.map(r=><tr key={r.planningJobId} className={recommended.has(r.jobNum)?"output-recommended-row":""}><td><strong className="mono">{r.jobNum}</strong><small className="subcell">{r.part||"—"} {r.revision?`/ ${r.revision}`:""}</small>{recommended.has(r.jobNum)?<span className="mini-recommend">RECOMMENDED</span>:null}</td><td className="num"><strong>{fmt(r.surfaceDm2,1)}</strong></td><td><span className="op-chip">{r.nextOperation||"—"}</span></td><td>{r.nextInspectionCode?<><span className="inspection-chip">{r.nextInspectionCode}</span><small className="subcell">{r.remainingInspectionCount} remaining</small></>:<span className="muted">—</span>}</td><td>{r.nextInspectionStatus?<span className={`state-pill ${r.nextInspectionStatus==="REVIEW"?"warn":r.nextInspectionStatus==="IN_PROGRESS"?"info":"neutral"}`}>{r.nextInspectionStatus}</span>:<span className="muted">—</span>}</td><td><strong>{fmtTime(r.nextInspectionEta)}</strong>{r.nextInspectionFinishAt?<small className="subcell">finish {fmtTime(r.nextInspectionFinishAt)}</small>:null}</td><td className="num">{r.remainingOperationCount}</td><td className="num">{r.remainingProcessMinutes==null?"—":`${fmt(r.remainingProcessMinutes,0)} min`}</td><td><span className="inspection-final-chip">{r.endpointOperation}</span></td><td><strong>{fmtTime(r.projectedFinsstAt)}</strong><small className="subcell">cutoff {targetDate} {cutoffTime}</small></td><td><strong>{fmtTime(r.latestRequiredStart)}</strong></td><td>{r.criticalAction?<><strong>{r.criticalAction.mainOperation?.label||r.criticalAction.operationCode}</strong><small className="subcell">{r.criticalAction.state} · latest {fmtTime(r.criticalAction.latestStart)}</small></>:<span className="muted">—</span>}</td><td><div className="output-route-chain">{r.steps.slice(0,9).map((x,i)=><span key={`${x.routePosition}-${i}`} className={x.stepType==="INTERMEDIATE_INSPECTION"?"inspection":x.planned?"planned":"wait"} title={`${x.operationCode} | ${x.durationMinutes??"?"} min | ${x.state}`}><b>{x.stepType==="INTERMEDIATE_INSPECTION"?`◆ ${x.operationCode}`:x.mainOperation?.code||x.operationCode}</b><small>{x.stepType==="INTERMEDIATE_INSPECTION"?`INSPECTION · ${x.durationMinutes==null?"TIME UNKNOWN":`${fmt(x.durationMinutes,0)}m`}`:x.durationMinutes==null?"?":`${fmt(x.durationMinutes,0)}m`}</small></span>)}{r.steps.length>9?<em>+{r.steps.length-9}</em>:null}{r.steps.length?<i>→ {r.endpointOperation}</i>:null}</div></td><td><span className={`state-pill ${bucketClass(r.outputBucket)}`} title={r.outputKey}>{bucketLabel(r.outputBucket)}</span>{r.selectedForTarget?<small className="subcell">selected for target</small>:r.requiresNewPlan?<small className="subcell">new plan required</small>:null}</td><td><span className={`state-pill ${statusClass(r.outputStatus)}`} title={r.outputBasis}>{r.outputStatus}</span>{r.needsReview?<small className="subcell">review data</small>:null}</td></tr>)}
      </tbody></table></div>
    </section>
    {data?.warnings.length?<div className="alert error"><strong>Engine warnings</strong><span>{data.warnings.join(" · ")}</span></div>:null}
  </div>
}
