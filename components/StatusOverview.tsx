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

export function StatusOverview() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiJson<{ imports: ImportRow[] }>("/api/import/status", { cache: "no-store" })
      .then((r) => setRows(r.imports))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const active = rows.find((r) => r.is_active);
  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card"><span>ACTIVE DATASET</span><strong>{active ? "READY" : "NONE"}</strong><small>{active?.source_filename ?? "Import a workbook to begin"}</small></div>
        <div className="kpi-card"><span>PLANNING SOURCE</span><strong>{active?.planning_row_count ?? 0}</strong><small>{active?.planning_column_count ?? 0} source columns</small></div>
        <div className="kpi-card"><span>SCHEDULING SOURCE</span><strong>{active?.scheduling_row_count ?? 0}</strong><small>{active?.scheduling_column_count ?? 0} source columns</small></div>
        <div className="kpi-card"><span>DATA POLICY</span><strong>1:1 RAW</strong><small>No source rows or columns dropped</small></div>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">IMPORT HISTORY</span><h2>Latest Workbook Snapshots</h2></div></div>
        {rows.length ? (
          <div className="table-wrap">
            <table className="erp-table">
              <thead><tr><th>Status</th><th>File</th><th>Imported</th><th>Planning</th><th>Scheduling</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.id}>
                <td><span className={`badge ${r.status.toLowerCase()}`}>{r.is_active ? "ACTIVE" : r.status}</span></td>
                <td>{r.source_filename}</td>
                <td>{new Date(r.imported_at).toLocaleString()}</td>
                <td>{r.planning_row_count ?? "—"} × {r.planning_column_count ?? "—"}</td>
                <td>{r.scheduling_row_count ?? "—"} × {r.scheduling_column_count ?? "—"}</td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <div className="empty-state">No import history is available.</div>}
      </section>
    </>
  );
}
