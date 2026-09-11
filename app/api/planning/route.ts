import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { analyzeRoute, type RouteOperationForAnalysis } from "@/lib/route-analysis";
import { getConfigBootstrap, numberSetting, routeConfigOptionsFromSettings, sourceDisplayColumns } from "@/lib/config";
import { classifyOperationRoute, getPlanningModel } from "@/lib/planning-model";
import { getRecipeModel, resolveProcessTime, resolveRecipe } from "@/lib/recipe-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sortMap: Record<string, string> = {
  row: "p.source_row_no",
  program: "p.program",
  part: "p.epicor_part",
  job: "p.job_num",
  nextOperation: "p.next_operation",
  prodQty: "p.prod_qty",
  goodWip: "p.current_good_wip_qty",
  surface: "p.surface_dm2",
};

function addLike(params: unknown[], value: string) {
  params.push(`%${value}%`);
  return `$${params.length}`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const bootstrap = await getConfigBootstrap();
    const routeOptions = routeConfigOptionsFromSettings(bootstrap.settings);
    const planningModel = await getPlanningModel();
    const recipeModel = await getRecipeModel();
    const planningProfile = bootstrap.sources.PLANNING;
    const planningSheetName = planningProfile.sheetName || planningProfile.displayName;
    const display = sourceDisplayColumns(planningProfile);
    const col = (key: string, fallback: string) => display[key] || fallback;
    const rawExpr = (column: string) => `rr.row_data->'${column}'->>'v'`;
    const revisionExpr = rawExpr(col("revisionNum", "CG"));
    const priorityTypeExpr = rawExpr(col("priorityType", "CM"));
    const catTransitExpr = rawExpr(col("catTransit", "CN"));
    const impactSaleExpr = rawExpr(col("impactSaleValue", "CO"));
    const defaultPageSize = numberSetting(bootstrap.settings, "ui.defaultPageSize", 100, 20, 1000);
    const maxPageSize = numberSetting(bootstrap.settings, "ui.maxPageSize", 500, 20, 1000);
    const limit = Math.min(maxPageSize, Math.max(20, Number(url.searchParams.get("limit") || defaultPageSize)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const search = (url.searchParams.get("search") || "").trim();
    const program = (url.searchParams.get("program") || "").trim();
    const nextOperation = (url.searchParams.get("nextOperation") || "").trim();
    const operation = (url.searchParams.get("operation") || "").trim();
    const priority = (url.searchParams.get("priority") || "").trim();
    const sort = url.searchParams.get("sort") || "row";
    const direction = url.searchParams.get("direction") === "desc" ? "DESC" : "ASC";
    const sortSql = sort === "revision" ? revisionExpr : sort === "priority" ? priorityTypeExpr : (sortMap[sort] || sortMap.row);

    const params: unknown[] = [planningSheetName];
    const where: string[] = [];

    if (search) {
      const p = addLike(params, search);
      where.push(`(
        p.job_num ILIKE ${p} OR p.epicor_part ILIKE ${p} OR p.program ILIKE ${p}
        OR p.part_description ILIKE ${p} OR p.next_operation ILIKE ${p}
        OR COALESCE(${priorityTypeExpr},'') ILIKE ${p}
        OR COALESCE(${catTransitExpr},'') ILIKE ${p}
        OR COALESCE(${impactSaleExpr},'') ILIKE ${p}
      )`);
    }
    if (program) {
      params.push(program);
      where.push(`p.program = $${params.length}`);
    }
    if (nextOperation) {
      params.push(nextOperation);
      where.push(`p.next_operation = $${params.length}`);
    }
    if (operation) {
      params.push(operation);
      where.push(`EXISTS (
        SELECT 1 FROM planning_job_operations fo
        WHERE fo.planning_job_id = p.id AND fo.operation_code = $${params.length}
      )`);
    }
    if (priority) {
      const p = addLike(params, priority);
      where.push(`(
        COALESCE(${priorityTypeExpr},'') ILIKE ${p}
        OR COALESCE(${catTransitExpr},'') ILIKE ${p}
        OR COALESCE(${impactSaleExpr},'') ILIKE ${p}
      )`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const fromSql = `
      FROM v_active_planning_jobs p
      LEFT JOIN raw_sheet_rows rr
        ON rr.import_id = p.import_id
       AND rr.sheet_name = $1
       AND rr.source_row_no = p.source_row_no`;

    const summary = await query<{
      total: number;
      total_qty: string | null;
      total_surface: string | null;
      programs: number;
      priority_rows: number;
    }>(
      `SELECT count(*)::int AS total,
              COALESCE(sum(p.prod_qty),0)::text AS total_qty,
              COALESCE(sum(p.surface_dm2),0)::text AS total_surface,
              count(DISTINCT p.program)::int AS programs,
              count(*) FILTER (WHERE
                NULLIF(${priorityTypeExpr},'') IS NOT NULL OR
                NULLIF(${catTransitExpr},'') IS NOT NULL OR
                NULLIF(${impactSaleExpr},'') IS NOT NULL
              )::int AS priority_rows
       ${fromSql}
       ${whereSql}`,
      params
    );

    const rowParams = [...params, limit, offset];
    const limitParam = `$${rowParams.length - 1}`;
    const offsetParam = `$${rowParams.length}`;
    const rows = await query(
      `SELECT p.id, p.source_row_no, p.program, p.part_cluster, p.epicor_part,
              p.surface_dm2, p.part_description, p.job_num, p.last_labor_op,
              p.next_operation, p.last_labor_qty, p.prod_qty, p.current_good_wip_qty,
              p.st_source_value, p.st_wip_area, p.wip_sequence, p.all_operation,
              ${rawExpr(col("alloy", "CD"))} AS alloy,
              ${rawExpr(col("temper", "CE"))} AS temper,
              ${revisionExpr} AS revision_num,
              ${priorityTypeExpr} AS priority_type,
              ${catTransitExpr} AS cat_transit,
              ${impactSaleExpr} AS impact_sale_value,
              rr.row_data AS raw_row_data,
              COALESCE(op.operation_count,0)::int AS operation_count,
              COALESCE(op.operations,'[]'::jsonb) AS operations,
              route.route_id, route.route_next_operation, route.route_operation_count,
              COALESCE(route.route_operations,'[]'::jsonb) AS route_operations
       ${fromSql}
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS operation_count,
                jsonb_agg(
                  jsonb_build_object(
                    'code', o.operation_code,
                    'value', o.source_value,
                    'order', o.operation_order,
                    'sourceColumn', o.source_excel_column
                  ) ORDER BY o.operation_order
                ) AS operations
         FROM planning_job_operations o
         WHERE o.planning_job_id = p.id
       ) op ON true
       LEFT JOIN LATERAL (
         SELECT jr.id AS route_id,
                jr.next_operation AS route_next_operation,
                jr.operation_count AS route_operation_count,
                COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'position', ro.operation_position,
                      'code', ro.operation_code,
                      'sequence', ro.operation_seq,
                      'complete', ro.is_complete,
                      'openNonconformance', ro.open_nonconformance,
                      'sourceText', ro.source_operation_text
                    ) ORDER BY ro.operation_position
                  )
                  FROM v_active_job_operation_sequence ro
                  WHERE ro.job_route_id=jr.id
                ), '[]'::jsonb) AS route_operations
         FROM v_active_job_routes jr
         WHERE jr.job_num=p.job_num
         ORDER BY jr.source_row_no
         LIMIT 1
       ) route ON true
       ${whereSql}
       ORDER BY ${sortSql} ${direction} NULLS LAST, p.source_row_no ASC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      rowParams
    );

    const analyzedRows = rows.rows.map((row: Record<string, unknown>) => {
      const routeOperations = (row.route_operations || []) as RouteOperationForAnalysis[];
      const routeAnalysis = row.route_id
        ? analyzeRoute(routeOperations, (row.route_next_operation as string | null) || (row.next_operation as string | null), row.all_operation as string | null, routeOptions)
        : null;
      const planningClassification = routeAnalysis
        ? classifyOperationRoute(routeAnalysis.remainingStRoute.map((op) => op.code), planningModel)
        : null;
      const remainingMainOperations = planningClassification?.remainingMainOperations.map((main) => ({
        code: main.code,
        label: main.label,
        sourceOperation: planningClassification.steps.find((step) => step.mainOperationCode === main.code)?.sourceOperation || "",
      })) || [];
      const nextMain = planningClassification?.nextMainOperation || null;
      const nextPlanning = planningClassification?.nextPlanningOperation || null;
      const nextPlanningSourceOperation = nextPlanning
        ? planningClassification?.steps.find((step) => step.planningEnabled && step.mainOperationCode === nextPlanning.code)?.sourceOperation || routeAnalysis?.nextStOperation || null
        : routeAnalysis?.nextStOperation || null;
      const recipeSuggestion = resolveRecipe(nextPlanning?.code || null, row.raw_row_data, recipeModel);
      const processTimeSuggestion = resolveProcessTime(nextPlanning?.code || null, row.raw_row_data, recipeSuggestion, recipeModel, {
        operationCode: nextPlanningSourceOperation,
        qty: row.prod_qty == null ? null : Number(row.prod_qty),
        surfaceDm2: row.surface_dm2 == null ? null : Number(row.surface_dm2),
      });
      const { raw_row_data: _rawRowData, ...publicRow } = row;
      return {
        ...publicRow,
        routeAnalysis,
        planningClassification,
        nextMainOperation: nextMain ? { code: nextMain.code, label: nextMain.label } : null,
        nextPlanningOperation: nextPlanning,
        remainingMainOperations,
        remainingPlanningOperations: planningClassification?.remainingPlanningOperations || [],
        unmappedStOperations: planningClassification?.unmappedOperations || [],
        recipeSuggestion,
        processTimeSuggestion,
      };
    });

    const s = summary.rows[0] || { total: 0, total_qty: "0", total_surface: "0", programs: 0, priority_rows: 0 };
    return NextResponse.json({
      total: s.total,
      rows: analyzedRows,
      limit,
      offset,
      summary: {
        total: s.total,
        totalQty: Number(s.total_qty || 0),
        totalSurface: Number(s.total_surface || 0),
        programs: s.programs,
        priorityRows: s.priority_rows,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Planning data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
