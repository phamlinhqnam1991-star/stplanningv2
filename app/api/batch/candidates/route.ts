import { NextResponse } from "next/server";
import { getBatchModel } from "@/lib/batch-model";
import { loadCandidateRows } from "@/lib/candidate-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") || "").trim();
    const mainOperation = (url.searchParams.get("mainOperation") || "").trim();
    const eligibleOnly = url.searchParams.get("eligibleOnly") !== "false";
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const limit = Math.max(20, Math.min(500, Number(url.searchParams.get("limit") || 100)));
    const model = await getBatchModel();
    const scanLimit = Math.max(limit, Math.min(5000, Number(model.settings["batchModel.candidateScanLimit"] || 1000)));
    const all = await loadCandidateRows({ search, mainOperation: mainOperation || undefined, eligibleOnly, scanLimit });
    const rows = all.slice(offset, offset + limit);
    return NextResponse.json({
      total: all.length,
      scanned: Math.min(scanLimit, all.length || scanLimit),
      rows,
      limit,
      offset,
      summary: {
        total: all.length,
        eligible: all.filter((x) => x.batchProposal.eligible).length,
        totalQty: all.reduce((sum, x) => sum + (x.qty || 0), 0),
        totalSurface: all.reduce((sum, x) => sum + (x.surfaceDm2 || 0), 0),
        review: all.filter((x) => x.batchProposal.warnings.length > 0).length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Batch Candidates.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
