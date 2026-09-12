import { NextResponse } from "next/server";
import { buildErpControlTower } from "@/lib/erp-exception-center";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request){try{const u=new URL(request.url);return NextResponse.json(await buildErpControlTower((u.searchParams.get("targetDate")||"").trim()||undefined));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to build ERP Control Tower."},{status:500});}}
