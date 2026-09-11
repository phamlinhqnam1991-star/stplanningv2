"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { apiJson } from "@/lib/api-client";

type Entity = "items" | "links" | "rules" | "settings" | "sources" | "views";
type Row = Record<string, unknown>;

type EntityMeta = {
  label: string;
  description: string;
  keyFields: string[];
};

const META: Record<Entity, EntityMeta> = {
  items: { label: "Master Data", description: "Operations, resources, areas, planners, recipe groups and future master categories.", keyFields: ["category", "code", "label"] },
  links: { label: "Mappings", description: "Configurable relationships such as Operation → Main Operation → Area → Planner.", keyFields: ["link_type", "from_code", "to_code"] },
  rules: { label: "Rules", description: "Priority, process time, batch, recipe, candidate, auto-plan and route rules stored as JSON conditions/actions.", keyFields: ["rule_type", "code", "name"] },
  settings: { label: "System Settings", description: "Runtime switches and limits. Route behavior already consumes these values.", keyFields: ["category", "setting_key", "label"] },
  sources: { label: "Data Sources", description: "Workbook/sheet/header/column mappings used by the import parser and normalizer.", keyFields: ["source_key", "display_name", "sheet_name"] },
  views: { label: "View Profiles", description: "Default and future shared Planning/Scheduling/Routing view configurations.", keyFields: ["view_key", "profile_code", "name"] },
};

const FALLBACK_ITEM_CATEGORIES = ["MAIN_OPERATION", "ST_OPERATION", "OPERATION_CODE", "RESOURCE", "SCHEDULE_STATUS", "PHYSICAL_AREA", "SCHEDULE_AREA", "PLANNER", "RECIPE_GROUP", "PAINT_TYPE", "CONFIG_CATEGORY", "LINK_TYPE", "RULE_TYPE"];
const FALLBACK_RULE_TYPES = ["PRIORITY", "PROCESS_TIME", "BATCH", "RECIPE", "CANDIDATE", "AUTO_PLAN", "ROUTE"];
const FALLBACK_LINK_TYPES = ["OPERATION_TO_MAIN", "MAIN_TO_PHYSICAL_AREA", "PHYSICAL_TO_SCHEDULE_AREA", "SCHEDULE_AREA_TO_PLANNER", "OPERATION_TO_RESOURCE", "OPERATION_TO_RECIPE_GROUP"];

type Bootstrap = {
  definitions?: { categories?: string[]; linkTypes?: string[]; ruleTypes?: string[] };
};

function pretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}
function parseJson(text: string, fallback: unknown = {}) {
  const t = text.trim();
  if (!t) return fallback;
  return JSON.parse(t);
}
function bool(value: unknown) { return value !== false; }

function emptyForm(entity: Entity): Row {
  if (entity === "items") return { category: "MAIN_OPERATION", code: "", label: "", parentCode: "", enabled: true, sortOrder: 0, dataText: "{}" };
  if (entity === "links") return { linkType: "OPERATION_TO_MAIN", fromCategory: "OPERATION_CODE", fromCode: "", toCategory: "MAIN_OPERATION", toCode: "", enabled: true, sortOrder: 0, dataText: "{}" };
  if (entity === "rules") return { ruleType: "PRIORITY", code: "", name: "", enabled: true, priority: 100, conditionText: "{}", actionText: "{}", notes: "" };
  if (entity === "settings") return { settingKey: "", category: "SYSTEM", label: "", dataType: "json", valueText: "null", enabled: true, description: "" };
  if (entity === "sources") return { sourceKey: "", displayName: "", sheetName: "", headerRows: 1, baselineColumns: 1, operationSlots: "", enabled: true, parserConfigText: "{}" };
  return { viewKey: "PLANNING", profileCode: "", name: "", isDefault: false, enabled: true, configText: "{}" };
}

function rowToForm(entity: Entity, row: Row): Row {
  if (entity === "items") return { id: row.id, category: row.category, code: row.code, label: row.label, parentCode: row.parent_code ?? "", enabled: bool(row.enabled), sortOrder: Number(row.sort_order || 0), dataText: pretty(row.data) };
  if (entity === "links") return { id: row.id, linkType: row.link_type, fromCategory: row.from_category, fromCode: row.from_code, toCategory: row.to_category, toCode: row.to_code, enabled: bool(row.enabled), sortOrder: Number(row.sort_order || 0), dataText: pretty(row.data) };
  if (entity === "rules") return { id: row.id, ruleType: row.rule_type, code: row.code, name: row.name, enabled: bool(row.enabled), priority: Number(row.priority || 100), conditionText: pretty(row.condition_json), actionText: pretty(row.action_json), notes: row.notes ?? "" };
  if (entity === "settings") return { settingKey: row.setting_key, category: row.category, label: row.label, dataType: row.data_type, valueText: pretty(row.value_json), enabled: bool(row.enabled), description: row.description ?? "" };
  if (entity === "sources") return { sourceKey: row.source_key, displayName: row.display_name, sheetName: row.sheet_name ?? "", headerRows: Number(row.header_rows || 1), baselineColumns: Number(row.baseline_columns || 1), operationSlots: row.operation_slots ?? "", enabled: bool(row.enabled), parserConfigText: pretty(row.parser_config) };
  return { id: row.id, viewKey: row.view_key, profileCode: row.profile_code, name: row.name, isDefault: Boolean(row.is_default), enabled: bool(row.enabled), configText: pretty(row.config_json) };
}

function formPayload(entity: Entity, f: Row) {
  if (entity === "items") return { category: String(f.category), code: String(f.code), label: String(f.label), parentCode: String(f.parentCode || "") || null, enabled: Boolean(f.enabled), sortOrder: Number(f.sortOrder || 0), data: parseJson(String(f.dataText || "{}")) };
  if (entity === "links") return { linkType: String(f.linkType), fromCategory: String(f.fromCategory), fromCode: String(f.fromCode), toCategory: String(f.toCategory), toCode: String(f.toCode), enabled: Boolean(f.enabled), sortOrder: Number(f.sortOrder || 0), data: parseJson(String(f.dataText || "{}")) };
  if (entity === "rules") return { ruleType: String(f.ruleType), code: String(f.code), name: String(f.name), enabled: Boolean(f.enabled), priority: Number(f.priority || 100), condition: parseJson(String(f.conditionText || "{}")), action: parseJson(String(f.actionText || "{}")), notes: String(f.notes || "") || null };
  if (entity === "settings") return { settingKey: String(f.settingKey), category: String(f.category), label: String(f.label), dataType: String(f.dataType || "json"), value: parseJson(String(f.valueText || "null"), null), enabled: Boolean(f.enabled), description: String(f.description || "") || null };
  if (entity === "sources") return { sourceKey: String(f.sourceKey), displayName: String(f.displayName), sheetName: String(f.sheetName || "") || null, headerRows: Number(f.headerRows || 1), baselineColumns: Number(f.baselineColumns || 1), operationSlots: f.operationSlots === "" || f.operationSlots == null ? null : Number(f.operationSlots), enabled: Boolean(f.enabled), parserConfig: parseJson(String(f.parserConfigText || "{}")) };
  return { viewKey: String(f.viewKey), profileCode: String(f.profileCode), name: String(f.name), isDefault: Boolean(f.isDefault), enabled: Boolean(f.enabled), config: parseJson(String(f.configText || "{}")) };
}

export function ConfigurationConsole() {
  const [entity, setEntity] = useState<Entity>("items");
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState<Row>(() => emptyForm("items"));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [definitions, setDefinitions] = useState({ categories: FALLBACK_ITEM_CATEGORIES, linkTypes: FALLBACK_LINK_TYPES, ruleTypes: FALLBACK_RULE_TYPES });

  useEffect(() => {
    apiJson<Bootstrap>("/api/config/bootstrap", { cache: "no-store" }).then((data) => {
      setDefinitions({
        categories: data.definitions?.categories?.length ? data.definitions.categories : FALLBACK_ITEM_CATEGORIES,
        linkTypes: data.definitions?.linkTypes?.length ? data.definitions.linkTypes : FALLBACK_LINK_TYPES,
        ruleTypes: data.definitions?.ruleTypes?.length ? data.definitions.ruleTypes : FALLBACK_RULE_TYPES,
      });
    }).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const q = new URLSearchParams({ entity, filter });
      const data = await apiJson<{ rows: Row[] }>(`/api/config?${q}`, { cache: "no-store" });
      setRows(data.rows || []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [entity, filter]);

  useEffect(() => { setForm(emptyForm(entity)); setMessage(""); void load(); }, [entity, load]);

  const counts = useMemo(() => {
    if (entity !== "items") return null;
    const c = new Map<string, number>();
    for (const row of rows) c.set(String(row.category), (c.get(String(row.category)) || 0) + 1);
    return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entity, rows]);

  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      await apiJson("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, action: "upsert", row: formPayload(entity, form) }) });
      setMessage("Configuration saved."); setForm(emptyForm(entity)); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!confirm("Delete this configuration record?")) return;
    setSaving(true); setError("");
    try {
      const body: Row = { entity, action: "delete" };
      if (entity === "settings") body.key = form.settingKey;
      else if (entity === "sources") body.key = form.sourceKey;
      else body.id = form.id;
      await apiJson("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setForm(emptyForm(entity)); setMessage("Configuration deleted."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  const hasIdentity = Boolean(form.id || (entity === "settings" && form.settingKey) || (entity === "sources" && form.sourceKey));

  return <div className="stack config-console">
    <section className="panel config-hero">
      <div><span className="eyebrow">CFG-90 · EXTENSIBILITY LAYER</span><h2>Configuration Center</h2><p>Business masters, source mappings, operational mappings and future rules are data-driven. Add or extend configuration without changing application tables.</p></div>
      <div className="config-principles"><span>CONFIG FIRST</span><span>RAW SAFE</span><span>VERSION FRIENDLY</span></div>
    </section>

    <section className="panel">
      <div className="config-tabs">{(Object.keys(META) as Entity[]).map((key) => <button key={key} type="button" className={entity === key ? "active" : ""} onClick={() => setEntity(key)}><strong>{META[key].label}</strong><small>{key.toUpperCase()}</small></button>)}</div>
      <div className="config-description"><strong>{META[entity].label}</strong><span>{META[entity].description}</span></div>
      {counts ? <div className="config-category-strip">{counts.map(([k, n]) => <span key={k}>{k}<b>{n}</b></span>)}</div> : null}
    </section>

    <section className="config-split">
      <div className="panel config-list-panel">
        <div className="panel-head"><div><span className="eyebrow">CONFIG RECORDS</span><h2>{rows.length.toLocaleString()} Records</h2></div><button className="button" onClick={() => { setForm(emptyForm(entity)); setMessage(""); }}>New</button></div>
        <div className="config-search"><input placeholder="Filter configuration…" value={filter} onChange={(e) => setFilter(e.target.value)} /><button className="button" onClick={() => void load()}>Refresh</button></div>
        <div className="config-record-list">{loading ? <div className="loading-cell">Loading configuration…</div> : rows.map((row, index) => <button className="config-record" key={String(row.id || row.setting_key || row.source_key || index)} type="button" onClick={() => { setForm(rowToForm(entity, row)); setMessage(""); }}><span>{META[entity].keyFields.map((k) => String(row[k] ?? "")).filter(Boolean).join(" · ") || "Unnamed record"}</span><small>{row.enabled === false ? "DISABLED" : "ENABLED"}</small></button>)}</div>
      </div>

      <div className="panel config-editor-panel">
        <div className="panel-head"><div><span className="eyebrow">CONFIG EDITOR</span><h2>{hasIdentity ? "Edit Configuration" : "New Configuration"}</h2></div><span className="badge neutral">JSON EXTENSIBLE</span></div>
        <ConfigForm entity={entity} form={form} setForm={setForm} definitions={definitions} locked={hasIdentity} />
        {error ? <div className="alert error"><strong>Configuration error</strong><span>{error}</span></div> : null}
        {message ? <div className="alert success"><strong>{message}</strong></div> : null}
        <div className="command-bar"><button className="button primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Configuration"}</button>{hasIdentity ? <button className="button danger" disabled={saving} onClick={remove}>Delete</button> : null}<span className="muted">Changes take effect on subsequent API/import requests.</span></div>
      </div>
    </section>
  </div>;
}

function ConfigForm({ entity, form, setForm, definitions, locked }: { entity: Entity; form: Row; setForm: Dispatch<SetStateAction<Row>>; definitions: { categories: string[]; linkTypes: string[]; ruleTypes: string[] }; locked: boolean }) {
  const set = (key: string, value: unknown) => setForm((old) => ({ ...old, [key]: value }));
  const identityKeys: Record<Entity, string[]> = {
    items: ["category", "code"],
    links: ["linkType", "fromCategory", "fromCode", "toCategory", "toCode"],
    rules: ["ruleType", "code"],
    settings: ["settingKey"],
    sources: ["sourceKey"],
    views: ["viewKey", "profileCode"],
  };
  const isLocked = (key: string) => locked && identityKeys[entity].includes(key);
  const field = (label: string, key: string, type = "text", list?: string[]) => <label><span>{label}{isLocked(key) ? " · Key" : ""}</span><input type={type} readOnly={isLocked(key)} className={isLocked(key) ? "config-key-locked" : ""} value={String(form[key] ?? "")} onChange={(e) => set(key, type === "number" ? Number(e.target.value) : e.target.value)} list={list ? `${entity}-${key}-list` : undefined} />{list ? <datalist id={`${entity}-${key}-list`}>{list.map((x) => <option key={x} value={x} />)}</datalist> : null}</label>;
  const toggle = (label: string, key: string) => <label className="config-check"><input type="checkbox" checked={Boolean(form[key])} onChange={(e) => set(key, e.target.checked)} /><span>{label}</span></label>;
  const area = (label: string, key: string) => <label className="config-json"><span>{label}</span><textarea rows={7} value={String(form[key] ?? "")} onChange={(e) => set(key, e.target.value)} spellCheck={false} /></label>;

  if (entity === "items") return <div className="config-form-grid">{field("Category", "category", "text", definitions.categories)}{field("Code", "code")}{field("Label", "label")}{field("Parent Code", "parentCode")}{field("Sort Order", "sortOrder", "number")}{toggle("Enabled", "enabled")}{area("Additional Data (JSON)", "dataText")}</div>;
  if (entity === "links") return <div className="config-form-grid">{field("Link Type", "linkType", "text", definitions.linkTypes)}{field("From Category", "fromCategory", "text", definitions.categories)}{field("From Code", "fromCode")}{field("To Category", "toCategory", "text", definitions.categories)}{field("To Code", "toCode")}{field("Sort Order", "sortOrder", "number")}{toggle("Enabled", "enabled")}{area("Mapping Data (JSON)", "dataText")}</div>;
  if (entity === "rules") return <div className="config-form-grid">{field("Rule Type", "ruleType", "text", definitions.ruleTypes)}{field("Rule Code", "code")}{field("Rule Name", "name")}{field("Priority", "priority", "number")}{toggle("Enabled", "enabled")}{area("Condition (JSON)", "conditionText")}{area("Action (JSON)", "actionText")}<label className="config-json"><span>Notes</span><textarea rows={3} value={String(form.notes ?? "")} onChange={(e) => set("notes", e.target.value)} /></label></div>;
  if (entity === "settings") return <div className="config-form-grid">{field("Setting Key", "settingKey")}{field("Category", "category")}{field("Label", "label")}{field("Data Type", "dataType")}{toggle("Enabled", "enabled")}{area("Value (JSON)", "valueText")}<label className="config-json"><span>Description</span><textarea rows={3} value={String(form.description ?? "")} onChange={(e) => set("description", e.target.value)} /></label></div>;
  if (entity === "sources") return <div className="config-form-grid">{field("Source Key", "sourceKey")}{field("Display Name", "displayName")}{field("Worksheet Name", "sheetName")}{field("Header Rows", "headerRows", "number")}{field("Baseline Columns", "baselineColumns", "number")}{field("Operation Slots", "operationSlots", "number")}{toggle("Enabled", "enabled")}{area("Parser / Column Mapping (JSON)", "parserConfigText")}</div>;
  return <div className="config-form-grid">{field("View Key", "viewKey")}{field("Profile Code", "profileCode")}{field("Name", "name")}{toggle("Default Profile", "isDefault")}{toggle("Enabled", "enabled")}{area("View Configuration (JSON)", "configText")}</div>;
}
