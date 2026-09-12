import { NextResponse } from "next/server";
import { calculateWhatIfOptimizer, type WhatIfScenarioRequest } from "@/lib/what-if-optimizer";
import { getStOutputModel } from "@/lib/st-output-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayInOffset(offsetMinutes:number):string{return new Date(Date.now()+offsetMinutes*60_000).toISOString().slice(0,10);}

export async function POST(request:Request){
  try{
    const body=(await request.json()) as Partial<WhatIfScenarioRequest>;
    const model=await getStOutputModel();
    const targetDate=String(body.targetDate||todayInOffset(model.timezoneOffsetMinutes)).trim();
    const cutoffTime=String(body.cutoffTime||model.defaultCutoffTime).trim();
    const targetValue=Math.max(0,Number(body.targetValue??model.defaultTargetValue)||0);
    const result=await calculateWhatIfOptimizer({targetDate,cutoffTime,targetValue,scenario:body.scenario||null,runOptimizer:body.runOptimizer!==false});
    return NextResponse.json(result);
  }catch(error){
    const message=error instanceof Error?error.message:"Unable to run ST Output what-if optimizer.";
    return NextResponse.json({error:message},{status:500});
  }
}
