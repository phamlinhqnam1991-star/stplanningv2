-- ST Planning v019 verification — 6 queries.
SELECT setting_key,value_json FROM config_settings WHERE setting_key LIKE 'capacity.painting%' ORDER BY setting_key;
SELECT code,name,enabled,priority,condition_json,action_json FROM config_rules WHERE rule_type='PAINT_CAPACITY' ORDER BY priority,code;
SELECT code,label,data FROM config_items WHERE category='CAPACITY_RESOURCE' AND code IN ('CAB1','CAB2','CAB3','CAB4') ORDER BY code;
SELECT from_code AS main_operation,to_code AS resource_code,sort_order FROM config_links WHERE link_type='MAIN_TO_RESOURCE' AND to_code IN ('CAB1','CAB2','CAB3','CAB4') ORDER BY from_code,sort_order;
SELECT code,label,data->>'recipeNo' AS recipe_no,data->>'recipeName' AS recipe_name,data->'stagesMinutes' AS stages FROM config_items WHERE category='RECIPE' AND COALESCE(data->>'paintType','')<>'' ORDER BY sort_order,code LIMIT 50;
SELECT setting_key,value_json FROM config_settings WHERE setting_key='stOutput.timeModelVersion';
