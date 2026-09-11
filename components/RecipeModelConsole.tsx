"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api-client";

type Row = Record<string, unknown>;
type Tab = "recipes" | "recipeRules" | "processTime" | "processRules";

type Payload = {
  recipes: Row[];
  recipeFields: Row[];
  processProfiles: Row[];
  processFields: Row[];
  recipeRules: Row[];
  processTimeRules: Row[];
  mainOperations: Row[];
  settings: Record<string, unknown>;
  summary: {
    recipes: number; recipeReview: number; recipeRules: number;
    processProfiles: number; processTimeRules: number; processTimeEnabled: number;
  };
};

const emptyRecipe = {
  code:"", label:"", enabled:true, sortOrder:100,
  recipeGroup:"", area:"", paintType:"", defaultProcessTimeMinutes:"",
  temperatureC:"", needsReview:false, aliasesText:"",
};

const emptyRule = {
  code:"", name:"", enabled:true, priority:100,
  conditionText:"{}", actionText:"{}", notes:"",
};

function obj(v: unknown): Row {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
}
function text(v: unknown) { return v == null ? "" : String(v); }
function fmtMinutes(v: unknown) {
  const n=Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n >= 60) return `${(n/60).toFixed(n%60===0?0:2)} h · ${n.toLocaleString()} min`;
  return `${n.toLocaleString()} min`;
}
function parseJson(value:string) {
  const parsed=JSON.parse(value || "{}");
  if (!parsed || typeof parsed!=="object" || Array.isArray(parsed)) throw new Error("JSON value must be an object.");
  return parsed as Row;
}

export function RecipeModelConsole() {
  const [data,setData]=useState<Payload|null>(null);
  const [tab,setTab]=useState<Tab>("recipes");
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [recipe,setRecipe]=useState({...emptyRecipe});
  const [rule,setRule]=useState({...emptyRule});
  const [selectedRecipe,setSelectedRecipe]=useState("");
  const [selectedRule,setSelectedRule]=useState("");

  const load=useCallback(async()=>{
    setLoading(true); setError("");
    try { setData(await apiJson<Payload>("/api/config/recipe-model",{cache:"no-store"})); }
    catch(e){ setError(e instanceof Error?e.message:String(e)); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{ void load(); },[load]);

  const recipes=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return (data?.recipes||[]).filter((r)=>{
      if(!q) return true;
      const d=obj(r.data);
      return [r.code,r.label,d.recipeGroup,d.area,d.paintType,...(Array.isArray(d.aliases)?d.aliases:[])].some((x)=>text(x).toLowerCase().includes(q));
    });
  },[data,search]);

  const currentRules = tab==="processRules" ? (data?.processTimeRules||[]) : (data?.recipeRules||[]);
  const filteredRules=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return currentRules.filter((r)=>!q || [r.code,r.name,r.notes,JSON.stringify(r.condition_json),JSON.stringify(r.action_json)].some((x)=>text(x).toLowerCase().includes(q)));
  },[currentRules,search]);

  function editRecipe(row:Row){
    const d=obj(row.data);
    setSelectedRecipe(text(row.code));
    setRecipe({
      code:text(row.code),label:text(row.label),enabled:row.enabled!==false,sortOrder:Number(row.sort_order||100),
      recipeGroup:text(d.recipeGroup),area:text(d.area),paintType:text(d.paintType),
      defaultProcessTimeMinutes:d.defaultProcessTimeMinutes==null?"":text(d.defaultProcessTimeMinutes),
      temperatureC:d.temperatureC==null?"":text(d.temperatureC),
      needsReview:Boolean(d.needsReview),
      aliasesText:Array.isArray(d.aliases)?d.aliases.map(text).join("\\n"):"",
    });
  }
  function newRecipe(){ setSelectedRecipe(""); setRecipe({...emptyRecipe}); }
  function editRule(row:Row){
    setSelectedRule(text(row.code));
    setRule({
      code:text(row.code),name:text(row.name),enabled:row.enabled!==false,priority:Number(row.priority||100),
      conditionText:JSON.stringify(row.condition_json||{},null,2),
      actionText:JSON.stringify(row.action_json||{},null,2),
      notes:text(row.notes),
    });
  }
  function newRule(){ setSelectedRule(""); setRule({...emptyRule}); }

  async function saveRecipe(){
    if(!recipe.code.trim()||!recipe.label.trim()) return;
    setSaving(true);setError("");setMessage("");
    try{
      await apiJson("/api/config/recipe-model",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        action:"saveItem",row:{
          category:"RECIPE",code:recipe.code.trim(),label:recipe.label.trim(),enabled:recipe.enabled,sortOrder:recipe.sortOrder,
          data:{
            recipeNo:recipe.code.trim(),recipeName:recipe.label.trim(),recipeGroup:recipe.recipeGroup.trim(),
            area:recipe.area.trim(),paintType:recipe.paintType.trim(),
            defaultProcessTimeMinutes:recipe.defaultProcessTimeMinutes===""?null:Number(recipe.defaultProcessTimeMinutes),
            temperatureC:recipe.temperatureC===""?null:recipe.temperatureC,
            needsReview:recipe.needsReview,
            aliases:recipe.aliasesText.split(/\\r?\\n/).map((x)=>x.trim()).filter(Boolean),
            userEdited:true,
          }
        }
      })});
      setMessage("Recipe saved."); setSelectedRecipe(recipe.code.trim()); await load();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setSaving(false);}
  }

  async function saveRule(){
    if(!rule.code.trim()||!rule.name.trim()) return;
    setSaving(true);setError("");setMessage("");
    try{
      const ruleType=tab==="processRules"?"PROCESS_TIME":"RECIPE";
      await apiJson("/api/config/recipe-model",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        action:"saveRule",row:{
          ruleType,code:rule.code.trim(),name:rule.name.trim(),enabled:rule.enabled,priority:rule.priority,
          condition:parseJson(rule.conditionText),action:parseJson(rule.actionText),notes:rule.notes||null
        }
      })});
      setMessage(`${ruleType.replaceAll("_"," ")} rule saved.`); setSelectedRule(rule.code.trim()); await load();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setSaving(false);}
  }

  const processRecipeRows=useMemo(()=>recipes.filter((r)=>obj(r.data).defaultProcessTimeMinutes!=null),[recipes]);

  return <div className="stack recipe-model-console">
    <section className="panel recipe-model-hero">
      <div><span className="eyebrow">CFG-92 · RECIPE & TIME ENGINE</span><h2>Recipe / Process Time Workbench</h2><p>v017 activates a complete editable timing baseline: source/recipe time first, operation standards second, and conservative Main Operation fallback last. Masking/unmasking source standards are treated as minutes per piece; Qty/Surface tiers are active for paint.</p></div>
      <div className="config-principles"><span>RECIPE MASTER</span><span>RULE DRIVEN</span><span>TIME CONFIG</span></div>
    </section>

    {error?<div className="alert error"><strong>Recipe Model error</strong><span>{error}</span></div>:null}
    {message?<div className="alert success"><strong>{message}</strong></div>:null}

    <section className="kpi-grid recipe-kpis">
      <article className="kpi-card"><span>RECIPES</span><strong>{data?.summary.recipes??0}</strong><small>Source + discovered identifiers</small></article>
      <article className="kpi-card"><span>REVIEW</span><strong>{data?.summary.recipeReview??0}</strong><small>Missing/conflicting source details</small></article>
      <article className="kpi-card"><span>RECIPE RULES</span><strong>{data?.summary.recipeRules??0}</strong><small>Main Operation selectors</small></article>
      <article className="kpi-card"><span>TIME RULES</span><strong>{data?.summary.processTimeRules??0}</strong><small>{data?.summary.processTimeEnabled??0} currently enabled</small></article>
    </section>

    <section className="panel">
      <div className="config-tabs recipe-tabs">
        <button className={tab==="recipes"?"active":""} onClick={()=>{setTab("recipes");setSearch("");}}><strong>Recipe Master</strong><small>NO / NAME</small></button>
        <button className={tab==="recipeRules"?"active":""} onClick={()=>{setTab("recipeRules");setSearch("");newRule();}}><strong>Recipe Rules</strong><small>SELECTOR</small></button>
        <button className={tab==="processTime"?"active":""} onClick={()=>{setTab("processTime");setSearch("");}}><strong>Process Time</strong><small>DEFAULTS</small></button>
        <button className={tab==="processRules"?"active":""} onClick={()=>{setTab("processRules");setSearch("");newRule();}}><strong>Process Time Rules</strong><small>CALCULATION</small></button>
      </div>
      <div className="config-search recipe-search"><input placeholder="Search recipe, rule, group, area…" value={search} onChange={(e)=>setSearch(e.target.value)}/><button className="button" onClick={()=>void load()}>Refresh</button></div>
    </section>

    {tab==="recipes"?<section className="recipe-workbench-grid">
      <div className="panel">
        <div className="panel-head"><div><span className="eyebrow">RECIPE MASTER</span><h2>{loading?"Loading…":`${recipes.length} Recipes`}</h2></div><button className="button" onClick={newRecipe}>New</button></div>
        <div className="table-wrap recipe-master-wrap"><table className="data-table recipe-master-table"><thead><tr><th>Recipe No.</th><th>Recipe Name</th><th>Group</th><th>Area</th><th>Default Time</th><th>State</th></tr></thead><tbody>
          {recipes.map((r)=>{const d=obj(r.data);return <tr key={text(r.code)} className={Boolean(d.needsReview)?"row-warning":""} onClick={()=>editRecipe(r)}>
            <td><strong className="mono">{text(r.code)}</strong></td><td><strong>{text(r.label)}</strong><small className="cell-subtext">{Array.isArray(d.aliases)&&d.aliases.length?`${d.aliases.length} alias(es)`:""}</small></td>
            <td>{text(d.recipeGroup)||"—"}</td><td>{text(d.area)||"—"}</td><td>{fmtMinutes(d.defaultProcessTimeMinutes)}</td>
            <td>{Boolean(d.needsReview)?<span className="state-pill review">REVIEW</span>:<span className="state-pill good">READY</span>}</td>
          </tr>})}
        </tbody></table></div>
      </div>
      <div className="panel recipe-editor">
        <div className="panel-head"><div><span className="eyebrow">RECIPE EDITOR</span><h2>{selectedRecipe?"Edit Recipe":"New Recipe"}</h2></div><span className="badge neutral">CONFIG ITEM</span></div>
        <div className="config-form-grid compact-form">
          <label><span>Recipe No.</span><input readOnly={Boolean(selectedRecipe)} className={selectedRecipe?"config-key-locked":""} value={recipe.code} onChange={(e)=>setRecipe((x)=>({...x,code:e.target.value}))}/></label>
          <label><span>Recipe Name</span><input value={recipe.label} onChange={(e)=>setRecipe((x)=>({...x,label:e.target.value}))}/></label>
          <label><span>Recipe Group</span><input value={recipe.recipeGroup} onChange={(e)=>setRecipe((x)=>({...x,recipeGroup:e.target.value}))}/></label>
          <label><span>Area</span><input value={recipe.area} onChange={(e)=>setRecipe((x)=>({...x,area:e.target.value}))}/></label>
          <label><span>Paint Type</span><input value={recipe.paintType} onChange={(e)=>setRecipe((x)=>({...x,paintType:e.target.value}))}/></label>
          <label><span>Default Process Time (min)</span><input type="number" step="0.01" value={recipe.defaultProcessTimeMinutes} onChange={(e)=>setRecipe((x)=>({...x,defaultProcessTimeMinutes:e.target.value}))}/></label>
          <label><span>Temperature °C</span><input value={recipe.temperatureC} onChange={(e)=>setRecipe((x)=>({...x,temperatureC:e.target.value}))}/></label>
          <label className="config-check"><input type="checkbox" checked={recipe.enabled} onChange={(e)=>setRecipe((x)=>({...x,enabled:e.target.checked}))}/><span>Enabled</span></label>
          <label className="config-check"><input type="checkbox" checked={recipe.needsReview} onChange={(e)=>setRecipe((x)=>({...x,needsReview:e.target.checked}))}/><span>Needs Review</span></label>
          <label className="config-json"><span>Aliases · one per line</span><textarea rows={8} value={recipe.aliasesText} onChange={(e)=>setRecipe((x)=>({...x,aliasesText:e.target.value}))}/></label>
        </div>
        <div className="command-bar"><button className="button primary" disabled={saving} onClick={()=>void saveRecipe()}>{saving?"Saving…":"Save Recipe"}</button><span className="muted">Existing source metadata not shown here is preserved by JSON merge.</span></div>
      </div>
    </section>:null}

    {tab==="recipeRules"||tab==="processRules"?<section className="recipe-workbench-grid">
      <div className="panel">
        <div className="panel-head"><div><span className="eyebrow">{tab==="recipeRules"?"RECIPE RULES":"PROCESS TIME RULES"}</span><h2>{filteredRules.length} Rules</h2></div><button className="button" onClick={newRule}>New</button></div>
        <div className="table-wrap rule-wrap"><table className="data-table"><thead><tr><th>Priority</th><th>Code / Name</th><th>Condition</th><th>Action</th><th>State</th></tr></thead><tbody>
          {filteredRules.map((r)=><tr key={text(r.code)} className={r.enabled===false?"row-muted":""} onClick={()=>editRule(r)}>
            <td>{Number(r.priority||100)}</td><td><strong>{text(r.code)}</strong><small className="cell-subtext">{text(r.name)}</small></td>
            <td><code className="json-snippet">{JSON.stringify(r.condition_json||{})}</code></td><td><code className="json-snippet">{JSON.stringify(r.action_json||{})}</code></td>
            <td>{r.enabled!==false?<span className="state-pill good">ENABLED</span>:<span className="state-pill neutral">DISABLED</span>}</td>
          </tr>)}
        </tbody></table></div>
      </div>
      <div className="panel recipe-editor">
        <div className="panel-head"><div><span className="eyebrow">RULE EDITOR</span><h2>{selectedRule?"Edit Rule":"New Rule"}</h2></div><span className="badge neutral">{tab==="recipeRules"?"RECIPE":"PROCESS_TIME"}</span></div>
        <div className="config-form-grid compact-form">
          <label><span>Rule Code</span><input readOnly={Boolean(selectedRule)} className={selectedRule?"config-key-locked":""} value={rule.code} onChange={(e)=>setRule((x)=>({...x,code:e.target.value.toUpperCase()}))}/></label>
          <label><span>Rule Name</span><input value={rule.name} onChange={(e)=>setRule((x)=>({...x,name:e.target.value}))}/></label>
          <label><span>Priority</span><input type="number" value={rule.priority} onChange={(e)=>setRule((x)=>({...x,priority:Number(e.target.value)}))}/></label>
          <label className="config-check"><input type="checkbox" checked={rule.enabled} onChange={(e)=>setRule((x)=>({...x,enabled:e.target.checked}))}/><span>Enabled</span></label>
          <label className="config-json"><span>Condition (JSON)</span><textarea rows={9} value={rule.conditionText} onChange={(e)=>setRule((x)=>({...x,conditionText:e.target.value}))} spellCheck={false}/></label>
          <label className="config-json"><span>Action (JSON)</span><textarea rows={12} value={rule.actionText} onChange={(e)=>setRule((x)=>({...x,actionText:e.target.value}))} spellCheck={false}/></label>
          <label className="config-json"><span>Notes</span><textarea rows={4} value={rule.notes} onChange={(e)=>setRule((x)=>({...x,notes:e.target.value}))}/></label>
        </div>
        <div className="command-bar"><button className="button primary" disabled={saving} onClick={()=>void saveRule()}>{saving?"Saving…":"Save Rule"}</button><span className="muted">Rules are priority ordered; lower number is evaluated first.</span></div>
      </div>
    </section>:null}

    {tab==="processTime"?<div className="stack">
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">RECIPE PROCESS TIME</span><h2>{processRecipeRows.length} Recipes with Source Duration</h2></div><span className="badge neutral">STRecipe Duration → Minutes</span></div>
        <div className="table-wrap process-time-wrap"><table className="data-table"><thead><tr><th>Recipe No.</th><th>Recipe Name</th><th>Group</th><th>Default Process Time</th><th>Temperature</th><th>Stages</th></tr></thead><tbody>
          {processRecipeRows.map((r)=>{const d=obj(r.data);const stages=obj(d.stagesMinutes);return <tr key={text(r.code)} onClick={()=>{editRecipe(r);setTab("recipes");}}>
            <td><strong className="mono">{text(r.code)}</strong></td><td>{text(r.label)}</td><td>{text(d.recipeGroup)||"—"}</td><td><strong>{fmtMinutes(d.defaultProcessTimeMinutes)}</strong></td>
            <td>{d.temperatureC==null?"—":`${text(d.temperatureC)} °C`}</td>
            <td><div className="time-stage-row">{Object.entries(stages).filter(([,v])=>v!=null).map(([k,v])=><span key={k}>{k}<b>{fmtMinutes(v)}</b></span>)}</div></td>
          </tr>})}
        </tbody></table></div>
      </section>
      <section className="recipe-workbench-grid">
        <div className="panel"><div className="panel-head"><div><span className="eyebrow">PROCESS TIME PROFILES</span><h2>{data?.processProfiles.length??0} Profiles</h2></div></div>
          <div className="config-record-list">{data?.processProfiles.map((p)=><div className="config-record static-record" key={text(p.code)}><span><strong>{text(p.code)}</strong><small>{text(p.label)}</small></span><code>{JSON.stringify(p.data||{})}</code></div>)}</div>
        </div>
        <div className="panel"><div className="panel-head"><div><span className="eyebrow">SOURCE TIME FIELDS</span><h2>{data?.processFields.length??0} Fields</h2></div></div>
          <div className="table-wrap source-field-wrap"><table className="data-table"><thead><tr><th>Code</th><th>Column</th><th>Unit</th><th>Source Header</th></tr></thead><tbody>{data?.processFields.map((f)=>{const d=obj(f.data);return <tr key={text(f.code)} className={Boolean(d.needsReview)?"row-warning":""}><td><strong>{text(f.code)}</strong></td><td className="mono">{text(d.sourceColumn)}</td><td>{text(d.unit)||"—"}</td><td>{text(d.sourceHeader)}</td></tr>})}</tbody></table></div>
        </div>
      </section>
    </div>:null}

    <section className="panel config-source-footer">
      <div><span className="eyebrow">SOURCE FIELD CATALOG</span><strong>{data?.recipeFields.length??0} recipe selectors · {data?.processFields.length??0} time fields</strong></div>
      <div className="chip-row">{data?.recipeFields.slice(0,12).map((f)=>{const d=obj(f.data);return <span className="mini-chip" key={text(f.code)} title={text(d.sourceHeader)}>{text(f.code)} · {text(d.sourceColumn)}</span>})}{(data?.recipeFields.length||0)>12?<span className="mini-chip">+{(data?.recipeFields.length||0)-12}</span>:null}</div>
    </section>
  </div>;
}
