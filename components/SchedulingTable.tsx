"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";

type Resource = { resourceCode: string; batchRef: string; sourceColumn: string };
type ScheduleRow = {
  id: string;
  source_row_no: number;
  schedule_date: string | null;
  day_label: string | null;
  slot_no: number | null;
  batch_ref: string | null;
  recipe_no: string | null;
  recipe_description: string | null;
  job_count: number | null;
  pcs: string | number | null;
  surface_dm2: string | number | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: string | number | null;
  status: string | null;
  comments: string | null;
  resources: Resource[];
};

export function SchedulingTable() {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
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
      const data = await apiJson<{ total: number; rows: ScheduleRow[] }>(`/api/scheduling?limit=${limit}&offset=${offset}&search=${encodeURIComponent(queryText)}`, { cache: "no-store" });
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
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Batch, Recipe, Description, Status…" />
          <button className="button" type="submit">Search</button>
        </form>
        <div className="record-count"><strong>{total.toLocaleString()}</strong><span>normalized schedule rows</span></div>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      <div className="table-wrap tall">
        <table className="erp-table compact">
          <thead><tr><th>Row</th><th>Date</th><th>Slot</th><th>Resource Assignment</th><th>Batch</th><th>Recipe</th><th>Jobs</th><th>pcs</th><th>dm²</th><th>Start</th><th>End</th><th>Duration</th><th>Status</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={13} className="loading-cell">Loading Scheduling data…</td></tr> : rows.map((r) => <tr key={r.id}>
              <td className="mono">{r.source_row_no}</td>
              <td>{r.schedule_date || "—"}<small className="subcell">{r.day_label}</small></td>
              <td className="num">{r.slot_no ?? "—"}</td>
              <td><div className="resource-list">{r.resources?.length ? r.resources.map((x, i) => <span className="resource-chip" key={`${x.resourceCode}-${i}`}>{x.resourceCode}<b>{x.batchRef}</b></span>) : <span className="muted">Unassigned</span>}</div></td>
              <td className="mono"><strong>{r.batch_ref}</strong></td>
              <td><span className="mono">{r.recipe_no}</span><small className="subcell">{r.recipe_description}</small></td>
              <td className="num">{r.job_count ?? "—"}</td><td className="num">{r.pcs ?? "—"}</td><td className="num">{r.surface_dm2 ?? "—"}</td>
              <td className="mono">{r.start_time?.slice(0,8) ?? "—"}</td><td className="mono">{r.end_time?.slice(0,8) ?? "—"}</td><td className="num">{r.duration_minutes != null ? `${Math.round(Number(r.duration_minutes))} min` : "—"}</td>
              <td><span className={`badge status-${(r.status || "none").toLowerCase().replace(/\s+/g,"-")}`}>{r.status || "—"}</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="pager"><button className="button" disabled={offset===0 || loading} onClick={() => setOffset(Math.max(0, offset-limit))}>Previous</button><span>{total ? `${offset+1}–${Math.min(offset+limit,total)} of ${total}` : "0 rows"}</span><button className="button" disabled={offset+limit>=total || loading} onClick={() => setOffset(offset+limit)}>Next</button></div>
    </section>
  );
}
