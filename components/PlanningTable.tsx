"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api-client";

type Operation = { code: string; value: string; order: number; sourceColumn: string };
type MainPlanningDefinition = {
  code: string; label: string; planningOrder: number; planningEnabled: boolean; scheduleEnabled: boolean; batchEnabled: boolean;
  color: string | null; shortCode: string | null;
  stGroup: { code: string; label: string } | null;
  physicalArea: { code: string; label: string } | null;
  scheduleArea: { code: string; label: string } | null;
  planner: { code: string; label: string } | null;
};
type RouteAnalysis = {
  currentPosition: number | null;
  currentSequence: number | null;
  currentOperation: string | null;
  currentOccurrence: number | null;
  currentOccurrenceKey: string | null;
  positionSource: "LAST_OPERATION_NEXT_PAIR" | "LAST_LABOR_NEXT_PAIR" | "LAST_LABOR_SEQUENCE" | "NEXT_OPERATION" | "FIRST_INCOMPLETE" | "COMPLETE" | "NO_ROUTE";
  anchorConfidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  anchorWarnings: string[];
  remainingCount: number;
  stScopeAvailable: boolean;
  remainingStCount: number;
  remainingStRoute: { position: number; code: string; sequence: number | null }[];
  nextStOperation: string | null;
  nextStSequence: number | null;
};
type PlanningRow = {
  id: string;
  source_row_no: number;
  current_job_duplicate_count?: number;
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
  route_id: string | null;
  route_operation_count: number | null;
  routeAnalysis: RouteAnalysis | null;
  erpState: {
    finalGateState: "BEFORE_FINAL" | "REACHED_FINAL" | "AFTER_FINAL" | "UNKNOWN";
    finalGateCode: string | null;
    finalGatePosition: number | null;
    finalGateOccurrence: number | null;
    reasons: Array<{ code: string; severity: "INFO" | "WARNING" | "BLOCKING"; message: string }>;
  } | null;
  nextMainOperation: { code: string; label: string } | null;
  remainingMainOperations: Array<{ code: string; label: string; sourceOperation: string }>;
  nextPlanningOperation: MainPlanningDefinition | null;
  remainingPlanningOperations: MainPlanningDefinition[];
  unmappedStOperations: string[];
  recipeSuggestion: {
    status: "MATCHED" | "SOURCE_ONLY" | "AMBIGUOUS" | "NO_VALUE" | "NO_RULE";
    ruleCode: string | null; selector: string | null; recipeNo: string | null; recipeName: string | null;
    recipeGroup: string | null; sourceField: string | null; sourceColumn: string | null; sourceValue: string | null;
    confidence: string | null; needsReview: boolean; candidates: Array<{ code: string; label: string }>;
  };
  processTimeSuggestion: {
    status: "RESOLVED" | "REVIEW_REQUIRED" | "NO_RULE" | "NO_VALUE";
    ruleCode: string | null; mode: string | null; minutes: number | null; unit: string | null;
    sourceField: string | null; sourceValue: string | null; profile: string | null; needsReview: boolean;
  };
};

type PlanningSummary = { total: number; totalQty: number; totalSurface: number; programs: number; priorityRows: number };
type Meta = { programs: string[]; nextOperations: string[]; operations: string[]; priorities: string[] };
type SortKey = "row" | "program" | "part" | "revision" | "job" | "nextOperation" | "prodQty" | "goodWip" | "surface" | "priority";
type Direction = "asc" | "desc";
type ColumnKey = "row" | "program" | "partCluster" | "part" | "revision" | "description" | "job" | "nextOp" | "lastOp" | "routePos" | "nextSt" | "nextMain" | "nextPlan" | "recipe" | "processTime" | "planningArea" | "planner" | "unmapped" | "remainingSt" | "remainingMain" | "prodQty" | "goodWip" | "surface" | "area" | "sequence" | "priority" | "catTransit" | "impactSale" | "operations";

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
type BootstrapConfig = {
  settings?: Record<string, unknown>;
  views?: Array<{ viewKey: string; isDefault: boolean; config: Record<string, unknown> }>;
};

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
  { key: "routePos", label: "Route Position" },
  { key: "nextSt", label: "Next ST Operation" },
  { key: "nextMain", label: "Next Main Operation" },
  { key: "nextPlan", label: "Next Planning Operation" },
  { key: "recipe", label: "Suggested Recipe" },
  { key: "processTime", label: "Process Time" },
  { key: "planningArea", label: "Planning Area" },
  { key: "planner", label: "Planner" },
  { key: "unmapped", label: "Unmapped ST" },
  { key: "remainingSt", label: "Remaining ST Route" },
  { key: "remainingMain", label: "Remaining Main Route" },
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

const DEFAULT_COLUMNS: ColumnKey[] = ["row", "program", "part", "revision", "job", "nextOp", "routePos", "nextSt", "nextPlan", "recipe", "processTime", "planningArea", "planner", "remainingSt", "prodQty", "goodWip", "surface", "priority", "catTransit", "impactSale"];
const STORAGE_KEY = "st-planning.phase2.saved-views.v2";
const CURRENT_KEY = "st-planning.phase2.current-view.v2";

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
  const [maxPageSize, setMaxPageSize] = useState(500);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let current: ViewState | null = null;
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as SavedView[];
        setSavedViews(Array.isArray(saved) ? saved : []);
        current = JSON.parse(localStorage.getItem(CURRENT_KEY) || "null") as ViewState | null;
      } catch { /* ignore corrupt browser state */ }

      let cfg: BootstrapConfig | null = null;
      try { cfg = await apiJson<BootstrapConfig>("/api/config/bootstrap", { cache: "no-store" }); } catch { /* fallback below */ }
      if (cancelled) return;

      const max = Math.max(20, Math.min(1000, Number(cfg?.settings?.["ui.maxPageSize"] || 500)));
      const configuredDefault = Math.max(20, Math.min(max, Number(cfg?.settings?.["ui.defaultPageSize"] || 100)));
      setMaxPageSize(max);

      if (current) {
        setSearch(current.search || ""); setQueryText(current.search || "");
        setProgram(current.program || "");
        setNextOperation(current.nextOperation || "");
        setOperation(current.operation || "");
        setPriority(current.priority || "");
        setSort(current.sort || "row");
        setDirection(current.direction || "asc");
        setVisibleColumns(current.visibleColumns?.length ? current.visibleColumns : DEFAULT_COLUMNS);
        setPageSize(Math.min(max, Math.max(20, current.pageSize || configuredDefault)));
      } else {
        const view = cfg?.views?.find((v) => v.viewKey === "PLANNING" && v.isDefault)?.config || {};
        const viewColumns = Array.isArray(view.visibleColumns) ? view.visibleColumns.filter((x): x is ColumnKey => ALL_COLUMNS.some((c) => c.key === x)) : [];
        const viewSort = typeof view.sort === "string" && ALL_COLUMNS.some((c) => c.sort === view.sort) ? view.sort as SortKey : "row";
        const viewDirection: Direction = view.direction === "desc" ? "desc" : "asc";
        const viewPageSize = Number(view.pageSize || configuredDefault);
        setSort(viewSort); setDirection(viewDirection);
        setVisibleColumns(viewColumns.length ? viewColumns : DEFAULT_COLUMNS);
        setPageSize(Math.min(max, Math.max(20, Number.isFinite(viewPageSize) ? viewPageSize : configuredDefault)));
      }
      setReady(true);
    })();
    return () => { cancelled = true; };
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

  const pageSizeOptions = useMemo(() => {
    const values = [25, 50, 100, 200, 500, pageSize].filter((n) => n <= maxPageSize && n >= 20);
    return [...new Set(values)].sort((a, b) => a - b);
  }, [maxPageSize, pageSize]);

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
      case "routePos": return row.routeAnalysis ? <div className="hierarchy-cell"><span className="route-position-badge" title={`${row.routeAnalysis.positionSource.replaceAll("_", " ")} · confidence ${row.routeAnalysis.anchorConfidence}${row.routeAnalysis.anchorWarnings.length ? ` · ${row.routeAnalysis.anchorWarnings.join(", ")}` : ""}`}>{row.routeAnalysis.currentPosition ? `${row.routeAnalysis.currentPosition}/${row.route_operation_count || "?"}` : "COMPLETE"}</span><small>{row.routeAnalysis.currentOccurrenceKey || row.routeAnalysis.anchorConfidence}</small></div> : <span className="muted">No route</span>;
      case "nextSt": return row.routeAnalysis?.nextStOperation ? <span className="next-st-badge" title={row.routeAnalysis.nextStSequence != null ? `OprSeq ${row.routeAnalysis.nextStSequence}` : undefined}>{row.routeAnalysis.nextStOperation}</span> : <span className="muted">—</span>;
      case "nextMain": return row.nextMainOperation ? <span className="main-op-badge" title={`Mapped from ${row.routeAnalysis?.nextStOperation || "ST operation"}`}>{row.nextMainOperation.label}</span> : <span className="muted">Unmapped</span>;
      case "nextPlan": return row.nextPlanningOperation ? <span className="planning-op-badge" style={row.nextPlanningOperation.color ? { borderColor: row.nextPlanningOperation.color } : undefined} title={`Planning order ${row.nextPlanningOperation.planningOrder}`}>{row.nextPlanningOperation.label}<small>{row.nextPlanningOperation.code}</small></span> : <span className="muted">No mapped planning step</span>;
      case "recipe": {
        const r = row.recipeSuggestion;
        if (!r || r.status === "NO_RULE" || r.status === "NO_VALUE") return <span className="muted">—</span>;
        if (r.status === "AMBIGUOUS") return <div className="recipe-suggestion review"><strong>AMBIGUOUS</strong><small>{r.sourceValue || "Source name"} · {r.candidates.length} matches</small></div>;
        return <div className={`recipe-suggestion ${r.needsReview ? "review" : ""}`} title={[r.ruleCode, r.sourceField && `${r.sourceField}/${r.sourceColumn}`, r.confidence].filter(Boolean).join(" · ")}>
          <strong>{r.recipeNo || "SOURCE"}</strong><span>{r.recipeName || r.sourceValue || "Source identifier"}</span>{r.needsReview ? <small>REVIEW</small> : null}
        </div>;
      }
      case "processTime": {
        const t = row.processTimeSuggestion;
        if (!t || t.status === "NO_RULE" || t.status === "NO_VALUE") return <span className="muted">—</span>;
        if (t.status === "REVIEW_REQUIRED") return <span className="time-suggestion review">RULE REVIEW</span>;
        return <div className={`time-suggestion ${t.needsReview ? "review" : ""}`} title={[t.ruleCode,t.sourceField,t.profile].filter(Boolean).join(" · ")}><strong>{fmt(t.minutes, 1)} min</strong><small>{t.mode?.replaceAll("_"," ")}</small></div>;
      }
      case "planningArea": return row.nextPlanningOperation ? <div className="hierarchy-cell"><strong>{row.nextPlanningOperation.scheduleArea?.label || row.nextPlanningOperation.physicalArea?.label || "—"}</strong><small>{row.nextPlanningOperation.stGroup?.label || "No ST Group"}</small></div> : <span className="muted">—</span>;
      case "planner": return row.nextPlanningOperation?.planner?.label || <span className="muted">—</span>;
      case "unmapped": return row.unmappedStOperations?.length ? <div className="unmapped-chip-row">{row.unmappedStOperations.slice(0,3).map((x) => <span key={x}>{x}</span>)}{row.unmappedStOperations.length > 3 ? <b>+{row.unmappedStOperations.length-3}</b> : null}</div> : <span className="state-pill good">MAPPED</span>;
      case "remainingSt": return row.routeAnalysis?.remainingStRoute?.length ? <div className="planning-st-route" title={`${row.routeAnalysis.remainingStCount} remaining ST operations`}>{row.routeAnalysis.remainingStRoute.slice(0, 5).map((op) => <span key={`${op.position}-${op.code}`}>{op.code}</span>)}{row.routeAnalysis.remainingStRoute.length > 5 ? <b>+{row.routeAnalysis.remainingStRoute.length - 5}</b> : null}</div> : <span className="muted">{row.routeAnalysis?.stScopeAvailable ? "Complete" : "No ST scope"}</span>;
      case "remainingMain": return row.remainingMainOperations?.length ? <div className="planning-main-route">{row.remainingMainOperations.slice(0,5).map((op) => <span key={op.code}>{op.label}</span>)}{row.remainingMainOperations.length > 5 ? <b>+{row.remainingMainOperations.length - 5}</b> : null}</div> : <span className="muted">Unmapped</span>;
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
        <label className="small-control"><span>Rows / Page</span><select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setOffset(0); }}>{pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
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
