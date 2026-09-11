"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type Summary = { total: number; totalPcs: number; totalSurface: number; totalJobs: number; activeResources: number };
type Meta = { minDate: string | null; maxDate: string | null; statuses: string[]; resources: string[] };
type BootstrapConfig = {
  resources: Array<{ code: string; label: string; sortOrder?: number; data?: Record<string, unknown> }>;
  statuses: Array<{ code: string; label: string; sortOrder?: number; data?: Record<string, unknown> }>;
  settings?: Record<string, unknown>;
  views?: Array<{ viewKey: string; isDefault: boolean; config: Record<string, unknown> }>;
};
type SortKey = "row" | "date" | "slot" | "batch" | "recipe" | "pcs" | "surface" | "start" | "duration" | "status";
type Direction = "asc" | "desc";
type ViewMode = "table" | "timeline";
type ColumnKey = "row" | "date" | "slot" | "resources" | "batch" | "recipe" | "jobs" | "pcs" | "surface" | "start" | "end" | "duration" | "status" | "comments";

type ViewState = {
  search: string;
  status: string;
  resource: string;
  dateFrom: string;
  dateTo: string;
  sort: SortKey;
  direction: Direction;
  visibleColumns: ColumnKey[];
  pageSize: number;
  mode: ViewMode;
};
type SavedView = { name: string; state: ViewState };

const FALLBACK_RESOURCE_LABELS: Record<string, string> = {
  SPX_CLEAN: "SPX Clean",
  MANUAL_DBL: "Manual DBL",
  AUTO_DBL: "Auto DBL",
  PLATING: "Plating",
  HE_BAKE: "He-Bake",
  PASSIVATION: "Passivation",
  MANUAL_SP: "Manual SP",
  AUTO_SHP: "Auto SHP",
  FLYBAR: "Flybar",
  CAB1: "CAB1",
  CAB2: "CAB2",
  CAB3: "CAB3",
  PAINT_POWDER: "Paint Powder",
};

const ALL_COLUMNS: { key: ColumnKey; label: string; sort?: SortKey; align?: "num" }[] = [
  { key: "row", label: "Row", sort: "row" },
  { key: "date", label: "Date", sort: "date" },
  { key: "slot", label: "Slot", sort: "slot", align: "num" },
  { key: "resources", label: "Resource Assignment" },
  { key: "batch", label: "Batch", sort: "batch" },
  { key: "recipe", label: "Recipe", sort: "recipe" },
  { key: "jobs", label: "Jobs", align: "num" },
  { key: "pcs", label: "pcs", sort: "pcs", align: "num" },
  { key: "surface", label: "dm²", sort: "surface", align: "num" },
  { key: "start", label: "Start", sort: "start" },
  { key: "end", label: "End" },
  { key: "duration", label: "Duration", sort: "duration", align: "num" },
  { key: "status", label: "Status", sort: "status" },
  { key: "comments", label: "Comments" },
];
const DEFAULT_COLUMNS: ColumnKey[] = ["row", "date", "slot", "resources", "batch", "recipe", "jobs", "pcs", "surface", "start", "end", "duration", "status"];
const STORAGE_KEY = "st-planning.phase3.saved-views.v1";
const CURRENT_KEY = "st-planning.phase3.current-view.v1";

function fmt(value: unknown, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function timeLabel(time: string | null) { return time ? time.slice(0, 5) : "—"; }
function timeToMinute(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}
function statusClass(status: string | null) {
  return `status-${(status || "none").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
type VisualStyle = { backgroundColor?: string; color?: string; borderColor?: string };
function visualStyle(data: Record<string, unknown> | undefined): VisualStyle {
  const valid = (value: unknown) => typeof value === "string" && /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(value) ? value : undefined;
  return { backgroundColor: valid(data?.background), color: valid(data?.text), borderColor: valid(data?.border) };
}

export function SchedulingTable() {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, totalPcs: 0, totalSurface: 0, totalJobs: 0, activeResources: 0 });
  const [meta, setMeta] = useState<Meta>({ minDate: null, maxDate: null, statuses: [], resources: [] });
  const [resourceLabels, setResourceLabels] = useState<Record<string, string>>(FALLBACK_RESOURCE_LABELS);
  const [resourceOrder, setResourceOrder] = useState<string[]>(Object.keys(FALLBACK_RESOURCE_LABELS));
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({});
  const [statusStyles, setStatusStyles] = useState<Record<string, VisualStyle>>({});
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [status, setStatus] = useState("");
  const [resource, setResource] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<SortKey>("date");
  const [direction, setDirection] = useState<Direction>("asc");
  const [pageSize, setPageSize] = useState(100);
  const [maxPageSize, setMaxPageSize] = useState(500);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [mode, setMode] = useState<ViewMode>("table");
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

      if (cfg) {
        setResourceLabels({ ...FALLBACK_RESOURCE_LABELS, ...Object.fromEntries((cfg.resources || []).map((x) => [x.code, x.label])) });
        setResourceOrder((cfg.resources || []).length ? cfg.resources.map((x) => x.code) : Object.keys(FALLBACK_RESOURCE_LABELS));
        setStatusLabels(Object.fromEntries((cfg.statuses || []).map((x) => [x.code.toUpperCase(), x.label])));
        setStatusStyles(Object.fromEntries((cfg.statuses || []).map((x) => [x.code.toUpperCase(), visualStyle(x.data)])));
      }
      const max = Math.max(20, Math.min(1000, Number(cfg?.settings?.["ui.maxPageSize"] || 500)));
      const configuredDefault = Math.max(20, Math.min(max, Number(cfg?.settings?.["ui.defaultPageSize"] || 100)));
      setMaxPageSize(max);

      if (current) {
        setSearch(current.search || ""); setQueryText(current.search || "");
        setStatus(current.status || ""); setResource(current.resource || ""); setDateFrom(current.dateFrom || ""); setDateTo(current.dateTo || "");
        setSort(current.sort || "date"); setDirection(current.direction || "asc"); setVisibleColumns(current.visibleColumns?.length ? current.visibleColumns : DEFAULT_COLUMNS);
        setPageSize(Math.min(max, Math.max(20, current.pageSize || configuredDefault))); setMode(current.mode || "table");
      } else {
        const view = cfg?.views?.find((v) => v.viewKey === "SCHEDULING" && v.isDefault)?.config || {};
        const viewColumns = Array.isArray(view.visibleColumns) ? view.visibleColumns.filter((x): x is ColumnKey => ALL_COLUMNS.some((c) => c.key === x)) : [];
        const viewSort = typeof view.sort === "string" && ALL_COLUMNS.some((c) => c.sort === view.sort) ? view.sort as SortKey : "date";
        const viewDirection: Direction = view.direction === "desc" ? "desc" : "asc";
        const viewMode: ViewMode = view.mode === "timeline" ? "timeline" : "table";
        const viewPageSize = Number(view.pageSize || configuredDefault);
        setSort(viewSort); setDirection(viewDirection); setMode(viewMode);
        setVisibleColumns(viewColumns.length ? viewColumns : DEFAULT_COLUMNS);
        setPageSize(Math.min(max, Math.max(20, Number.isFinite(viewPageSize) ? viewPageSize : configuredDefault)));
      }
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    apiJson<Meta>("/api/scheduling/meta", { cache: "no-store" }).then(setMeta).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const state: ViewState = { search: queryText, status, resource, dateFrom, dateTo, sort, direction, visibleColumns, pageSize, mode };
    localStorage.setItem(CURRENT_KEY, JSON.stringify(state));
  }, [ready, queryText, status, resource, dateFrom, dateTo, sort, direction, visibleColumns, pageSize, mode]);

  const pageSizeOptions = useMemo(() => {
    const values = [25, 50, 100, 200, 500, pageSize].filter((n) => n <= maxPageSize && n >= 20);
    return [...new Set(values)].sort((a, b) => a - b);
  }, [maxPageSize, pageSize]);
  const effectiveLimit = mode === "timeline" ? Math.min(500, maxPageSize) : pageSize;
  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError("");
    try {
      const q = new URLSearchParams({
        limit: String(effectiveLimit), offset: String(offset), search: queryText,
        status, resource, dateFrom, dateTo, sort, direction,
      });
      const data = await apiJson<{ total: number; rows: ScheduleRow[]; summary: Summary }>(`/api/scheduling?${q}`, { cache: "no-store" });
      setRows(data.rows); setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [ready, effectiveLimit, offset, queryText, status, resource, dateFrom, dateTo, sort, direction]);

  useEffect(() => { load(); }, [load]);

  function applySearch(e: React.FormEvent) { e.preventDefault(); setOffset(0); setQueryText(search.trim()); }
  function resetFilters() { setSearch(""); setQueryText(""); setStatus(""); setResource(""); setDateFrom(""); setDateTo(""); setSort("date"); setDirection("asc"); setOffset(0); }
  function toggleSort(key?: SortKey) { if (!key) return; setOffset(0); if (sort === key) setDirection((d) => d === "asc" ? "desc" : "asc"); else { setSort(key); setDirection("asc"); } }
  function toggleColumn(key: ColumnKey) { setVisibleColumns((c) => c.includes(key) ? c.filter((x) => x !== key) : [...c, key]); }

  function switchMode(next: ViewMode) {
    if (next === "timeline" && !dateFrom && meta.minDate) { setDateFrom(meta.minDate); setDateTo(meta.minDate); }
    setMode(next); setOffset(0);
  }

  function saveCurrentView() {
    const name = window.prompt("View name");
    if (!name?.trim()) return;
    const state: ViewState = { search: queryText, status, resource, dateFrom, dateTo, sort, direction, visibleColumns, pageSize, mode };
    const next = [...savedViews.filter((v) => v.name !== name.trim()), { name: name.trim(), state }];
    setSavedViews(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  function applySavedView(view: SavedView) {
    const s = view.state;
    setSearch(s.search || ""); setQueryText(s.search || "");
    setStatus(s.status || ""); setResource(s.resource || ""); setDateFrom(s.dateFrom || ""); setDateTo(s.dateTo || ""); setSort(s.sort || "date"); setDirection(s.direction || "asc");
    setVisibleColumns(s.visibleColumns?.length ? s.visibleColumns : DEFAULT_COLUMNS); setPageSize(s.pageSize || 100); setMode(s.mode || "table"); setOffset(0);
  }
  function deleteView(name: string) { const next = savedViews.filter((v) => v.name !== name); setSavedViews(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }

  const visible = useMemo(() => ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key)), [visibleColumns]);

  function renderCell(row: ScheduleRow, key: ColumnKey) {
    switch (key) {
      case "row": return <span className="mono">{row.source_row_no}</span>;
      case "date": return <>{row.schedule_date || "—"}<small className="subcell">{row.day_label}</small></>;
      case "slot": return row.slot_no ?? "—";
      case "resources": return <div className="resource-list">{row.resources?.length ? row.resources.map((x, i) => <span className="resource-chip" key={`${x.resourceCode}-${i}`}>{resourceLabels[x.resourceCode] || x.resourceCode}<b>{x.batchRef}</b></span>) : <span className="muted">Unassigned</span>}</div>;
      case "batch": return <span className="mono"><strong>{row.batch_ref || "—"}</strong></span>;
      case "recipe": return <><span className="mono">{row.recipe_no || "—"}</span><small className="subcell">{row.recipe_description}</small></>;
      case "jobs": return fmt(row.job_count);
      case "pcs": return fmt(row.pcs);
      case "surface": return fmt(row.surface_dm2, 1);
      case "start": return <span className="mono">{timeLabel(row.start_time)}</span>;
      case "end": return <span className="mono">{timeLabel(row.end_time)}</span>;
      case "duration": return row.duration_minutes != null ? `${Math.round(Number(row.duration_minutes))} min` : "—";
      case "status": { const code = (row.status || "").toUpperCase(); return <span className={`badge ${statusClass(row.status)}`} style={statusStyles[code]}>{statusLabels[code] || row.status || "—"}</span>; }
      case "comments": return <span title={row.comments || ""}>{row.comments || "—"}</span>;
    }
  }

  return <div className="stack">
    <section className="kpi-grid kpi-grid-5">
      <div className="kpi-card schedule-kpi"><span>SCHEDULE BLOCKS</span><strong>{summary.total.toLocaleString()}</strong><small>Rows matching current filter</small></div>
      <div className="kpi-card schedule-kpi"><span>JOBS</span><strong>{fmt(summary.totalJobs)}</strong><small>Jobs inside filtered blocks</small></div>
      <div className="kpi-card schedule-kpi"><span>PCS</span><strong>{fmt(summary.totalPcs)}</strong><small>Total scheduled pieces</small></div>
      <div className="kpi-card schedule-kpi"><span>SURFACE</span><strong>{fmt(summary.totalSurface, 0)}</strong><small>Scheduled dm²</small></div>
      <div className="kpi-card schedule-kpi"><span>ACTIVE RESOURCES</span><strong>{summary.activeResources.toLocaleString()}</strong><small>Resource lanes used</small></div>
    </section>

    <section className="panel data-panel">
      <div className="erp-command-grid">
        <form onSubmit={applySearch} className="search-box wide-search">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Batch, Recipe, Description, Resource Batch or Status…" />
          <button className="button primary" type="submit">Search</button>
        </form>
        <div className="command-actions">
          <div className="segmented"><button className={mode === "table" ? "active" : ""} type="button" onClick={() => switchMode("table")}>Table</button><button className={mode === "timeline" ? "active" : ""} type="button" onClick={() => switchMode("timeline")}>Timeline</button></div>
          {mode === "table" ? <details className="control-menu"><summary className="button">Columns <span className="button-count">{visible.length}/{ALL_COLUMNS.length}</span></summary><div className="control-popover column-popover"><div className="popover-head"><strong>Visible Columns</strong><button type="button" onClick={() => setVisibleColumns(DEFAULT_COLUMNS)}>Default</button></div>{ALL_COLUMNS.map((c) => <label key={c.key}><input type="checkbox" checked={visibleColumns.includes(c.key)} onChange={() => toggleColumn(c.key)} /> <span>{c.label}</span></label>)}</div></details> : null}
          <details className="control-menu"><summary className="button">Saved Views <span className="button-count">{savedViews.length}</span></summary><div className="control-popover saved-popover"><button className="button primary full" type="button" onClick={saveCurrentView}>Save Current View</button>{savedViews.length ? savedViews.map((v) => <div className="saved-view-row" key={v.name}><button type="button" onClick={() => applySavedView(v)}>{v.name}</button><button className="delete-x" type="button" onClick={() => deleteView(v.name)}>×</button></div>) : <div className="popover-empty">No saved views yet.</div>}</div></details>
          <button className="button" onClick={resetFilters} type="button">Reset</button>
        </div>
      </div>

      <div className="filter-ribbon scheduling-filters">
        <label><span>Date From</span><input type="date" min={meta.minDate || undefined} max={meta.maxDate || undefined} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }} /></label>
        <label><span>Date To</span><input type="date" min={meta.minDate || undefined} max={meta.maxDate || undefined} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setOffset(0); }} /></label>
        <label><span>Resource</span><select value={resource} onChange={(e) => { setResource(e.target.value); setOffset(0); }}><option value="">All Resources</option>{meta.resources.map((x) => <option key={x} value={x}>{resourceLabels[x] || x}</option>)}</select></label>
        <label><span>Status</span><select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}><option value="">All Statuses</option>{meta.statuses.map((x) => <option key={x} value={x}>{statusLabels[x.toUpperCase()] || x}</option>)}</select></label>
        {mode === "table" ? <label className="small-control"><span>Rows / Page</span><select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setOffset(0); }}>{pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}</select></label> : <div className="timeline-hint"><strong>Timeline</strong><span>Auto-scaled from filtered Start / End values</span></div>}
        <div className="record-count"><strong>{summary.total.toLocaleString()}</strong><span>matching blocks</span></div>
      </div>

      {error ? <div className="alert error">{error}</div> : null}
      {mode === "table" ? <ScheduleTable rows={rows} visible={visible} sort={sort} direction={direction} loading={loading} onSort={toggleSort} renderCell={renderCell} /> : <ScheduleTimeline rows={rows} loading={loading} resourceFilter={resource} resourceLabels={resourceLabels} resourceOrder={resourceOrder} statusStyles={statusStyles} />}

      <div className="pager">
        <span className="pager-context">{mode === "timeline" ? "Timeline shows up to 500 filtered schedule blocks." : <>Sort: <strong>{ALL_COLUMNS.find((c) => c.sort === sort)?.label || "Date"}</strong> {direction.toUpperCase()}</>}</span>
        <button className="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - effectiveLimit))}>Previous</button>
        <span>{summary.total ? `${offset + 1}–${Math.min(offset + effectiveLimit, summary.total)} of ${summary.total}` : "0 rows"}</span>
        <button className="button" disabled={offset + effectiveLimit >= summary.total || loading} onClick={() => setOffset(offset + effectiveLimit)}>Next</button>
      </div>
    </section>
  </div>;
}

function ScheduleTable({ rows, visible, sort, direction, loading, onSort, renderCell }: {
  rows: ScheduleRow[];
  visible: typeof ALL_COLUMNS;
  sort: SortKey;
  direction: Direction;
  loading: boolean;
  onSort: (key?: SortKey) => void;
  renderCell: (row: ScheduleRow, key: ColumnKey) => React.ReactNode;
}) {
  return <div className="table-wrap tall scheduling-table-wrap"><table className="erp-table compact scheduling-grid"><thead><tr>{visible.map((c) => <th key={c.key} className={c.align === "num" ? "num" : ""}><button className={`sort-head ${c.sort ? "sortable" : ""}`} type="button" onClick={() => onSort(c.sort)}>{c.label}{c.sort && sort === c.sort ? <span>{direction === "asc" ? "▲" : "▼"}</span> : null}</button></th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={visible.length || 1} className="loading-cell">Loading Scheduling data…</td></tr> : rows.length ? rows.map((r) => <tr key={r.id}>{visible.map((c) => <td key={c.key} className={c.align === "num" ? "num" : ""}>{renderCell(r, c.key)}</td>)}</tr>) : <tr><td colSpan={visible.length || 1} className="empty-state">No schedule blocks match the current view.</td></tr>}</tbody></table></div>;
}

type TimelineEntry = { row: ScheduleRow; resourceCode: string; start: number | null; end: number | null };

function ScheduleTimeline({ rows, loading, resourceFilter, resourceLabels, resourceOrder, statusStyles }: { rows: ScheduleRow[]; loading: boolean; resourceFilter: string; resourceLabels: Record<string, string>; resourceOrder: string[]; statusStyles: Record<string, VisualStyle> }) {
  const entries = useMemo<TimelineEntry[]>(() => {
    const out: TimelineEntry[] = [];
    for (const row of rows) {
      const start = timeToMinute(row.start_time);
      let end = timeToMinute(row.end_time);
      if (start != null && end != null && end < start) end += 1440;
      if (start != null && end == null && row.duration_minutes != null) end = start + Number(row.duration_minutes);
      const resources = row.resources?.length ? row.resources.map((r) => r.resourceCode) : ["UNASSIGNED"];
      for (const resourceCode of resources) {
        if (resourceFilter && resourceCode !== resourceFilter) continue;
        out.push({ row, resourceCode, start, end });
      }
    }
    return out;
  }, [rows, resourceFilter]);

  const timed = entries.filter((e) => e.start != null);
  const minRaw = timed.length ? Math.min(...timed.map((e) => e.start!)) : 0;
  const maxRaw = timed.length ? Math.max(...timed.map((e) => e.end ?? (e.start! + 60))) : 1440;
  const minMinute = Math.max(0, Math.floor(minRaw / 60) * 60);
  const maxMinute = Math.max(minMinute + 120, Math.ceil(maxRaw / 60) * 60);
  const span = maxMinute - minMinute;
  const ticks: number[] = [];
  const tickStep = span > 900 ? 180 : span > 480 ? 120 : 60;
  for (let m = minMinute; m <= maxMinute; m += tickStep) ticks.push(m);

  const groups = new Map<string, TimelineEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.resourceCode) || [];
    list.push(entry); groups.set(entry.resourceCode, list);
  }
  const groupKeys = [...groups.keys()].sort((a, b) => {
    const ai = resourceOrder.indexOf(a), bi = resourceOrder.indexOf(b);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b);
  });

  if (loading) return <div className="timeline-loading">Loading scheduling timeline…</div>;
  if (!entries.length) return <div className="empty-state timeline-empty">No schedule blocks match the current timeline filters.</div>;

  return <div className="timeline-shell">
    <div className="timeline-header-row">
      <div className="timeline-resource-head">RESOURCE LANE</div>
      <div className="timeline-scale">{ticks.map((m) => <span key={m} style={{ left: `${((m - minMinute) / span) * 100}%` }}>{formatMinute(m)}</span>)}</div>
    </div>
    <div className="timeline-scroll">
      {groupKeys.map((key) => {
        const laneEntries = (groups.get(key) || []).sort((a, b) => (a.start ?? 99999) - (b.start ?? 99999));
        const timedEntries = laneEntries.filter((e) => e.start != null);
        const untimed = laneEntries.filter((e) => e.start == null);
        const height = Math.max(58, timedEntries.length * 36 + (untimed.length ? 34 : 0) + 12);
        return <div className="timeline-lane" key={key} style={{ minHeight: height }}>
          <div className="timeline-resource-label"><strong>{resourceLabels[key] || key}</strong><span>{laneEntries.length} blocks</span></div>
          <div className="timeline-track" style={{ minHeight: height }}>
            {ticks.map((m) => <i className="timeline-gridline" key={m} style={{ left: `${((m - minMinute) / span) * 100}%` }} />)}
            {timedEntries.map((entry, index) => {
              const start = entry.start!;
              const end = entry.end ?? (start + Math.max(30, Number(entry.row.duration_minutes || 60)));
              const left = Math.max(0, ((start - minMinute) / span) * 100);
              const width = Math.max(1.4, ((Math.max(start + 15, end) - start) / span) * 100);
              return <div className={`timeline-card ${statusClass(entry.row.status)}`} key={`${entry.row.id}-${key}-${index}`} style={{ left: `${left}%`, width: `${Math.min(100 - left, width)}%`, top: 7 + index * 36, ...statusStyles[(entry.row.status || "").toUpperCase()] }} title={`${entry.row.batch_ref || "No batch"} | ${timeLabel(entry.row.start_time)}–${timeLabel(entry.row.end_time)} | ${entry.row.recipe_no || "No recipe"}`}>
                <strong>{entry.row.batch_ref || `Row ${entry.row.source_row_no}`}</strong><span>{timeLabel(entry.row.start_time)}–{timeLabel(entry.row.end_time)}</span><em>{entry.row.recipe_no || ""}</em>
              </div>;
            })}
            {untimed.length ? <div className="untimed-strip" style={{ top: 7 + timedEntries.length * 36 }}>{untimed.slice(0, 6).map((entry) => <span key={`${entry.row.id}-${key}`}>{entry.row.batch_ref || `Row ${entry.row.source_row_no}`}</span>)}{untimed.length > 6 ? <b>+{untimed.length - 6}</b> : null}</div> : null}
          </div>
        </div>;
      })}
    </div>
    <div className="timeline-footer"><span>Window: {formatMinute(minMinute)} → {formatMinute(maxMinute)}</span><span>Cards are positioned only from imported Start / End values. No scheduling rule is applied.</span></div>
  </div>;
}

function formatMinute(minute: number) {
  const day = Math.floor(minute / 1440);
  const normalized = ((minute % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60), m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}${day > 0 ? ` +${day}d` : ""}`;
}
