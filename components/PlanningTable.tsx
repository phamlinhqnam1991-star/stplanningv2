"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";

type PlanningRow = {
  id: string;
  source_row_no: number;
  program: string | null;
  part_cluster: string | null;
  epicor_part: string | null;
  surface_dm2: string | number | null;
  part_description: string | null;
  job_num: string | null;
  last_labor_op: string | null;
  next_operation: string | null;
  last_labor_qty: string | number | null;
  prod_qty: string | number | null;
  current_good_wip_qty: string | number | null;
  st_source_value: string | null;
  st_wip_area: string | null;
  wip_sequence: string | null;
  operation_count?: number;
};

export function PlanningTable() {
  const [rows, setRows] = useState<PlanningRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const limit = 100;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<{ total: number; rows: PlanningRow[] }>(`/api/planning?limit=${limit}&offset=${offset}&search=${encodeURIComponent(queryText)}`, { cache: "no-store" });
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [offset, queryText]);

  useEffect(() => { load(); }, [load]);

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    setQueryText(search.trim());
  }

  return (
    <section className="panel data-panel">
      <div className="data-toolbar">
        <form onSubmit={applySearch} className="search-box">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Job, Part, Program, Next Operation…" />
          <button className="button" type="submit">Search</button>
        </form>
        <div className="record-count"><strong>{total.toLocaleString()}</strong><span>normalized planning rows</span></div>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      <div className="table-wrap tall">
        <table className="erp-table compact">
          <thead><tr><th>Row</th><th>Program</th><th>Part</th><th>Job</th><th>Next Op</th><th>Last Op</th><th>Prod Qty</th><th>Good WIP</th><th>Surface dm²</th><th>ST Area</th><th>WIP Seq.</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={11} className="loading-cell">Loading Planning data…</td></tr> : rows.map((r) => <tr key={r.id}>
              <td className="mono">{r.source_row_no}</td><td>{r.program}</td><td><strong>{r.epicor_part}</strong></td><td className="mono">{r.job_num}</td><td><span className="op-chip">{r.next_operation || "—"}</span></td><td>{r.last_labor_op}</td><td className="num">{r.prod_qty ?? "—"}</td><td className="num">{r.current_good_wip_qty ?? "—"}</td><td className="num">{r.surface_dm2 ?? "—"}</td><td>{r.st_wip_area}</td><td>{r.wip_sequence}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="pager"><button className="button" disabled={offset===0 || loading} onClick={() => setOffset(Math.max(0, offset-limit))}>Previous</button><span>{total ? `${offset+1}–${Math.min(offset+limit,total)} of ${total}` : "0 rows"}</span><button className="button" disabled={offset+limit>=total || loading} onClick={() => setOffset(offset+limit)}>Next</button></div>
    </section>
  );
}
