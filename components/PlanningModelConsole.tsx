"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api-client";

type MasterItem = {
  category: string;
  code: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  data: Record<string, unknown>;
};

type MainOperation = {
  code: string;
  label: string;
  planningOrder: number;
  planningEnabled: boolean;
  scheduleEnabled: boolean;
  batchEnabled: boolean;
  color: string | null;
  shortCode: string | null;
  stGroup: { code: string; label: string } | null;
  physicalArea: { code: string; label: string } | null;
  scheduleArea: { code: string; label: string } | null;
  planner: { code: string; label: string } | null;
  resources: Array<{ code: string; label: string }>;
  recipeGroups: Array<{ code: string; label: string }>;
};

type OperationRow = {
  code: string;
  label: string;
  sources: string[];
  resolved: null | { sourceCategory: string; mainOperation: MainOperation | null };
};

type Payload = {
  operations: OperationRow[];
  masters: Record<string, MasterItem[]>;
  mainOperations: MainOperation[];
  settings: Record<string, unknown>;
  summary: { operations: number; mapped: number; unmapped: number; mainOperations: number; planningEnabled: number };
};

const MASTER_CATEGORIES = ["ST_GROUP", "PHYSICAL_AREA", "SCHEDULE_AREA", "PLANNER", "RESOURCE", "RECIPE_GROUP"] as const;

type MainForm = {
  code: string;
  label: string;
  planningOrder: number;
  planningEnabled: boolean;
  scheduleEnabled: boolean;
  batchEnabled: boolean;
  shortCode: string;
  color: string;
};

const emptyMain: MainForm = {
  code: "",
  label: "",
  planningOrder: 100,
  planningEnabled: true,
  scheduleEnabled: true,
  batchEnabled: true,
  shortCode: "",
  color: "",
};

export function PlanningModelConsole() {
  const [data, setData] = useState<Payload | null>(null);
  const [search, setSearch] = useState("");
  const [mapped, setMapped] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mainForm, setMainForm] = useState<MainForm>(emptyMain);
  const [selectedMain, setSelectedMain] = useState("");
  const [masterCategory, setMasterCategory] = useState<(typeof MASTER_CATEGORIES)[number]>("ST_GROUP");
  const [masterCode, setMasterCode] = useState("");
  const [masterLabel, setMasterLabel] = useState("");
  const [chain, setChain] = useState({ stGroup: "", physicalArea: "", scheduleArea: "", planner: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ search, mapped });
      const result = await apiJson<Payload>(`/api/config/planning-model?${q.toString()}`, { cache: "no-store" });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [search, mapped]);

  useEffect(() => { void load(); }, [load]);

  const selectedDefinition = useMemo(() => data?.mainOperations.find((x) => x.code === selectedMain) || null, [data, selectedMain]);

  useEffect(() => {
    if (!selectedDefinition) {
      setChain({ stGroup: "", physicalArea: "", scheduleArea: "", planner: "" });
      return;
    }
    setMainForm({
      code: selectedDefinition.code,
      label: selectedDefinition.label,
      planningOrder: selectedDefinition.planningOrder,
      planningEnabled: selectedDefinition.planningEnabled,
      scheduleEnabled: selectedDefinition.scheduleEnabled,
      batchEnabled: selectedDefinition.batchEnabled,
      shortCode: selectedDefinition.shortCode || "",
      color: selectedDefinition.color || "",
    });
    setChain({
      stGroup: selectedDefinition.stGroup?.code || "",
      physicalArea: selectedDefinition.physicalArea?.code || "",
      scheduleArea: selectedDefinition.scheduleArea?.code || "",
      planner: selectedDefinition.planner?.code || "",
    });
  }, [selectedDefinition]);

  async function post(body: Record<string, unknown>, key: string, success: string) {
    setSaving(key); setError(""); setMessage("");
    try {
      await apiJson("/api/config/planning-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setMessage(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving("");
    }
  }

  async function saveMain() {
    if (!mainForm.code.trim() || !mainForm.label.trim()) return;
    await post({ action: "saveMainOperation", ...mainForm }, "main", "Main Operation saved.");
    setSelectedMain(mainForm.code.trim());
  }

  async function saveMaster() {
    if (!masterCode.trim() || !masterLabel.trim()) return;
    await post({
      action: "saveMaster",
      category: masterCategory,
      code: masterCode.trim(),
      label: masterLabel.trim(),
      sortOrder: 100,
      enabled: true,
      data: {},
    }, "master", `${masterCategory.replaceAll("_", " ")} saved.`);
    setMasterCode(""); setMasterLabel("");
  }

  async function mapOperation(row: OperationRow, mainOperationCode: string) {
    const sourceCategory = row.resolved?.sourceCategory || (row.sources.includes("OPERATION_CODE") ? "OPERATION_CODE" : "ST_OPERATION");
    await post({ action: "mapOperation", operationCode: row.code, sourceCategory, mainOperationCode: mainOperationCode || null }, `op:${row.code}`, `${row.code} mapping updated.`);
  }

  async function saveChain() {
    if (!selectedMain) return;
    setSaving("chain"); setError(""); setMessage("");
    try {
      await apiJson("/api/config/planning-model", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setLink", linkType: "MAIN_TO_ST_GROUP", fromCategory: "MAIN_OPERATION", fromCode: selectedMain, toCategory: "ST_GROUP", toCode: chain.stGroup || null }) });
      if (chain.stGroup) await apiJson("/api/config/planning-model", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setLink", linkType: "ST_GROUP_TO_PHYSICAL_AREA", fromCategory: "ST_GROUP", fromCode: chain.stGroup, toCategory: "PHYSICAL_AREA", toCode: chain.physicalArea || null }) });
      if (chain.physicalArea) await apiJson("/api/config/planning-model", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setLink", linkType: "PHYSICAL_TO_SCHEDULE_AREA", fromCategory: "PHYSICAL_AREA", fromCode: chain.physicalArea, toCategory: "SCHEDULE_AREA", toCode: chain.scheduleArea || null }) });
      if (chain.scheduleArea) await apiJson("/api/config/planning-model", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setLink", linkType: "SCHEDULE_AREA_TO_PLANNER", fromCategory: "SCHEDULE_AREA", fromCode: chain.scheduleArea, toCategory: "PLANNER", toCode: chain.planner || null }) });
      setMessage("Planning hierarchy saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving("");
    }
  }

  const masters = (category: string) => (data?.masters[category] || []).filter((x) => x.enabled).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

  return <div className="stack planning-model-console">
    <section className="panel planning-model-hero">
      <div>
        <span className="eyebrow">CFG-91 · PLANNING TAXONOMY</span>
        <h2>Planning Model Workbench</h2>
        <p>Classify imported operation codes into configurable Main Operations, then resolve ST Group → Physical Area → Schedule Area → Planner without changing source data.</p>
      </div>
      <div className="config-principles"><span>NO HARDCODED MAIN OPS</span><span>ROUTE DRIVEN</span><span>EXTENSIBLE HIERARCHY</span></div>
    </section>

    {error ? <div className="alert error"><strong>Planning Model error</strong><span>{error}</span></div> : null}
    {message ? <div className="alert success"><strong>{message}</strong></div> : null}

    <section className="kpi-grid planning-model-kpis">
      <article className="kpi-card"><span>Operation Codes</span><strong>{data?.summary.operations ?? 0}</strong><small>Auto-discovered source codes</small></article>
      <article className="kpi-card"><span>Mapped</span><strong>{data?.summary.mapped ?? 0}</strong><small>Operation → Main Operation</small></article>
      <article className="kpi-card"><span>Unmapped</span><strong>{data?.summary.unmapped ?? 0}</strong><small>Still visible for review</small></article>
      <article className="kpi-card"><span>Main Operations</span><strong>{data?.summary.mainOperations ?? 0}</strong><small>{data?.summary.planningEnabled ?? 0} planning-enabled</small></article>
    </section>

    <section className="planning-model-grid">
      <div className="panel">
        <div className="panel-head"><div><span className="eyebrow">MAIN OPERATION MASTER</span><h2>{selectedMain ? "Edit Main Operation" : "Create Main Operation"}</h2></div><button className="button" type="button" onClick={() => { setSelectedMain(""); setMainForm(emptyMain); }}>New</button></div>
        <label className="field"><span>Existing Main Operation</span><select value={selectedMain} onChange={(e) => setSelectedMain(e.target.value)}><option value="">— New Main Operation —</option>{data?.mainOperations.map((x) => <option key={x.code} value={x.code}>{x.planningOrder} · {x.code} · {x.label}</option>)}</select></label>
        <div className="config-form-grid compact-form">
          <label><span>Code</span><input value={mainForm.code} readOnly={Boolean(selectedMain)} onChange={(e) => setMainForm((x) => ({ ...x, code: e.target.value.toUpperCase() }))} /></label>
          <label><span>Label</span><input value={mainForm.label} onChange={(e) => setMainForm((x) => ({ ...x, label: e.target.value }))} /></label>
          <label><span>Planning Order</span><input type="number" value={mainForm.planningOrder} onChange={(e) => setMainForm((x) => ({ ...x, planningOrder: Number(e.target.value) }))} /></label>
          <label><span>Short Code</span><input value={mainForm.shortCode} onChange={(e) => setMainForm((x) => ({ ...x, shortCode: e.target.value.toUpperCase() }))} /></label>
          <label><span>Display Color</span><input placeholder="#145F82" value={mainForm.color} onChange={(e) => setMainForm((x) => ({ ...x, color: e.target.value }))} /></label>
          <label className="config-check"><input type="checkbox" checked={mainForm.planningEnabled} onChange={(e) => setMainForm((x) => ({ ...x, planningEnabled: e.target.checked }))} /><span>Planning Enabled</span></label>
          <label className="config-check"><input type="checkbox" checked={mainForm.scheduleEnabled} onChange={(e) => setMainForm((x) => ({ ...x, scheduleEnabled: e.target.checked }))} /><span>Scheduling Enabled</span></label>
          <label className="config-check"><input type="checkbox" checked={mainForm.batchEnabled} onChange={(e) => setMainForm((x) => ({ ...x, batchEnabled: e.target.checked }))} /><span>Batch Enabled</span></label>
        </div>
        <div className="command-bar"><button className="button primary" type="button" disabled={saving === "main"} onClick={saveMain}>{saving === "main" ? "Saving…" : "Save Main Operation"}</button></div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><span className="eyebrow">PLANNING HIERARCHY</span><h2>Main → Group → Area → Planner</h2></div><span className="badge neutral">CONFIG LINKS</span></div>
        {!selectedMain ? <div className="empty-state">Select a Main Operation to configure its hierarchy.</div> : <>
          <div className="hierarchy-flow">
            <label><span>Main Operation</span><strong>{selectedMain}</strong></label>
            <label><span>ST Group</span><select value={chain.stGroup} onChange={(e) => setChain((x) => ({ ...x, stGroup: e.target.value, physicalArea: "", scheduleArea: "", planner: "" }))}><option value="">— None —</option>{masters("ST_GROUP").map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select></label>
            <label><span>Physical Area</span><select value={chain.physicalArea} onChange={(e) => setChain((x) => ({ ...x, physicalArea: e.target.value, scheduleArea: "", planner: "" }))}><option value="">— None —</option>{masters("PHYSICAL_AREA").map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select></label>
            <label><span>Schedule Area</span><select value={chain.scheduleArea} onChange={(e) => setChain((x) => ({ ...x, scheduleArea: e.target.value, planner: "" }))}><option value="">— None —</option>{masters("SCHEDULE_AREA").map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select></label>
            <label><span>Planner</span><select value={chain.planner} onChange={(e) => setChain((x) => ({ ...x, planner: e.target.value }))}><option value="">— None —</option>{masters("PLANNER").map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select></label>
          </div>
          <div className="command-bar"><button className="button primary" type="button" disabled={saving === "chain"} onClick={saveChain}>{saving === "chain" ? "Saving…" : "Save Hierarchy"}</button><span className="muted">Hierarchy is reusable across any Main Operation linked to the same ST Group.</span></div>
        </>}

        <div className="master-quick-add">
          <div><span className="eyebrow">QUICK MASTER ADD</span><strong>Add reusable hierarchy master</strong></div>
          <select value={masterCategory} onChange={(e) => setMasterCategory(e.target.value as (typeof MASTER_CATEGORIES)[number])}>{MASTER_CATEGORIES.map((x) => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}</select>
          <input placeholder="Code" value={masterCode} onChange={(e) => setMasterCode(e.target.value.toUpperCase())} />
          <input placeholder="Label" value={masterLabel} onChange={(e) => setMasterLabel(e.target.value)} />
          <button className="button" type="button" disabled={saving === "master"} onClick={saveMaster}>{saving === "master" ? "Saving…" : "Add Master"}</button>
        </div>
      </div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">OPERATION CLASSIFICATION</span><h2>Operation → Main Operation Matrix</h2></div><span className="badge neutral">{loading ? "LOADING" : `${data?.operations.length ?? 0} SHOWN`}</span></div>
      <div className="filter-bar planning-model-filter">
        <label><span>Search Operation</span><input placeholder="Operation code or label" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <label><span>Mapping State</span><select value={mapped} onChange={(e) => setMapped(e.target.value)}><option value="all">All</option><option value="mapped">Mapped</option><option value="unmapped">Unmapped</option></select></label>
        <button className="button" type="button" onClick={() => void load()}>Refresh</button>
      </div>
      <div className="table-wrap planning-model-table-wrap">
        <table className="data-table planning-model-table">
          <thead><tr><th>Operation</th><th>Source</th><th>Main Operation</th><th>Order</th><th>Planning</th><th>ST Group</th><th>Physical Area</th><th>Schedule Area</th><th>Planner</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="loading-cell">Loading operation model…</td></tr> : data?.operations.map((row) => {
              const main = row.resolved?.mainOperation || null;
              return <tr key={row.code} className={!main ? "row-warning" : ""}>
                <td><strong>{row.code}</strong><small className="cell-subtext">{row.label !== row.code ? row.label : ""}</small></td>
                <td><div className="chip-row">{row.sources.map((x) => <span className="mini-chip" key={x}>{x === "OPERATION_CODE" ? "ROUTE" : "ST"}</span>)}</div></td>
                <td><select className="mapping-select" value={main?.code || ""} disabled={saving === `op:${row.code}`} onChange={(e) => void mapOperation(row, e.target.value)}><option value="">UNMAPPED</option>{data.mainOperations.map((x) => <option key={x.code} value={x.code}>{x.code} · {x.label}</option>)}</select></td>
                <td>{main?.planningOrder ?? "—"}</td>
                <td>{main ? <span className={`state-pill ${main.planningEnabled ? "good" : "neutral"}`}>{main.planningEnabled ? "ENABLED" : "DISABLED"}</span> : "—"}</td>
                <td>{main?.stGroup?.label || "—"}</td>
                <td>{main?.physicalArea?.label || "—"}</td>
                <td>{main?.scheduleArea?.label || "—"}</td>
                <td>{main?.planner?.label || "—"}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
