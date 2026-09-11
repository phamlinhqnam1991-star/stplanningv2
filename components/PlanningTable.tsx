"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api-client";

type Operation = { code: string; value: string; order: number; sourceColumn: string };
type PlanningRow = {
  id: string;
  source_row_no: number;
  program: string | null;
  part_cluster: string | null;
  epicor_part: string | null;
  alloy: string | null;
  temper: string | null;
  revision_num: string | null;
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
  all_operation: string | null;
  priority_type: string | null;
  cat_transit: string | null;
  impact_sale_value: string | null;
  operation_count: number;
  operations: Operation[];
};

type PlanningSummary = { total: number; totalQty: number; totalSurface: number; programs: number; priorityRows: number };
type Meta = { programs: string[]; nextOperations: string[]; operations: string[]; priorities: string[] };
type SortKey = "row" | "program" | "part" | "revision" | "job" | "nextOperation" | "prodQty" | "goodWip" | "surface" | "priority";
type Direction = "asc" | "desc";
type ColumnKey = "row" | "program" | "partCluster" | "part" | "revision" | "description" | "job" | "nextOp" | "lastOp" | "prodQty" | "goodWip" | "surface" | "area" | "sequence" | "priority" | "catTransit" | "impactSale" | "operations";

type ViewState = {
  search: string;
  program: string;
  nextOperation: string;
  operation: string;
  priority: string;
  sort: SortKey;
  direction: Direction;
  visibleColumns: ColumnKey[];
  pageSize: number;
};

type SavedView = { name: string; state: ViewState };

const ALL_COLUMNS: { key: ColumnKey; label: string; sort?: SortKey; align?: "num" }[] = [
  { key: "row", label: "Row", sort: "row" },
  { key: "program", label: "Program", sort: "program" },
  { key: "partCluster", label: "Part Cluster" },
  { key: "part", label: "Part", sort: "part" },
  { key: "revision", label: "Revision", sort: "revision" },
  { key: "description", label: "Description" },
  { key: "job", label: "Job", sort: "job" },
  { key: "nextOp", label: "Next Operation", sort: "nextOperation" },
  { key: "lastOp", label: "Last Operation" },
  { key: "prodQty", label: "Prod Qty", sort: "prodQty", align: "num" },
  { key: "goodWip", label: "Good WIP", sort: "goodWip", align: "num" },
  { key: "surface", label: "Surface dm²", sort: "surface", align: "num" },
  { key: "area", label: "ST Area" },
  { key: "sequence", label: "WIP Sequence" },
  { key: "priority", label: "Priority Type", sort: "priority" },
  { key: "catTransit", label: "CAT3/5 Transit" },
  { key: "impactSale", label: "Impact Sale" },
  { key: "operations", label: "ST Operations" },
];

const DEFAULT_COLUMNS: ColumnKey[] = ["row", "program", "part", "revision", "job", "nextOp", "prodQty", "goodWip", "surface", "priority", "catTransit", "impactSale", "operations"];
const STORAGE_KEY = "st-planning.phase2.saved-views.v1";
const CURRENT_KEY = "st-planning.phase2.current-view.v1";

function fmt(value: unknown, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function priorityTokens(row: PlanningRow) {
  return [row.priority_type, row.cat_transit, row.impact_sale_value].filter((x): x is string => Boolean(x && x.trim()));
}

export function PlanningTable() {
  const [rows, setRows] = useState<PlanningRow[]>([]);
  const [summary, setSummary] = useState<PlanningSummary>({ total: 0, totalQty: 0, totalSurface: 0, programs: 0, priorityRows: 0 });
  const [meta, setMeta] = useState<Meta>({ programs: [], nextOperations: [], operations: [], priorities: [] });
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [program, setProgram] = useState("");
  const [nextOperation, setNextOperation] = useState("");
  const [operation, setOperation] = useState("");
  const [priority, setPriority] = useState("");
  const [sort, setSort] = useState<SortKey>("row");
  const [direction, setDirection] = useState<Direction>("asc");
  const [pageSize, setPageSize] = useState(100);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as SavedView[];
      setSavedViews(Array.isArray(saved) ? saved : []);
      const current = JSON.parse(localStorage.getItem(CURRENT_KEY) || "null") as ViewState | null;
      if (current) {
        setSearch(current.search || ""); setQueryText(current.search || "");
        setProgram(current.program || "");
        setNextOperation(current.nextOperation || "");
        setOperation(current.operation || "");
        setPriority(current.priority || "");
        setSort(current.sort || "row");
        setDirection(current.direction || "asc");
        setVisibleColumns(current.visibleColumns?.length ? current.visibleColumns : DEFAULT_COLUMNS);
        setPageSize(current.pageSize || 100);
      }
    } catch { /* ignore corrupt browser state */ }
    setReady(true);
  }, []);

  useEffect(() => {
    apiJson<Meta>("/api/planning/meta", { cache: "no-store" }).then(setMeta).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const state: ViewState = { search: queryText, program, nextOperation, operation, priority, sort, direction, visibleColumns, pageSize };
    localStorage.setItem(CURRENT_KEY, JSON.stringify(state));
  }, [ready, queryText, program, nextOperation, operation, priority, sort, direction, visibleColumns, pageSize]);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({
        limit: String(pageSize), offset: String(offset), search: queryText,
        program, nextOperation, operation, priority, sort, direction,
      });
      const data = await apiJson<{ total: number; rows: PlanningRow[]; summary: PlanningSummary }>(`/api/planning?${q}`, { cache: "no-store" });
      setRows(data.rows);
      setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ready, pageSize, offset, queryText, program, nextOperation, operation, priority, sort, direction]);

  useEffect(() => { load(); }, [load]);

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    setQueryText(search.trim());
  }

  function toggleSort(key?: SortKey) {
    if (!key) return;
    setOffset(0);
    if (sort === key) setDirection((d) => d === "asc" ? "desc" : "asc");
    else { setSort(key); setDirection("asc"); }
  }

  function resetFilters() {
    setSearch(""); setQueryText(""); setProgram(""); setNextOperation(""); setOperation(""); setPriority("");
    setSort("row"); setDirection("asc"); setOffset(0);
  }

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns((current) => current.includes(key) ? current.filter((x) => x !== key) : [...current, key]);
  }

  function saveCurrentView() {
    const name = window.prompt("View name");
    if (!name?.trim()) return;
    const state: ViewState = { search: queryText, program, nextOperation, operation, priority, sort, direction, visibleColumns, pageSize };
    const next = [...savedViews.filter((v) => v.name !== name.trim()), { name: name.trim(), state }];
    setSavedViews(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function applySavedView(view: SavedView) {
    const s = view.state;
    setSearch(s.search || ""); setQueryText(s.search || "");
    setProgram(s.program || ""); setNextOperation(s.nextOperation || ""); setOperation(s.operation || ""); setPriority(s.priority || "");
    setSort(s.sort || "row"); setDirection(s.direction || "asc"); setVisibleColumns(s.visibleColumns?.length ? s.visibleColumns : DEFAULT_COLUMNS); setPageSize(s.pageSize || 100); setOffset(0);
  }

  function deleteView(name: string) {
    const next = savedViews.filter((v) => v.name !== name);
    setSavedViews(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const visible = useMemo(() => ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key)), [visibleColumns]);

  function renderCell(row: PlanningRow, key: ColumnKey) {
    switch (key) {
      case "row": return <span className="mono">{row.source_row_no}</span>;
      case "program": return row.program || "—";
      case "partCluster": return row.part_cluster || "—";
      case "part": return <><strong>{row.epicor_part || "—"}</strong><small className="subcell">{[row.alloy, row.temper].filter(Boolean).join(" / ")}</small></>;
      case "revision": return row.revision_num || "—";
      case "description": return <span title={row.part_description || ""}>{row.part_description || "—"}</span>;
      case "job": return row.job_num ? <a className="mono route-link" href={`/routing?search=${encodeURIComponent(row.job_num)}`}>{row.job_num}</a> : <span className="mono">—</span>;
      case "nextOp": return <span className="op-chip">{row.next_operation || "—"}</span>;
      case "lastOp": return row.last_labor_op || "—";
      case "prodQty": return fmt(row.prod_qty);
      case "goodWip": return fmt(row.current_good_wip_qty);
      case "surface": return fmt(row.surface_dm2, 2);
      case "area": return row.st_wip_area || "—";
      case "sequence": return row.wip_sequence || "—";
      case "priority": return row.priority_type ? <span className="priority-badge priority-main">{row.priority_type}</span> : <span className="muted">—</span>;
      case "catTransit": return row.cat_transit ? <span className="priority-badge priority-cat">{row.cat_transit}</span> : <span className="muted">—</span>;
      case "impactSale": return row.impact_sale_value ? <span className="priority-badge priority-sale">{row.impact_sale_value}</span> : <span className="muted">—</span>;
      case "operations": return row.operations?.length ? <div className="operation-list" title={`${row.operation_count} operation values`}>
        {row.operations.slice(0, 5).map((o) => <span className="operation-chip" key={`${o.order}-${o.code}`}>{o.code}<b>{o.value}</b></span>)}
        {row.operations.length > 5 ? <span className="operation-more">+{row.operations.length - 5}</span> : null}
      </div> : <span className="muted">—</span>;
    }
  }

  return <div className="stack">
    <section className="kpi-grid kpi-grid-5">
      <div className="kpi-card"><span>FILTERED JOBS</span><strong>{summary.total.toLocaleString()}</strong><small>Operational Planning rows</small></div>
      <div className="kpi-card"><span>PRODUCTION QTY</span><strong>{fmt(summary.totalQty)}</strong><small>Sum of filtered Prod Qty</small></div>
      <div className="kpi-card"><span>SURFACE</span><strong>{fmt(summary.totalSurface, 0)}</strong><small>dm² across filtered jobs</small></div>
      <div className="kpi-card"><span>PROGRAMS</span><strong>{summary.programs.toLocaleString()}</strong><small>Distinct programs</small></div>
      <div className="kpi-card priority-kpi"><span>PRIORITY TAGGED</span><strong>{summary.priorityRows.toLocaleString()}</strong><small>Source priority data present</small></div>
    </section>

    <section className="panel data-panel">
      <div className="erp-command-grid">
        <form onSubmit={applySearch} className="search-box wide-search">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Job, Part, Program, Description, Operation or Priority…" />
          <button className="button primary" type="submit">Search</button>
        </form>
        <div className="command-actions">
          <details className="control-menu">
            <summary className="button">Columns <span className="button-count">{visible.length}/{ALL_COLUMNS.length}</span></summary>
            <div className="control-popover column-popover">
              <div className="popover-head"><strong>Visible Columns</strong><button type="button" onClick={() => setVisibleColumns(DEFAULT_COLUMNS)}>Default</button></div>
              {ALL_COLUMNS.map((c) => <label key={c.key}><input type="checkbox" checked={visibleColumns.includes(c.key)} onChange={() => toggleColumn(c.key)} /> <span>{c.label}</span></label>)}
            </div>
          </details>
          <details className="control-menu">
            <summary className="button">Saved Views <span className="button-count">{savedViews.length}</span></summary>
            <div className="control-popover saved-popover">
              <button className="button primary full" type="button" onClick={saveCurrentView}>Save Current View</button>
              {savedViews.length ? savedViews.map((v) => <div className="saved-view-row" key={v.name}><button type="button" onClick={() => applySavedView(v)}>{v.name}</button><button className="delete-x" type="button" onClick={() => deleteView(v.name)}>×</button></div>) : <div className="popover-empty">No saved views yet.</div>}
            </div>
          </details>
          <button className="button" onClick={resetFilters} type="button">Reset</button>
        </div>
      </div>

      <div className="filter-ribbon">
        <label><span>Program</span><select value={program} onChange={(e) => { setProgram(e.target.value); setOffset(0); }}><option value="">All Programs</option>{meta.programs.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label><span>Next Operation</span><select value={nextOperation} onChange={(e) => { setNextOperation(e.target.value); setOffset(0); }}><option value="">All Next Operations</option>{meta.nextOperations.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label><span>ST Operation Present</span><select value={operation} onChange={(e) => { setOperation(e.target.value); setOffset(0); }}><option value="">Any Operation</option>{meta.operations.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label><span>Priority Contains</span><select value={priority} onChange={(e) => { setPriority(e.target.value); setOffset(0); }}><option value="">All Priority Values</option>{meta.priorities.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="small-control"><span>Rows / Page</span><select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setOffset(0); }}><option>50</option><option>100</option><option>200</option><option>500</option></select></label>
        <div className="record-count"><strong>{summary.total.toLocaleString()}</strong><span>matching rows</span></div>
      </div>

      {error ? <div className="alert error">{error}</div> : null}
      <div className="table-wrap tall planning-table-wrap">
        <table className="erp-table compact planning-grid">
          <thead><tr>{visible.map((c) => <th key={c.key} className={c.align === "num" ? "num" : ""}>
            <button className={`sort-head ${c.sort ? "sortable" : ""}`} type="button" onClick={() => toggleSort(c.sort)}>
              {c.label}{c.sort && sort === c.sort ? <span>{direction === "asc" ? "▲" : "▼"}</span> : null}
            </button>
          </th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={visible.length || 1} className="loading-cell">Loading Planning data…</td></tr> : rows.length ? rows.map((r) => {
              const isPriority = priorityTokens(r).length > 0;
              return <tr key={r.id} className={isPriority ? "priority-row" : ""}>{visible.map((c) => <td key={c.key} className={c.align === "num" ? "num" : ""}>{renderCell(r, c.key)}</td>)}</tr>;
            }) : <tr><td colSpan={visible.length || 1} className="empty-state">No Planning rows match the current view.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <span className="pager-context">Sort: <strong>{ALL_COLUMNS.find((c) => c.sort === sort)?.label || "Row"}</strong> {direction.toUpperCase()}</span>
        <button className="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Previous</button>
        <span>{summary.total ? `${offset + 1}–${Math.min(offset + pageSize, summary.total)} of ${summary.total}` : "0 rows"}</span>
        <button className="button" disabled={offset + pageSize >= summary.total || loading} onClick={() => setOffset(offset + pageSize)}>Next</button>
      </div>
    </section>
  </div>;
}
