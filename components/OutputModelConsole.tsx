"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";

type SettingRow={setting_key:string;category:string;label:string;data_type:string;value_json:unknown;enabled:boolean;description:string|null};
type ItemRow={id:string;category:string;code:string;label:string;enabled:boolean;sort_order:number;data:Record<string,unknown>};
function displayValue(v:unknown){return typeof v==="string"?v:JSON.stringify(v??null)}
function parseValue(text:string,type:string):unknown{if(type==="boolean")return text==="true";if(type==="number"){const n=Number(text);if(!Number.isFinite(n))throw new Error("Enter a valid number.");return n}if(type==="json")return JSON.parse(text);return text}

export function OutputModelConsole(){
  const[rows,setRows]=useState<SettingRow[]>([]);const[statuses,setStatuses]=useState<ItemRow[]>([]);const[edit,setEdit]=useState<Record<string,string>>({});const[loading,setLoading]=useState(true);const[error,setError]=useState("");const[message,setMessage]=useState("");
  async function load(){setLoading(true);setError("");try{const[a,b]=await Promise.all([apiJson<{rows:SettingRow[]}>("/api/config?entity=settings&filter=ST_OUTPUT",{cache:"no-store"}),apiJson<{rows:ItemRow[]}>("/api/config?entity=items&filter=ST_OUTPUT_STATUS",{cache:"no-store"})]);setRows(a.rows.filter(r=>r.category==="ST_OUTPUT_MODEL"));setStatuses(b.rows.filter(r=>r.category==="ST_OUTPUT_STATUS"));setEdit(Object.fromEntries(a.rows.filter(r=>r.category==="ST_OUTPUT_MODEL").map(r=>[r.setting_key,displayValue(r.value_json)])))}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}}
  useEffect(()=>{void load()},[]);
  async function save(r:SettingRow){setError("");setMessage("");try{const value=parseValue(edit[r.setting_key]??"",r.data_type);await apiJson("/api/config",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity:"settings",action:"upsert",row:{settingKey:r.setting_key,category:r.category,label:r.label,dataType:r.data_type,value,enabled:r.enabled,description:r.description}})});setMessage(`${r.label} saved.`);await load()}catch(e){setError(e instanceof Error?e.message:String(e))}}
  return <div className="stack">
    {error?<div className="alert error"><strong>Configuration error</strong><span>{error}</span></div>:null}{message?<div className="alert success"><strong>{message}</strong></div>:null}
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">CFG-94 / ENGINE SETTINGS</span><h2>ST Output Target Model</h2></div><button className="button" onClick={()=>void load()}>Refresh</button></div>
      <div className="output-config-note"><strong>Calculation boundary</strong><span>NextOperation is the current route position. The engine calculates every remaining operation up to (but not including) the configured Final ST operation, then compares the FINSST arrival ETA with the cutoff.</span></div>
      <div className="table-wrap"><table className="erp-table"><thead><tr><th>Setting</th><th>Key</th><th>Type</th><th>Value</th><th>Description</th><th></th></tr></thead><tbody>{loading?<tr><td colSpan={6} className="loading-cell">Loading ST Output settings…</td></tr>:rows.map(r=><tr key={r.setting_key}><td><strong>{r.label}</strong></td><td><code>{r.setting_key}</code></td><td>{r.data_type}</td><td>{r.data_type==="boolean"?<select value={edit[r.setting_key]??"false"} onChange={e=>setEdit(x=>({...x,[r.setting_key]:e.target.value}))}><option value="true">true</option><option value="false">false</option></select>:r.setting_key==="stOutput.unknownStepPolicy"?<select value={edit[r.setting_key]??"REVIEW_ZERO"} onChange={e=>setEdit(x=>({...x,[r.setting_key]:e.target.value}))}><option value="REVIEW_ZERO">REVIEW_ZERO</option><option value="BLOCK">BLOCK</option></select>:<input value={edit[r.setting_key]??""} onChange={e=>setEdit(x=>({...x,[r.setting_key]:e.target.value}))}/>}</td><td><span className="subcell output-config-description">{r.description||"—"}</span></td><td><button className="button" onClick={()=>void save(r)}>Save</button></td></tr>)}</tbody></table></div>
    </section>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">STATUS MASTER</span><h2>ST Output Statuses</h2></div><span className="record-count"><strong>{statuses.length}</strong> statuses</span></div><div className="table-wrap"><table className="erp-table compact"><thead><tr><th>Order</th><th>Code</th><th>Label</th><th>Configuration</th></tr></thead><tbody>{statuses.map(s=><tr key={s.code}><td>{s.sort_order}</td><td><strong className="mono">{s.code}</strong></td><td>{s.label}</td><td><code>{JSON.stringify(s.data)}</code></td></tr>)}</tbody></table></div></section>
  </div>
}
