import { NextResponse } from "next/server";
import { getConfigBootstrap } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getConfigBootstrap());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load configuration.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
