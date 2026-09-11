import { NextResponse } from "next/server";
import { calculateFiniteCapacityTarget } from "@/lib/finite-capacity-scheduler";
import { getStOutputModel } from "@/lib/st-output-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayInOffset(offsetMinutes: number): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString().slice(0,10);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const model = await getStOutputModel();
    const targetDate = (url.searchParams.get("targetDate") || todayInOffset(model.timezoneOffsetMinutes)).trim();
    const cutoffTime = (url.searchParams.get("cutoffTime") || model.defaultCutoffTime).trim();
    const targetValue = Math.max(0, Number(url.searchParams.get("targetValue") || model.defaultTargetValue) || 0);
    const result = await calculateFiniteCapacityTarget({ targetDate, cutoffTime, targetValue });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run finite-capacity ST Output simulation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
