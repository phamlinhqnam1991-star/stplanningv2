import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { calculateStOutputTarget } from "@/lib/st-output-engine";
import { getStOutputModel } from "@/lib/st-output-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saveSchema = z.object({
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cutoffTime: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/),
  targetValue: z.number().nonnegative(),
  metricCode: z.string().min(1).max(80).default("SURFACE_DM2"),
  status: z.string().min(1).max(40).default("ACTIVE"),
  notes: z.string().max(4000).nullable().optional(),
});

function todayInOffset(offsetMinutes: number): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString().slice(0,10);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const model = await getStOutputModel();
    const targetDate = (url.searchParams.get("targetDate") || todayInOffset(model.timezoneOffsetMinutes)).trim();
    const saved = await query(`SELECT id,target_date,cutoff_time,metric_code,target_value,status,notes,updated_at FROM st_output_targets WHERE target_date=$1::date AND metric_code=$2 LIMIT 1`, [targetDate, model.metricCode]);
    const savedRow = saved.rows[0] as Record<string, unknown> | undefined;
    const cutoffTime = (url.searchParams.get("cutoffTime") || (savedRow?.cutoff_time ? String(savedRow.cutoff_time).slice(0,5) : model.defaultCutoffTime)).trim();
    const targetParam = url.searchParams.get("targetValue");
    const targetValue = targetParam != null && targetParam !== "" ? Math.max(0, Number(targetParam) || 0) : Math.max(0, Number(savedRow?.target_value ?? model.defaultTargetValue));
    const search = (url.searchParams.get("search") || "").trim();
    const status = (url.searchParams.get("status") || "").trim();
    const result = await calculateStOutputTarget({ targetDate, cutoffTime, targetValue, search, status });
    const rowLimit = Math.max(50, Math.min(1000, Number(url.searchParams.get("rowLimit") || 500)));
    const rowTotal = result.rows.length;
    const recent = await query(`SELECT id,target_date,cutoff_time,metric_code,target_value,status,notes,updated_at FROM st_output_targets ORDER BY target_date DESC,updated_at DESC LIMIT 30`);
    return NextResponse.json({ ...result, rows: result.rows.slice(0, rowLimit), rowTotal, savedTarget: savedRow || null, recentTargets: recent.rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to calculate ST Output Target.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const x = saveSchema.parse(raw);
    const result = await query(`
      INSERT INTO st_output_targets (target_date,cutoff_time,metric_code,target_value,status,notes)
      VALUES ($1::date,$2::time,$3,$4,$5,$6)
      ON CONFLICT (target_date,metric_code) DO UPDATE SET
        cutoff_time=EXCLUDED.cutoff_time,target_value=EXCLUDED.target_value,status=EXCLUDED.status,notes=EXCLUDED.notes,updated_at=now()
      RETURNING id,target_date,cutoff_time,metric_code,target_value,status,notes,updated_at`,
      [x.targetDate,x.cutoffTime,x.metricCode,x.targetValue,x.status,x.notes??null]);
    return NextResponse.json({ ok:true, target:result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save ST Output Target.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
