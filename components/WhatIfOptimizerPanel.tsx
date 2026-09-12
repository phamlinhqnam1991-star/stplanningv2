"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { apiJson } from "@/lib/api-client";

type ScenarioSnapshot={name:string;disabledResourceInstances:string[];resourceMaxConcurrent:Record<string,number>;includeExistingSchedule:boolean;chemicalProcessMaxConcurrent:number;maskingOperators:number;unmaskingOperators:number};
type ScenarioSummary={code:string;name:string;kind:"BASELINE"|"CUSTOM"|"AUTO_TRIAL";targetDate:string;cutoffTime:string;targetValue:number;forecastSurfaceDm2:number;gapDm2:number;achievementPct:number;feasibility:string;lateBatchCount:number;unscheduledBatchCount:number;criticalJobCount:number;bottleneckCount:number;proposedBatchCount:number;deltaForecastVsBaseline:number;deltaForecastVsCustom:number;recoveredGapVsCustom:number;snapshot:ScenarioSnapshot;rationale:string};
type Payload={baseline:ScenarioSummary;custom:ScenarioSummary;trials:ScenarioSummary[];best:ScenarioSummary;resources:Array<{baseResourceCode:string;label:string;instances:string[];maxConcurrent:number}>;config:{enabled:boolean;maxAutoTrials:number;cutoffExtensionsMinutes:number[];chemicalConcurrencyBoost:number;laborBoost:number};warnings:string[]};

function fmt(v:number,d=0){return Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:d}):"—";}
function badge(v:string){return v==="CONFIRMED"?"good":v==="PROVISIONAL"?"review":"bad";}
function parseList(v:string){return [...new Set(v.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean))];}

export function WhatIfOptimizerPanel({targetDate,cutoffTime,targetValue}:{targetDate:string;cutoffTime:string;targetValue:number}){
  const[name,setName]=useState("What-if Scenario");
  const[down,setDown]=useState("");
  const[chem,setChem]=useState("");
  const[maskOps,setMaskOps]=useState("");
  const[unmaskOps,setUnmaskOps]=useState("");
  const[existingMode,setExistingMode]=useState<"KEEP"|"IGNORE">("KEEP");
  const[data,setData]=useState<Payload|null>(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const[proposalMessage,setProposalMessage]=useState("");

  const scenario=useMemo(()=>({
    name,
    disabledResourceInstances:parseList(down),
    chemicalProcessMaxConcurrent:chem.trim()?Number(chem):null,
    maskingOperators:maskOps.trim()?Number(maskOps):null,
    unmaskingOperators:unmaskOps.trim()?Number(unmaskOps):null,
    includeExistingSchedule:existingMode==="KEEP",
  }),[name,down,chem,maskOps,unmaskOps,existingMode]);

  async function run(){
    setLoading(true);setError("");
    try{
      const result=await apiJson<Payload>("/api/st-output/what-if",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({targetDate,cutoffTime,targetValue,scenario,runOptimizer:true})});
      setData(result);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  }

  const rows=data?[data.baseline,data.custom,...data.trials]:[];
  async function createProposal(){
    if(!data)return;setLoading(true);setError("");setProposalMessage("");
    try{
      const snap=data.best.snapshot;
      const r=await apiJson<{proposalNo:string;batchCount:number}>("/api/proposals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"CREATE",targetDate,cutoffTime:data.best.cutoffTime,targetValue,scenarioName:data.best.name,scenario:{name:data.best.name,disabledResourceInstances:snap.disabledResourceInstances,resourceMaxConcurrent:snap.resourceMaxConcurrent,includeExistingSchedule:snap.includeExistingSchedule,chemicalProcessMaxConcurrent:snap.chemicalProcessMaxConcurrent,maskingOperators:snap.maskingOperators,unmaskingOperators:snap.unmaskingOperators}})});
      setProposalMessage(`${r.proposalNo} created with ${r.batchCount} proposed Batch(es).`);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  }
  return <section className="panel whatif-panel">
    <div className="panel-head"><div><span className="eyebrow">OUT-44 / WHAT-IF OPTIMIZER</span><h2>Capacity What-if & Target Optimizer</h2><p className="subcell">Trial resource outages, Chemical concurrency and Masking/Unmasking manpower without changing the real plan. Auto trials re-run the complete route, batch gates, recipe, finite capacity and FINSST target.</p></div>{data?<span className={`state-pill ${badge(data.best.feasibility)}`}>BEST · {data.best.name}</span>:null}</div>
    {error?<div className="alert error"><strong>What-if optimizer error</strong><span>{error}</span></div>:null}
    {proposalMessage?<div className="alert success"><strong>OUT-45 Proposed Plan</strong><span>{proposalMessage}</span><Link className="button" href="/proposals">Open Proposed Plans</Link></div>:null}
    <div className="whatif-input-grid">
      <label><span>Scenario Name</span><input value={name} onChange={e=>setName(e.target.value)}/></label>
      <label><span>Resource Down</span><input placeholder="CAB2, FB3" value={down} onChange={e=>setDown(e.target.value)}/><small>Comma separated instance codes. Base code also disables every instance of that resource.</small></label>
      <label><span>Chemical Process Concurrent</span><input type="number" min="1" max="16" placeholder="use config" value={chem} onChange={e=>setChem(e.target.value)}/></label>
      <label><span>Masking Operators</span><input type="number" min="1" max="64" placeholder="use config" value={maskOps} onChange={e=>setMaskOps(e.target.value)}/></label>
      <label><span>Unmasking Operators</span><input type="number" min="1" max="64" placeholder="use config" value={unmaskOps} onChange={e=>setUnmaskOps(e.target.value)}/></label>
      <label><span>Existing Schedule</span><select value={existingMode} onChange={e=>setExistingMode(e.target.value as "KEEP"|"IGNORE")}><option value="KEEP">Keep / reserve existing schedule</option><option value="IGNORE">Ignore existing schedule (analysis only)</option></select></label>
      <div className="whatif-actions"><button className="button primary" disabled={loading} onClick={()=>void run()}>{loading?"Running scenarios…":"Run What-if + Optimize"}</button><small>Target {fmt(targetValue,1)} dm² · FINSST {targetDate} {cutoffTime}</small></div>
    </div>

    {data?<>
      <div className="kpi-grid whatif-kpis">
        <article className="kpi-card"><span>BASELINE</span><strong>{fmt(data.baseline.forecastSurfaceDm2,1)}</strong><small>Gap {fmt(data.baseline.gapDm2,1)} dm²</small></article>
        <article className="kpi-card"><span>CUSTOM SCENARIO</span><strong>{fmt(data.custom.forecastSurfaceDm2,1)}</strong><small>{data.custom.deltaForecastVsBaseline>=0?"+":""}{fmt(data.custom.deltaForecastVsBaseline,1)} vs baseline</small></article>
        <article className="kpi-card output-recommend"><span>BEST TRIAL</span><strong>{fmt(data.best.forecastSurfaceDm2,1)}</strong><small>{data.best.name}</small></article>
        <article className="kpi-card output-gap"><span>BEST GAP</span><strong>{fmt(data.best.gapDm2,1)}</strong><small>{data.best.feasibility}</small></article>
      </div>
      <div className="table-wrap"><table className="erp-table compact"><thead><tr><th>Scenario</th><th>Cutoff</th><th>Forecast dm²</th><th>Gap</th><th>Δ vs Baseline</th><th>Δ vs Custom</th><th>Late</th><th>No Slot</th><th>Critical Jobs</th><th>Verdict</th><th>Assumptions</th></tr></thead><tbody>{rows.map((r,i)=><tr key={`${r.code}-${i}`} className={r.code===data.best.code&&r.kind===data.best.kind?"whatif-best-row":""}><td><strong>{r.name}</strong><small className="subcell mono">{r.kind}</small></td><td><strong>{r.cutoffTime}</strong></td><td className="num"><strong>{fmt(r.forecastSurfaceDm2,1)}</strong></td><td className="num">{fmt(r.gapDm2,1)}</td><td className={`num ${r.deltaForecastVsBaseline>0?"good-text":r.deltaForecastVsBaseline<0?"bad-text":""}`}>{r.deltaForecastVsBaseline>0?"+":""}{fmt(r.deltaForecastVsBaseline,1)}</td><td className={`num ${r.deltaForecastVsCustom>0?"good-text":r.deltaForecastVsCustom<0?"bad-text":""}`}>{r.deltaForecastVsCustom>0?"+":""}{fmt(r.deltaForecastVsCustom,1)}</td><td className="num">{r.lateBatchCount}</td><td className="num">{r.unscheduledBatchCount}</td><td className="num">{r.criticalJobCount}</td><td><span className={`state-pill ${badge(r.feasibility)}`}>{r.feasibility}</span></td><td><div className="capacity-segment-list"><span>{r.rationale}</span>{r.snapshot.disabledResourceInstances.length?<span><b>Down:</b> {r.snapshot.disabledResourceInstances.join(", ")}</span>:null}<span>Chem process × {r.snapshot.chemicalProcessMaxConcurrent}</span><span>Mask ops {r.snapshot.maskingOperators} · Unmask ops {r.snapshot.unmaskingOperators}</span><span>Existing schedule {r.snapshot.includeExistingSchedule?"ON":"IGNORED"}</span></div></td></tr>)}</tbody></table></div>
      <div className="output-config-note"><strong>Optimizer result is advisory until approved</strong><span>Best scenario is selected by smallest target gap, then highest confirmed forecast, then fewer unscheduled/late batches. Create an OUT-45 Proposed Plan to freeze this scenario, revalidate against live ERP state, then accept transactionally.</span><div className="header-actions"><button className="button primary" disabled={loading} onClick={()=>void createProposal()}>Create Proposed Plan from Best</button><Link className="button" href="/proposals">Review OUT-45</Link></div></div>
      {data.warnings.length?<div className="alert warn"><strong>Scenario notes</strong><span>{data.warnings.join(" · ")}</span></div>:null}
    </>:null}
  </section>;
}
