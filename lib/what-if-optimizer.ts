import { getCapacityModel, capacityInstanceCodes } from "@/lib/capacity-model";
import { scenarioSnapshot, type CapacityScenarioOverride, type CapacityScenarioSnapshot } from "@/lib/capacity-scenario";
import { calculateFiniteCapacityTarget, type FiniteCapacityOptions, type FiniteCapacityResult } from "@/lib/finite-capacity-scheduler";

export type WhatIfScenarioRequest = FiniteCapacityOptions & {
  scenario?: CapacityScenarioOverride | null;
  runOptimizer?: boolean;
};

export type WhatIfScenarioSummary = {
  code: string;
  name: string;
  kind: "BASELINE" | "CUSTOM" | "AUTO_TRIAL";
  targetDate: string;
  cutoffTime: string;
  targetValue: number;
  forecastSurfaceDm2: number;
  gapDm2: number;
  achievementPct: number;
  feasibility: FiniteCapacityResult["targetFeasibility"];
  lateBatchCount: number;
  unscheduledBatchCount: number;
  criticalJobCount: number;
  bottleneckCount: number;
  proposedBatchCount: number;
  countedJobs: number;
  lateJobs: number;
  blockedJobs: number;
  timeUnknownJobs: number;
  deltaForecastVsBaseline: number;
  deltaForecastVsCustom: number;
  recoveredGapVsCustom: number;
  snapshot: CapacityScenarioSnapshot;
  rationale: string;
};

export type WhatIfOptimizerResult = {
  baseline: WhatIfScenarioSummary;
  custom: WhatIfScenarioSummary;
  trials: WhatIfScenarioSummary[];
  best: WhatIfScenarioSummary;
  resources: Array<{baseResourceCode:string;label:string;instances:string[];maxConcurrent:number}>;
  config: {
    enabled:boolean;
    maxAutoTrials:number;
    cutoffExtensionsMinutes:number[];
    chemicalConcurrencyBoost:number;
    laborBoost:number;
  };
  warnings: string[];
};

function fmtCode(value:string):string{return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g,"_").replace(/^_+|_+$/g,"")||"SCENARIO";}
function mergeScenario(base:CapacityScenarioOverride|null|undefined, patch:CapacityScenarioOverride):CapacityScenarioOverride{
  return {
    ...(base||{}),
    ...patch,
    disabledResourceInstances: patch.disabledResourceInstances ?? base?.disabledResourceInstances ?? [],
    resourceMaxConcurrent: { ...(base?.resourceMaxConcurrent||{}), ...(patch.resourceMaxConcurrent||{}) },
  };
}
function addMinutes(time:string,minutes:number):string|null{
  const m=/^(\d{1,2}):(\d{2})/.exec(time);if(!m)return null;
  const total=Number(m[1])*60+Number(m[2])+minutes;if(total<0||total>=24*60)return null;
  return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
}
function summary(code:string,name:string,kind:WhatIfScenarioSummary["kind"],result:FiniteCapacityResult,snapshot:CapacityScenarioSnapshot,baselineForecast:number,customForecast:number,rationale:string):WhatIfScenarioSummary{
  const forecast=result.summary.finiteCapacityForecastSurface;
  const gap=result.summary.remainingGap;
  return {code,name,kind,targetDate:result.targetDate,cutoffTime:result.cutoffTime,targetValue:result.targetValue,forecastSurfaceDm2:forecast,gapDm2:gap,achievementPct:result.summary.achievementPct,feasibility:result.targetFeasibility,lateBatchCount:result.summary.lateBatchCount,unscheduledBatchCount:result.summary.unscheduledBatchCount,criticalJobCount:result.summary.criticalJobCount,bottleneckCount:result.summary.bottleneckCount,proposedBatchCount:result.summary.proposedBatchCount,countedJobs:result.ledgerSummary.countedJobs,lateJobs:result.ledgerSummary.lateJobs,blockedJobs:result.ledgerSummary.blockedJobs,timeUnknownJobs:result.ledgerSummary.timeUnknownJobs,deltaForecastVsBaseline:forecast-baselineForecast,deltaForecastVsCustom:forecast-customForecast,recoveredGapVsCustom:Math.max(0,customForecast<result.targetValue?Math.min(result.targetValue-customForecast,forecast-customForecast):0),snapshot,rationale};
}

export async function calculateWhatIfOptimizer(request:WhatIfScenarioRequest):Promise<WhatIfOptimizerResult>{
  const capacityModel=await getCapacityModel();
  const options:FiniteCapacityOptions={targetDate:request.targetDate,cutoffTime:request.cutoffTime,targetValue:request.targetValue};
  const manual=request.scenario||{};
  const baselineResult=await calculateFiniteCapacityTarget(options,null);
  const baselineForecast=baselineResult.summary.finiteCapacityForecastSurface;
  const customResult=Object.keys(manual).length?await calculateFiniteCapacityTarget(options,manual):baselineResult;
  const customForecast=customResult.summary.finiteCapacityForecastSurface;
  const baseline=summary("BASELINE","Current Capacity", "BASELINE", baselineResult, scenarioSnapshot(capacityModel,null), baselineForecast, customForecast,"Current configured capacity and existing schedule; no what-if override.");
  const custom=summary("CUSTOM",manual.name?.trim()||"Custom What-if", "CUSTOM", customResult, scenarioSnapshot(capacityModel,manual), baselineForecast, customForecast,"User-entered resource outage / concurrency / manpower assumptions. Simulation only; no planning data is written.");
  const specs:Array<{code:string;name:string;options:FiniteCapacityOptions;scenario:CapacityScenarioOverride;rationale:string}>=[];
  const cfg=capacityModel.whatIfOptimizer;
  if(request.runOptimizer!==false&&cfg.enabled){
    if(cfg.tryCutoffExtension){
      for(const mins of cfg.cutoffExtensionsMinutes){const t=addMinutes(options.cutoffTime,mins);if(!t)continue;specs.push({code:`CUTOFF_PLUS_${mins}`,name:`Cutoff +${mins} min`,options:{...options,cutoffTime:t},scenario:mergeScenario(manual,{name:`Cutoff +${mins} min`}),rationale:`Extend the FINSST cutoff by ${mins} minutes while keeping the current what-if capacity assumptions.`});}
    }
    if(cfg.tryChemicalConcurrency&&cfg.chemicalConcurrencyBoost>0){
      const next=Math.min(16,capacityModel.chemicalLine.processMaxConcurrent+cfg.chemicalConcurrencyBoost);
      specs.push({code:"CHEM_PROCESS_BOOST",name:`Chemical Process Concurrent ${next}`,options,scenario:mergeScenario(manual,{name:`Chemical Process Concurrent ${next}`,chemicalProcessMaxConcurrent:next}),rationale:`Trial Chemical Line shared Process concurrency at ${next} instead of ${capacityModel.chemicalLine.processMaxConcurrent}; Flybar count and NDT spacing remain constrained.`});
    }
    const maskDef=capacityModel.resources[capacityModel.manualWork.maskingLaborResourceCode]||capacityModel.resourceList.find(x=>x.baseResourceCode===capacityModel.manualWork.maskingLaborResourceCode);
    if(cfg.tryMaskingLabor&&cfg.laborBoost>0&&maskDef){const next=maskDef.maxConcurrent+cfg.laborBoost;specs.push({code:"MASKING_LABOR_BOOST",name:`Masking Operators ${next}`,options,scenario:mergeScenario(manual,{name:`Masking Operators ${next}`,maskingOperators:next}),rationale:`Trial ${cfg.laborBoost} additional Masking operator(s) while preserving workstation and route prerequisite gates.`});}
    const unmaskDef=capacityModel.resources[capacityModel.manualWork.unmaskingLaborResourceCode]||capacityModel.resourceList.find(x=>x.baseResourceCode===capacityModel.manualWork.unmaskingLaborResourceCode);
    if(cfg.tryUnmaskingLabor&&cfg.laborBoost>0&&unmaskDef){const next=unmaskDef.maxConcurrent+cfg.laborBoost;specs.push({code:"UNMASKING_LABOR_BOOST",name:`Unmasking Operators ${next}`,options,scenario:mergeScenario(manual,{name:`Unmasking Operators ${next}`,unmaskingOperators:next}),rationale:`Trial ${cfg.laborBoost} additional Unmasking operator(s) while preserving workstation and downstream batch gates.`});}
  }
  const trials:WhatIfScenarioSummary[]=[];
  for(const spec of specs.slice(0,cfg.maxAutoTrials)){
    const r=await calculateFiniteCapacityTarget(spec.options,spec.scenario);
    trials.push(summary(fmtCode(spec.code),spec.name,"AUTO_TRIAL",r,scenarioSnapshot(capacityModel,spec.scenario),baselineForecast,customForecast,spec.rationale));
  }
  trials.sort((a,b)=>a.gapDm2-b.gapDm2||b.forecastSurfaceDm2-a.forecastSurfaceDm2||a.unscheduledBatchCount-b.unscheduledBatchCount||a.lateBatchCount-b.lateBatchCount);
  const best=[custom,...trials].sort((a,b)=>a.gapDm2-b.gapDm2||b.forecastSurfaceDm2-a.forecastSurfaceDm2||a.unscheduledBatchCount-b.unscheduledBatchCount||a.lateBatchCount-b.lateBatchCount)[0]||custom;
  const resources=capacityModel.resourceList.filter(x=>x.enabled).map(x=>({baseResourceCode:x.baseResourceCode,label:x.label,instances:capacityInstanceCodes(x),maxConcurrent:x.maxConcurrent}));
  const warnings:string[]=[];
  if(manual.disabledResourceInstances?.length)warnings.push("Disabled resources are represented as full-horizon outage blocks in the trial timeline.");
  warnings.push("All what-if and optimizer trials are simulation-only and do not create, split, move, or approve production batches.");
  return {baseline,custom,trials,best,resources,config:{enabled:cfg.enabled,maxAutoTrials:cfg.maxAutoTrials,cutoffExtensionsMinutes:cfg.cutoffExtensionsMinutes,chemicalConcurrencyBoost:cfg.chemicalConcurrencyBoost,laborBoost:cfg.laborBoost},warnings};
}
