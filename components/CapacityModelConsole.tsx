"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";

type SettingRow = { setting_key:string; category:string; label:string; data_type:string; value_json:unknown; enabled:boolean; description:string|null };
type ItemRow = { id:string; category:string; code:string; label:string; enabled:boolean; sort_order:number; data:Record<string,unknown> };
type RuleRow = { id:string; rule_type:string; code:string; name:string; enabled:boolean; priority:number; condition_json:Record<string,unknown>; action_json:Record<string,unknown>; notes:string|null };

function displayValue(v:unknown){ return typeof v === "string" ? v : JSON.stringify(v ?? null); }
function parseValue(text:string,type:string):unknown{
  if(type === "boolean") return text === "true";
  if(type === "number") { const n = Number(text); if(!Number.isFinite(n)) throw new Error("Enter a valid number."); return n; }
  if(type === "json") return JSON.parse(text);
  return text;
}

export function CapacityModelConsole(){
  const [settings,setSettings] = useState<SettingRow[]>([]);
  const [resources,setResources] = useState<ItemRow[]>([]);
  const [paintRules,setPaintRules] = useState<RuleRow[]>([]);
  const [manualRules,setManualRules] = useState<RuleRow[]>([]);
  const [edit,setEdit] = useState<Record<string,string>>({});
  const [resourceEdit,setResourceEdit] = useState<Record<string,string>>({});
  const [ruleConditionEdit,setRuleConditionEdit] = useState<Record<string,string>>({});
  const [ruleActionEdit,setRuleActionEdit] = useState<Record<string,string>>({});
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");

  async function load(){
    setLoading(true); setError("");
    try{
      const [a,b,c,d] = await Promise.all([
        apiJson<{rows:SettingRow[]}>("/api/config?entity=settings&filter=CAPACITY",{cache:"no-store"}),
        apiJson<{rows:ItemRow[]}>("/api/config?entity=items&filter=CAPACITY_RESOURCE",{cache:"no-store"}),
        apiJson<{rows:RuleRow[]}>("/api/config?entity=rules&filter=PAINT_CAPACITY",{cache:"no-store"}),
        apiJson<{rows:RuleRow[]}>("/api/config?entity=rules&filter=MANUAL_CAPACITY",{cache:"no-store"}),
      ]);
      const sr = a.rows.filter(x=>x.category === "CAPACITY_MODEL");
      const rr = b.rows.filter(x=>x.category === "CAPACITY_RESOURCE");
      const pr = c.rows.filter(x=>x.rule_type === "PAINT_CAPACITY");
      const mr = d.rows.filter(x=>x.rule_type === "MANUAL_CAPACITY");
      setSettings(sr); setResources(rr); setPaintRules(pr); setManualRules(mr);
      setEdit(Object.fromEntries(sr.map(x=>[x.setting_key,displayValue(x.value_json)])));
      setResourceEdit(Object.fromEntries(rr.map(x=>[x.id,JSON.stringify(x.data,null,2)])));
      setRuleConditionEdit(Object.fromEntries([...pr,...mr].map(x=>[x.id,JSON.stringify(x.condition_json,null,2)])));
      setRuleActionEdit(Object.fromEntries([...pr,...mr].map(x=>[x.id,JSON.stringify(x.action_json,null,2)])));
    }catch(e){ setError(e instanceof Error ? e.message : String(e)); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ void load(); },[]);

  async function saveSetting(r:SettingRow){
    setError(""); setMessage("");
    try{
      const value = parseValue(edit[r.setting_key] ?? "", r.data_type);
      await apiJson("/api/config",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity:"settings",action:"upsert",row:{settingKey:r.setting_key,category:r.category,label:r.label,dataType:r.data_type,value,enabled:r.enabled,description:r.description}})});
      setMessage(`${r.label} saved.`); await load();
    }catch(e){ setError(e instanceof Error ? e.message : String(e)); }
  }
  async function saveResource(r:ItemRow){
    setError(""); setMessage("");
    try{
      const data = JSON.parse(resourceEdit[r.id] || "{}");
      await apiJson("/api/config",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity:"items",action:"upsert",row:{category:r.category,code:r.code,label:r.label,parentCode:null,enabled:r.enabled,sortOrder:r.sort_order,data}})});
      setMessage(`${r.label} capacity saved.`); await load();
    }catch(e){ setError(e instanceof Error ? e.message : String(e)); }
  }
  async function saveRule(r:RuleRow){
    setError(""); setMessage("");
    try{
      const condition = JSON.parse(ruleConditionEdit[r.id] || "{}");
      const action = JSON.parse(ruleActionEdit[r.id] || "{}");
      await apiJson("/api/config",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity:"rules",action:"upsert",row:{ruleType:r.rule_type,code:r.code,name:r.name,enabled:r.enabled,priority:r.priority,condition,action,notes:r.notes}})});
      setMessage(`${r.name} saved.`); await load();
    }catch(e){ setError(e instanceof Error ? e.message : String(e)); }
  }

  return <div className="stack">
    {error?<div className="alert error"><strong>Capacity configuration error</strong><span>{error}</span></div>:null}
    {message?<div className="alert success"><strong>{message}</strong></div>:null}

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">CFG-95 / FINITE CAPACITY</span><h2>Capacity Scheduler Settings</h2></div><button className="button" onClick={()=>void load()}>Refresh</button></div>
      <div className="output-config-note"><strong>Configuration-first scheduling · v022 Critical Path + Bottleneck + Recovery active</strong><span>Chemical Line, Painting, Masking/Unmasking and manpower remain finite-capacity constrained. Every Main Operation batch starts only after all member Jobs are route-ready. v022 keeps the complete batch-to-batch Job dependency graph and Smart Batch Split, then calculates critical Job routes, ranks capacity/readiness bottlenecks, and can re-simulate priority recovery options without writing them into the real plan.</span></div>
      <div className="table-wrap"><table className="erp-table"><thead><tr><th>Setting</th><th>Key</th><th>Type</th><th>Value</th><th>Description</th><th></th></tr></thead><tbody>{loading?<tr><td colSpan={6} className="loading-cell">Loading capacity settings…</td></tr>:settings.map(r=><tr key={r.setting_key}><td><strong>{r.label}</strong></td><td><code>{r.setting_key}</code></td><td>{r.data_type}</td><td>{r.data_type==="boolean"?<select value={edit[r.setting_key]??"false"} onChange={e=>setEdit(x=>({...x,[r.setting_key]:e.target.value}))}><option value="true">true</option><option value="false">false</option></select>:r.setting_key==="capacity.unmappedResourcePolicy"?<select value={edit[r.setting_key]??"REVIEW_UNCONSTRAINED"} onChange={e=>setEdit(x=>({...x,[r.setting_key]:e.target.value}))}><option value="REVIEW_UNCONSTRAINED">REVIEW_UNCONSTRAINED</option><option value="BLOCK">BLOCK</option></select>:<input value={edit[r.setting_key]??""} onChange={e=>setEdit(x=>({...x,[r.setting_key]:e.target.value}))}/>}</td><td><span className="subcell output-config-description">{r.description||"—"}</span></td><td><button className="button" onClick={()=>void saveSetting(r)}>Save</button></td></tr>)}</tbody></table></div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">PAINT CAPACITY RULES</span><h2>Cabin Eligibility & Segment Overrides</h2><p className="subcell">Rules are evaluated by priority. Conditions can target Main Operation and Recipe No.; actions can override allowed cabins and Setup / Flash / Cure / Release times without changing code.</p></div><span className="record-count"><strong>{paintRules.length}</strong> rules</span></div>
      <div className="table-wrap tall"><table className="erp-table compact"><thead><tr><th>Rule</th><th>Priority</th><th>Condition JSON</th><th>Action JSON</th><th>Notes</th><th></th></tr></thead><tbody>{paintRules.length?paintRules.map(r=><tr key={r.id}><td><strong>{r.name}</strong><small className="subcell mono">{r.code}</small></td><td className="num">{r.priority}</td><td><textarea className="capacity-json small" value={ruleConditionEdit[r.id]??"{}"} onChange={e=>setRuleConditionEdit(x=>({...x,[r.id]:e.target.value}))}/></td><td><textarea className="capacity-json small" value={ruleActionEdit[r.id]??"{}"} onChange={e=>setRuleActionEdit(x=>({...x,[r.id]:e.target.value}))}/></td><td><span className="subcell">{r.notes||"—"}</span></td><td><button className="button" onClick={()=>void saveRule(r)}>Save</button></td></tr>):<tr><td colSpan={6} className="empty-state">No PAINT_CAPACITY rules. Run v019 SQL seed.</td></tr>}</tbody></table></div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">MANUAL CAPACITY RULES</span><h2>Masking / Unmasking Manpower & Workstation Rules</h2><p className="subcell">Rules are evaluated by priority. Conditions can target Main Operation and source Operation Code. Actions can set station resource, labor pool, setup/release time, parallel permission, maximum operators, allocation threshold and parallel efficiency.</p></div><span className="record-count"><strong>{manualRules.length}</strong> rules</span></div>
      <div className="table-wrap tall"><table className="erp-table compact"><thead><tr><th>Rule</th><th>Priority</th><th>Condition JSON</th><th>Action JSON</th><th>Notes</th><th></th></tr></thead><tbody>{manualRules.length?manualRules.map(r=><tr key={r.id}><td><strong>{r.name}</strong><small className="subcell mono">{r.code}</small></td><td className="num">{r.priority}</td><td><textarea className="capacity-json small" value={ruleConditionEdit[r.id]??"{}"} onChange={e=>setRuleConditionEdit(x=>({...x,[r.id]:e.target.value}))}/></td><td><textarea className="capacity-json small" value={ruleActionEdit[r.id]??"{}"} onChange={e=>setRuleActionEdit(x=>({...x,[r.id]:e.target.value}))}/></td><td><span className="subcell">{r.notes||"—"}</span></td><td><button className="button" onClick={()=>void saveRule(r)}>Save</button></td></tr>):<tr><td colSpan={6} className="empty-state">No MANUAL_CAPACITY rules. Run v020 SQL seed.</td></tr>}</tbody></table></div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">RESOURCE CAPACITY MASTER</span><h2>Physical Slots & Shared Concurrency</h2></div><span className="record-count"><strong>{resources.length}</strong> resources</span></div>
      <div className="table-wrap tall"><table className="erp-table compact"><thead><tr><th>Resource</th><th>Order</th><th>Capacity JSON</th><th></th></tr></thead><tbody>{resources.map(r=><tr key={r.id}><td><strong>{r.label}</strong><small className="subcell mono">{r.code}</small></td><td className="num">{r.sort_order}</td><td><textarea className="capacity-json" value={resourceEdit[r.id]??"{}"} onChange={e=>setResourceEdit(x=>({...x,[r.id]:e.target.value}))}/></td><td><button className="button" onClick={()=>void saveResource(r)}>Save</button></td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
