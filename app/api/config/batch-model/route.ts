import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jsonObject = z.record(z.string(), z.unknown()).default({});
const itemSchema = z.object({
  category: z.enum(["BATCH_KEY_FIELD","BATCH_STATUS"]),
  code: z.string().min(1).max(200), label: z.string().min(1).max(300), enabled: z.boolean().default(true),
  sortOrder: z.number().int().default(0), data: jsonObject,
});
const ruleSchema = z.object({
  code:z.string().min(1).max(200),name:z.string().min(1).max(300),enabled:z.boolean().default(true),priority:z.number().int().default(100),
  condition:jsonObject,action:jsonObject,notes:z.string().max(4000).nullable().optional(),
});
const settingSchema = z.object({ settingKey:z.string().min(1).max(200),label:z.string().min(1).max(300),value:z.unknown(),dataType:z.string().min(1).max(50).default("json"),description:z.string().max(2000).nullable().optional() });
function json(value: unknown) { return JSON.stringify(value ?? {}); }

export async function GET() {
  try {
    const result = await query(`
      SELECT
        COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.category,i.sort_order,i.code) FROM config_items i WHERE i.category=ANY($1::text[])),'[]'::jsonb) AS items,
        COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.priority,r.code) FROM config_rules r WHERE r.rule_type='BATCH'),'[]'::jsonb) AS rules,
        COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY COALESCE((m.data->>'planningOrder')::int,m.sort_order),m.code) FROM config_items m WHERE m.category='MAIN_OPERATION' AND m.enabled=true),'[]'::jsonb) AS main_operations,
        COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.setting_key) FROM config_settings s WHERE s.category='BATCH_MODEL'),'[]'::jsonb) AS settings`,
      [["BATCH_KEY_FIELD","BATCH_STATUS"]]
    );
    const row = result.rows[0] || {};
    const items = Array.isArray(row.items) ? row.items : [];
    const rules = Array.isArray(row.rules) ? row.rules : [];
    return NextResponse.json({
      keyFields:items.filter((x:Record<string,unknown>)=>x.category==="BATCH_KEY_FIELD"),
      statuses:items.filter((x:Record<string,unknown>)=>x.category==="BATCH_STATUS"),
      rules, mainOperations:row.main_operations||[], settings:row.settings||[],
      summary:{ keyFields:items.filter((x:Record<string,unknown>)=>x.category==="BATCH_KEY_FIELD").length, rules:rules.length, statuses:items.filter((x:Record<string,unknown>)=>x.category==="BATCH_STATUS").length },
    });
  } catch (error) {
    const message=error instanceof Error?error.message:"Unable to load Batch Model.";
    return NextResponse.json({error:message},{status:500});
  }
}

export async function POST(request: Request) {
  try {
    const raw=await request.json();
    const action=z.enum(["saveItem","saveRule","saveSetting","deleteItem","deleteRule"]).parse(raw.action);
    if(action==="saveItem"){
      const x=itemSchema.parse(raw.row);
      await query(`INSERT INTO config_items(category,code,label,enabled,sort_order,data) VALUES($1,$2,$3,$4,$5,$6::jsonb)
        ON CONFLICT(category,code) DO UPDATE SET label=EXCLUDED.label,enabled=EXCLUDED.enabled,sort_order=EXCLUDED.sort_order,data=EXCLUDED.data,updated_at=now()`,
        [x.category,x.code,x.label,x.enabled,x.sortOrder,json(x.data)]);
      return NextResponse.json({ok:true});
    }
    if(action==="saveRule"){
      const x=ruleSchema.parse(raw.row);
      await query(`INSERT INTO config_rules(rule_type,code,name,enabled,priority,condition_json,action_json,notes) VALUES('BATCH',$1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)
        ON CONFLICT(rule_type,code) DO UPDATE SET name=EXCLUDED.name,enabled=EXCLUDED.enabled,priority=EXCLUDED.priority,condition_json=EXCLUDED.condition_json,action_json=EXCLUDED.action_json,notes=EXCLUDED.notes,updated_at=now()`,
        [x.code,x.name,x.enabled,x.priority,json(x.condition),json(x.action),x.notes??null]);
      return NextResponse.json({ok:true});
    }
    if(action==="saveSetting"){
      const x=settingSchema.parse(raw.row);
      await query(`INSERT INTO config_settings(setting_key,category,label,data_type,value_json,enabled,description) VALUES($1,'BATCH_MODEL',$2,$3,$4::jsonb,true,$5)
        ON CONFLICT(setting_key) DO UPDATE SET label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,description=EXCLUDED.description,enabled=true,updated_at=now()`,
        [x.settingKey,x.label,x.dataType,json(x.value),x.description??null]);
      return NextResponse.json({ok:true});
    }
    if(action==="deleteItem"){
      const category=z.enum(["BATCH_KEY_FIELD","BATCH_STATUS"]).parse(raw.category); const code=z.string().min(1).parse(raw.code);
      await query(`DELETE FROM config_items WHERE category=$1 AND code=$2`,[category,code]);
      return NextResponse.json({ok:true});
    }
    const code=z.string().min(1).parse(raw.code); await query(`DELETE FROM config_rules WHERE rule_type='BATCH' AND code=$1`,[code]);
    return NextResponse.json({ok:true});
  } catch(error){
    const message=error instanceof Error?error.message:"Unable to save Batch Model.";
    return NextResponse.json({error:message},{status:400});
  }
}
