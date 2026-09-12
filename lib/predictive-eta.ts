import { query } from "@/lib/db";

export type EtaConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";
export type PredictiveEtaStat = {
  mainOperationCode: string;
  recipeNo: string | null;
  sampleCount: number;
  p50Minutes: number;
  p80Minutes: number;
  avgMinutes: number;
  minMinutes: number;
  maxMinutes: number;
};
export type PredictiveEtaModel = {
  enabled: boolean;
  lookbackDays: number;
  minSamples: number;
  blendPct: number;
  p80RiskAlert: boolean;
  p80BlocksForecast: boolean;
  statsByKey: Map<string, PredictiveEtaStat>;
  fallbackByMain: Map<string, PredictiveEtaStat>;
};
export type PredictiveEtaSuggestion = {
  sampleCount: number;
  p50Minutes: number | null;
  p80Minutes: number | null;
  configuredMinutes: number | null;
  forecastMinutes: number | null;
  confidence: EtaConfidence;
  basis: string;
};

const key = (v: unknown) => String(v ?? "").trim().toUpperCase();
const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v: unknown, fallback: boolean) =>
  typeof v === "boolean" ? v : fallback;

/** Stable pseudo-main key used for inspection history. */
export function predictiveInspectionKey(operationCode: string | null | undefined) {
  return `INSPECTION:${key(operationCode)}`;
}

export async function getPredictiveEtaModel(): Promise<PredictiveEtaModel> {
  const settingsResult = await query<{ settings: Record<string, unknown> }>(
    `SELECT COALESCE(jsonb_object_agg(setting_key,value_json),'{}'::jsonb) AS settings
       FROM config_settings
      WHERE enabled=true AND category='PREDICTIVE_ETA'`,
  );
  const settings = settingsResult.rows[0]?.settings || {};
  const enabled = bool(settings["predictiveEta.enabled"], true);
  const lookbackDays = Math.max(
    7,
    Math.min(730, num(settings["predictiveEta.lookbackDays"], 180)),
  );
  const minSamples = Math.max(
    2,
    Math.min(100, num(settings["predictiveEta.minSamples"], 5)),
  );
  const blendPct = Math.max(
    0,
    Math.min(100, num(settings["predictiveEta.blendPct"], 50)),
  );
  const p80RiskAlert = bool(settings["predictiveEta.p80RiskAlert"], true);
  const p80BlocksForecast = bool(
    settings["predictiveEta.p80BlocksForecast"],
    false,
  );
  const statsByKey = new Map<string, PredictiveEtaStat>();
  const fallbackByMain = new Map<string, PredictiveEtaStat>();

  if (!enabled) {
    return {
      enabled,
      lookbackDays,
      minSamples,
      blendPct,
      p80RiskAlert,
      p80BlocksForecast,
      statsByKey,
      fallbackByMain,
    };
  }

  // One historical model covers both production operations and inspections.
  // Inspection history is keyed by INSPECTION:<operation code> and therefore
  // never contaminates a production Main Operation duration distribution.
  const rows = await query(
    `WITH hist AS (
       SELECT upper(btrim(e.main_operation_code)) AS main_operation_code,
              NULLIF(upper(btrim(COALESCE(b.recipe_no,''))),'') AS recipe_no,
              GREATEST(0.1,EXTRACT(EPOCH FROM (e.actual_end-e.actual_start))/60.0) AS minutes
         FROM erp_job_operation_execution e
         LEFT JOIN planning_batches b ON b.id=e.batch_id
        WHERE e.state='DONE'
          AND e.actual_start IS NOT NULL
          AND e.actual_end IS NOT NULL
          AND e.actual_end>=now()-($1::int||' days')::interval
          AND e.actual_end>=e.actual_start
       UNION ALL
       SELECT 'INSPECTION:'||upper(btrim(i.operation_code)) AS main_operation_code,
              NULL::text AS recipe_no,
              GREATEST(0.1,EXTRACT(EPOCH FROM (i.actual_end-i.actual_start))/60.0) AS minutes
         FROM erp_inspection_events i
        WHERE i.status IN ('PASSED','FAILED','SKIPPED')
          AND i.actual_start IS NOT NULL
          AND i.actual_end IS NOT NULL
          AND i.actual_end>=now()-($1::int||' days')::interval
          AND i.actual_end>=i.actual_start
     ), grouped AS (
       SELECT main_operation_code,recipe_no,count(*)::int AS sample_count,
              percentile_cont(0.50) WITHIN GROUP(ORDER BY minutes)::numeric AS p50_minutes,
              percentile_cont(0.80) WITHIN GROUP(ORDER BY minutes)::numeric AS p80_minutes,
              avg(minutes)::numeric AS avg_minutes,
              min(minutes)::numeric AS min_minutes,
              max(minutes)::numeric AS max_minutes,
              0 AS fallback
         FROM hist
        GROUP BY main_operation_code,recipe_no
       UNION ALL
       SELECT main_operation_code,NULL::text AS recipe_no,count(*)::int,
              percentile_cont(0.50) WITHIN GROUP(ORDER BY minutes)::numeric,
              percentile_cont(0.80) WITHIN GROUP(ORDER BY minutes)::numeric,
              avg(minutes)::numeric,min(minutes)::numeric,max(minutes)::numeric,
              1 AS fallback
         FROM hist
        GROUP BY main_operation_code
     )
     SELECT * FROM grouped
      ORDER BY main_operation_code,fallback,recipe_no NULLS LAST`,
    [lookbackDays],
  );

  for (const raw of rows.rows as Record<string, unknown>[]) {
    const stat: PredictiveEtaStat = {
      mainOperationCode: String(raw.main_operation_code || ""),
      recipeNo: raw.recipe_no == null ? null : String(raw.recipe_no),
      sampleCount: Number(raw.sample_count || 0),
      p50Minutes: Number(raw.p50_minutes || 0),
      p80Minutes: Number(raw.p80_minutes || 0),
      avgMinutes: Number(raw.avg_minutes || 0),
      minMinutes: Number(raw.min_minutes || 0),
      maxMinutes: Number(raw.max_minutes || 0),
    };
    if (Number(raw.fallback || 0) === 1) {
      fallbackByMain.set(key(stat.mainOperationCode), stat);
    } else {
      statsByKey.set(
        `${key(stat.mainOperationCode)}|${key(stat.recipeNo)}`,
        stat,
      );
    }
  }

  return {
    enabled,
    lookbackDays,
    minSamples,
    blendPct,
    p80RiskAlert,
    p80BlocksForecast,
    statsByKey,
    fallbackByMain,
  };
}

function confidence(sampleCount: number, minSamples: number): EtaConfidence {
  if (sampleCount >= Math.max(20, minSamples * 4)) return "HIGH";
  if (sampleCount >= Math.max(10, minSamples * 2)) return "MEDIUM";
  if (sampleCount >= minSamples) return "LOW";
  return "NONE";
}

export function suggestPredictiveEta(
  model: PredictiveEtaModel,
  mainOperationCode: string | null | undefined,
  recipeNo: string | null | undefined,
  configuredMinutes: number | null,
): PredictiveEtaSuggestion {
  const main = key(mainOperationCode);
  if (!model.enabled || !main) {
    return {
      sampleCount: 0,
      p50Minutes: null,
      p80Minutes: null,
      configuredMinutes,
      forecastMinutes: configuredMinutes,
      confidence: "NONE",
      basis: configuredMinutes == null ? "NO_ETA" : "CONFIG_ONLY",
    };
  }

  const specific = model.statsByKey.get(`${main}|${key(recipeNo)}`);
  const fallback = model.fallbackByMain.get(main);
  const stat =
    specific && specific.sampleCount >= model.minSamples
      ? specific
      : fallback && fallback.sampleCount >= model.minSamples
        ? fallback
        : null;

  if (!stat) {
    return {
      sampleCount: specific?.sampleCount || fallback?.sampleCount || 0,
      p50Minutes: specific?.p50Minutes ?? fallback?.p50Minutes ?? null,
      p80Minutes: specific?.p80Minutes ?? fallback?.p80Minutes ?? null,
      configuredMinutes,
      forecastMinutes: configuredMinutes,
      confidence: "NONE",
      basis:
        configuredMinutes == null
          ? "INSUFFICIENT_HISTORY_NO_CONFIG"
          : "INSUFFICIENT_HISTORY_CONFIG_ONLY",
    };
  }

  const blend = model.blendPct / 100;
  const forecast =
    configuredMinutes == null
      ? stat.p50Minutes
      : configuredMinutes * (1 - blend) + stat.p50Minutes * blend;

  return {
    sampleCount: stat.sampleCount,
    p50Minutes: Math.round(stat.p50Minutes * 10) / 10,
    p80Minutes: Math.round(stat.p80Minutes * 10) / 10,
    configuredMinutes,
    forecastMinutes: Math.max(1, Math.round(forecast)),
    confidence: confidence(stat.sampleCount, model.minSamples),
    basis:
      configuredMinutes == null
        ? "ACTUAL_HISTORY_P50"
        : specific === stat
          ? `CONFIG_P50_BLEND_RECIPE_${model.blendPct}`
          : `CONFIG_P50_BLEND_MAIN_${model.blendPct}`,
  };
}
