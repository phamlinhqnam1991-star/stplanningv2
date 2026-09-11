-- ST Planning v017 — verification only. 6 queries.

SELECT code,label,data
FROM config_items
WHERE category='PROCESS_TIME_PROFILE'
  AND code IN ('SOURCE_BATCH_MINUTES_BY_QTY','SOURCE_MIN_PER_PIECE','QTY_SURFACE_TIERS','RECIPE_PLUS_OVERHEAD','MAIN_FIXED_FALLBACK','FIXED_MIN_PER_PIECE')
ORDER BY sort_order,code;

SELECT code,name,priority,condition_json,action_json
FROM config_rules
WHERE rule_type='PROCESS_TIME' AND enabled=true
ORDER BY priority,code;

SELECT code,name,priority,condition_json,action_json
FROM config_rules
WHERE rule_type='BATCH' AND enabled=true
ORDER BY priority,code;

SELECT code,label,data
FROM config_items
WHERE category='CAPACITY_RESOURCE'
ORDER BY sort_order,code;

SELECT m.code AS main_operation,
       m.data->>'scheduleEnabled' AS schedule_enabled,
       m.data->>'batchEnabled' AS batch_enabled,
       COALESCE(jsonb_agg(jsonb_build_object('resource',l.to_code,'sort',l.sort_order) ORDER BY l.sort_order) FILTER (WHERE l.to_code IS NOT NULL),'[]'::jsonb) AS resources
FROM config_items m
LEFT JOIN config_links l
  ON l.enabled=true AND l.link_type='MAIN_TO_RESOURCE' AND l.from_category='MAIN_OPERATION' AND l.from_code=m.code
WHERE m.category='MAIN_OPERATION'
GROUP BY m.code,m.data
ORDER BY m.code;

SELECT setting_key,value_json,description
FROM config_settings
WHERE setting_key LIKE 'processTime.%'
   OR setting_key LIKE 'recipeModel.%'
   OR setting_key LIKE 'capacity.%'
   OR setting_key IN ('stOutput.unknownStepPolicy','stOutput.timeModelVersion','stOutput.assumptionDisclosure')
ORDER BY setting_key;
