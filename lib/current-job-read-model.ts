/**
 * Canonical current-job read model.
 *
 * Active import views may contain duplicate Job Numbers. ERP tabs must resolve
 * the same current source row and the same current route, otherwise Planning,
 * Batch, Routing and Output can disagree about one Job. These static fragments
 * centralize that rule without adding a new database migration.
 */
export function currentPlanningJobsSource(alias = "p") {
  return `(
    SELECT DISTINCT ON (x._erp_job_key) x.*
    FROM (
      SELECT p0.*,
             COALESCE(NULLIF(BTRIM(p0.job_num),''),'#ROW:'||p0.id::text) AS _erp_job_key,
             count(*) OVER (
               PARTITION BY COALESCE(NULLIF(BTRIM(p0.job_num),''),'#ROW:'||p0.id::text)
             )::int AS current_job_duplicate_count
      FROM v_active_planning_jobs p0
    ) x
    ORDER BY x._erp_job_key, x.source_row_no DESC, x.id DESC
  ) ${alias}`;
}

export function currentJobRoutesSource(alias = "j") {
  return `(
    SELECT DISTINCT ON (x._erp_job_key) x.*
    FROM (
      SELECT j0.*,
             COALESCE(NULLIF(BTRIM(j0.job_num),''),'#ROW:'||j0.id::text) AS _erp_job_key,
             count(*) OVER (
               PARTITION BY COALESCE(NULLIF(BTRIM(j0.job_num),''),'#ROW:'||j0.id::text)
             )::int AS current_route_duplicate_count
      FROM v_active_job_routes j0
    ) x
    ORDER BY x._erp_job_key, x.source_row_no DESC, x.id DESC
  ) ${alias}`;
}

export const CURRENT_ROUTE_ORDER_SQL = "source_row_no DESC, id DESC";

export type ErpDataHealthMode = "NORMAL" | "DEGRADED_CONFIG" | "DATA_STALE";

export type ErpDataHealth = {
  mode: ErpDataHealthMode;
  warnings: string[];
};

export const NORMAL_DATA_HEALTH: ErpDataHealth = { mode: "NORMAL", warnings: [] };
