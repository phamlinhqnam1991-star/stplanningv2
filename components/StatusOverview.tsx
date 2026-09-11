"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";

type ImportRow = {
  id: string;
  source_filename: string;
  imported_at: string;
  completed_at: string | null;
  status: string;
  is_active: boolean;
  planning_row_count: number | null;
  scheduling_row_count: number | null;
  planning_column_count: number | null;
  scheduling_column_count: number | null;
  error_message: string | null;
};

type RouteImportRow = {
  id: string;
  source_filename: string;
  sheet_name: string;
  imported_at: string;
  completed_at: string | null;
  status: string;
  is_active: boolean;
  route_row_count: number | null;
  route_column_count: number | null;
  error_message: string | null;
};

export function StatusOverview() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [routeRows, setRouteRows] = useState<RouteImportRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiJson<{ imports: ImportRow[] }>("/api/import/status", { cache: "no-store" }),
      apiJson<{ imports: RouteImportRow[] }>("/api/routing-import/status", { cache: "no-store" }),
    ])
      .then(([st, route]) => { setRows(st.imports); setRouteRows(route.imports); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const active = rows.find((r) => r.is_active);
  const activeRoute = routeRows.find((r) => r.is_active);
  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card"><span>ST DATASET</span><strong>{active ? "READY" : "NONE"}</strong><small>{active?.source_filename ?? "Import the ST workbook"}</small></div>
        <div className="kpi-card"><span>PLANNING SOURCE</span><strong>{active?.planning_row_count ?? 0}</strong><small>{active?.planning_column_count ?? 0} source columns</small></div>
        <div className="kpi-card"><span>SCHEDULING SOURCE</span><strong>{active?.scheduling_row_count ?? 0}</strong><small>{active?.scheduling_column_count ?? 0} source columns</small></div>
        <div className="kpi-card route-kpi"><span>JOB ROUTING SOURCE</span><strong>{activeRoute ? Math.max(0, (activeRoute.route_row_count ?? 1) - 1).toLocaleString() : 0}</strong><small>{activeRoute ? `${activeRoute.route_column_count ?? 0} columns · 36 route slots` : "Import All Open Jobs"}</small></div>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">SOURCE STATUS</span><h2>Active Data Sources</h2></div></div>
        <div className="table-wrap">
          <table className="erp-table">
            <thead><tr><th>Source</th><th>Status</th><th>File</th><th>Imported</th><th>Shape</th></tr></thead>
            <tbody>
              <tr><td>ST Planning Workbook</td><td><span className={`badge ${(active?.status ?? "neutral").toLowerCase()}`}>{active ? "ACTIVE" : "NONE"}</span></td><td>{active?.source_filename ?? "—"}</td><td>{active ? new Date(active.imported_at).toLocaleString() : "—"}</td><td>{active ? `${active.planning_row_count}×${active.planning_column_count} + ${active.scheduling_row_count}×${active.scheduling_column_count}` : "—"}</td></tr>
              <tr><td>All Open Jobs Routing</td><td><span className={`badge ${activeRoute ? "completed" : "neutral"}`}>{activeRoute ? "ACTIVE" : "NONE"}</span></td><td>{activeRoute?.source_filename ?? "—"}</td><td>{activeRoute ? new Date(activeRoute.imported_at).toLocaleString() : "—"}</td><td>{activeRoute ? `${activeRoute.route_row_count}×${activeRoute.route_column_count}` : "—"}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
