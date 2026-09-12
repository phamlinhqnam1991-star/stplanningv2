import { NextResponse } from "next/server";
import { getPredictiveEtaModel } from "@/lib/predictive-eta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const model = await getPredictiveEtaModel();
    return NextResponse.json({
      enabled: model.enabled,
      lookbackDays: model.lookbackDays,
      minSamples: model.minSamples,
      blendPct: model.blendPct,
      p80RiskAlert: model.p80RiskAlert,
      p80BlocksForecast: model.p80BlocksForecast,
      operationStats: [...model.statsByKey.values()].sort(
        (a, b) =>
          a.mainOperationCode.localeCompare(b.mainOperationCode) ||
          String(a.recipeNo || "").localeCompare(String(b.recipeNo || "")),
      ),
      fallbackStats: [...model.fallbackByMain.values()].sort((a, b) =>
        a.mainOperationCode.localeCompare(b.mainOperationCode),
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Predictive ETA model." },
      { status: 500 },
    );
  }
}
