"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api-client";

type RouteOperation = {
  position: number;
  code: string;
  sequence: number | null;
  complete: boolean | null;
  openNonconformance: string | null;
  sourceText: string;
};

type RouteAnalysis = {
  routeMatched: boolean;
  currentPosition: number | null;
  currentSequence: number | null;
  currentOperation: string | null;
  positionSource: "NEXT_OPERATION" | "FIRST_INCOMPLETE" | "COMPLETE" | "NO_ROUTE";
  completedCount: number;
  remainingCount: number;
  remainingRoute: RouteOperation[];
  stScopeAvailable: boolean;
  stScopeCodes: string[];
  remainingStCount: number;
  remainingStRoute: RouteOperation[];
  nextStOperation: string | null;
  nextStSequence: number | null;
};

type RouteRow = {
  id: string;
  source_row_no: number;
  program: string | null;
  epicor_part: string | null;
  revision_num: string | null;
  job_num: string | null;
  prod_qty: number | null;
  last_labor_op: string | null;
  last_labor_opr_seq: number | null;
  next_operation: string | null;
  last_complete_opr_seq: number | null;
  job_complete: boolean | null;
  operation_count: number;
  st_all_operation: string | null;
  operations: RouteOperation[];
  routeAnalysis: RouteAnalysis;
};

type ResponseData = {
  total: number;
  rows: RouteRow[];
  limit: number;
  offset: number;
  summary: {
    total: number;
    programs: number;
    operations: number;
    withNext: number;
    pageWithStScope: number;
    pageWithNextSt: number;
    pageNextMatched: number;
  };
};

export function RoutingExplorer() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [search, setSearch] = useState("");
  const [operation, setOperation] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("search");
    if (initial) setSearch(initial);
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams({ limit: "25", offset: String(offset), sort: "job", direction: "asc" });
    if (search.trim()) p.set("search", search.trim());
    if (operation.trim()) p.set("operation", operation.trim());
    return p.toString();
  }, [search, operation, offset]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      apiJson<ResponseData>(`/api/routing?${query}`, { cache: "no-store" })
        .then(setData)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const page = Math.floor(offset / 25) + 1;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 25));

  return (
    <div className="stack">
      <div className="kpi-grid route-kpis route-kpis-6">
        <div className="kpi-card"><span>ACTIVE JOB ROUTES</span><strong>{(data?.summary.total ?? 0).toLocaleString()}</strong><small>JobNum-grain route snapshot</small></div>
        <div className="kpi-card"><span>OPERATION ROWS</span><strong>{(data?.summary.operations ?? 0).toLocaleString()}</strong><small>Op.1…Op.36 normalized</small></div>
        <div className="kpi-card"><span>PROGRAMS</span><strong>{data?.summary.programs ?? 0}</strong><small>Current routing source</small></div>
        <div className="kpi-card"><span>WITH NEXT OP</span><strong>{(data?.summary.withNext ?? 0).toLocaleString()}</strong><small>Source NextOperation retained</small></div>
        <div className="kpi-card route-analysis-kpi"><span>PAGE ST SCOPE</span><strong>{data?.summary.pageWithStScope ?? 0}/25</strong><small>Joined to Planning AllOperation</small></div>
        <div className="kpi-card route-analysis-kpi"><span>PAGE NEXT ST</span><strong>{data?.summary.pageWithNextSt ?? 0}</strong><small>Derived from remaining route</small></div>
      </div>

      <section className="panel route-engine-note">
        <div>
          <span className="eyebrow">ROUTING ENGINE v1</span>
          <strong>Current Position → Remaining Route → Remaining ST Route → Next ST Operation</strong>
        </div>
        <p>Current Position is anchored to source <b>NextOperation</b>. ST scope is not hard-coded: it is taken from the active Planning row <b>AllOperation</b> for the same JobNum and intersected with the full All Open Jobs route.</p>
      </section>

      <section className="panel">
        <div className="panel-head route-head">
          <div><span className="eyebrow">JOB ROUTING SOURCE OF TRUTH</span><h2>Full Operation Sequence</h2></div>
          <div className="route-filters">
            <input value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} placeholder="Search Job / Part / Program / Next Operation" />
            <input value={operation} onChange={(e) => { setOperation(e.target.value); setOffset(0); }} placeholder="Exact Operation Code" />
          </div>
        </div>

        {error ? <div className="alert error">{error}</div> : null}
        <div className="table-wrap route-table-wrap">
          <table className="erp-table route-table route-analysis-table">
            <thead><tr><th>Job</th><th>Program / Part</th><th>Current State</th><th>Route Analysis</th><th>Full Route</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="loading-cell">Loading routing data…</td></tr> : null}
              {!loading && !data?.rows.length ? <tr><td colSpan={5} className="empty-state">No active routing data matches the current filter.</td></tr> : null}
              {!loading && data?.rows.map((row) => {
                const a = row.routeAnalysis;
                return (
                  <tr key={row.id}>
                    <td className="route-job-cell"><strong>{row.job_num || "—"}</strong><span>Qty {row.prod_qty ?? "—"}</span><span>Rev {row.revision_num || "—"}</span></td>
                    <td><strong>{row.program || "—"}</strong><div className="muted-line">{row.epicor_part || "—"}</div></td>
                    <td><div className="state-stack"><span><b>LAST</b> {row.last_labor_op || "—"}</span><span><b>NEXT</b> {row.next_operation || "—"}</span><span><b>OPS</b> {row.operation_count}</span></div></td>
                    <td>
                      <div className="route-analysis-cell">
                        <div className="route-analysis-line"><span>POSITION</span><strong>{a.currentPosition ? `${a.currentPosition}/${row.operation_count}` : "COMPLETE"}</strong><small>{a.positionSource.replaceAll("_", " ")}</small></div>
                        <div className="route-analysis-line"><span>REMAINING</span><strong>{a.remainingCount}</strong><small>operations</small></div>
                        <div className="route-analysis-line st"><span>REMAINING ST</span><strong>{a.stScopeAvailable ? a.remainingStCount : "—"}</strong><small>{a.stScopeAvailable ? "Planning scope" : "No Planning match"}</small></div>
                        <div className="next-st-box"><span>NEXT ST</span><strong>{a.nextStOperation || "—"}</strong>{a.nextStSequence != null ? <small>Seq {a.nextStSequence}</small> : null}</div>
                        {a.remainingStRoute.length ? <div className="remaining-st-strip">{a.remainingStRoute.map((op) => <span key={`st-${row.id}-${op.position}`} title={`Position ${op.position} · Seq ${op.sequence ?? "—"}`}>{op.code}</span>)}</div> : null}
                      </div>
                    </td>
                    <td>
                      <div className="route-strip">
                        {row.operations.map((op) => {
                          const isNext = Boolean(row.next_operation && op.code === row.next_operation && op.position === a.currentPosition);
                          const isSt = a.stScopeCodes.some((code) => code.toUpperCase() === op.code.toUpperCase());
                          const isRemaining = a.currentPosition != null && op.position >= a.currentPosition;
                          const hasNc = Boolean(op.openNonconformance && op.openNonconformance.trim() && op.openNonconformance.trim() !== "0");
                          const cls = isNext ? "next" : op.complete ? "complete" : "remaining";
                          return <span key={`${row.id}-${op.position}`} className={`route-op ${cls} ${hasNc ? "nonconf" : ""} ${isSt && isRemaining ? "st-scope" : ""}`} title={`Position ${op.position} · Seq ${op.sequence ?? "—"} · ${op.sourceText}`}><small>{op.sequence ?? op.position}</small>{op.code}</span>;
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <button className="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</button>
          <span>Page {page} / {pages}</span>
          <button className="button" disabled={page >= pages || loading} onClick={() => setOffset(offset + 25)}>Next</button>
        </div>
      </section>
    </div>
  );
}
