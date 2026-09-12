import { NextResponse } from "next/server";
import { z } from "zod";
import {
  acceptProposedPlan,
  createProposedPlan,
  getProposedPlans,
  revalidateProposedPlan,
  setProposedBatchSelection,
} from "@/lib/proposed-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scenarioSchema = z
  .object({
    name: z.string().max(200).optional(),
    disabledResourceInstances: z.array(z.string()).optional(),
    resourceMaxConcurrent: z.record(z.string(), z.number()).optional(),
    includeExistingSchedule: z.boolean().optional(),
    chemicalProcessMaxConcurrent: z.number().int().positive().optional().nullable(),
    maskingOperators: z.number().int().positive().optional().nullable(),
    unmaskingOperators: z.number().int().positive().optional().nullable(),
  })
  .passthrough();
const createSchema = z.object({
  action: z.literal("CREATE"),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cutoffTime: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/),
  targetValue: z.number().nonnegative(),
  scenarioName: z.string().max(200).optional(),
  scenario: scenarioSchema.nullable().optional(),
});
const idSchema = z.object({
  action: z.enum(["REVALIDATE", "ACCEPT"]),
  proposalId: z.number().int().positive(),
  selectedOnly: z.boolean().optional(),
  mode: z.enum(["ALL", "SELECTED"]).optional(),
  actor: z.string().max(120).optional(),
});
const selectionSchema = z.object({
  action: z.literal("SET_SELECTION"),
  proposalId: z.number().int().positive(),
  selectedBatchIds: z.array(z.number().int().positive()).max(1000),
  actor: z.string().max(120).optional(),
});

export async function GET(request: Request) {
  try {
    const u = new URL(request.url);
    const limit = Math.max(1, Math.min(100, Number(u.searchParams.get("limit") || 30)));
    return NextResponse.json(await getProposedPlans(limit));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Proposed Plans." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    if (raw?.action === "CREATE") {
      const x = createSchema.parse(raw);
      return NextResponse.json({ ok: true, ...(await createProposedPlan(x)) });
    }
    if (raw?.action === "SET_SELECTION") {
      const x = selectionSchema.parse(raw);
      return NextResponse.json(
        await setProposedBatchSelection(
          x.proposalId,
          x.selectedBatchIds,
          x.actor || "PUBLIC_UI",
        ),
      );
    }
    const x = idSchema.parse(raw);
    if (x.action === "REVALIDATE") {
      return NextResponse.json({
        ok: true,
        ...(await revalidateProposedPlan(x.proposalId, Boolean(x.selectedOnly))),
      });
    }
    return NextResponse.json(
      await acceptProposedPlan(
        x.proposalId,
        x.actor || "PUBLIC_UI",
        x.mode || "ALL",
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proposal operation failed.";
    return NextResponse.json(
      { error: message },
      { status: /conflict|stale|overlap|already|changed/i.test(message) ? 409 : 400 },
    );
  }
}
