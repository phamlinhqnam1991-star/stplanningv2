-- ST Planning v014 Batch verification — 6 queries
SELECT count(*) AS planning_batches FROM planning_batches;
SELECT count(*) AS planning_batch_jobs FROM planning_batch_jobs;
SELECT category,count(*) FROM config_items WHERE category IN ('BATCH_KEY_FIELD','BATCH_STATUS') GROUP BY category ORDER BY category;
SELECT code,name,enabled,priority,condition_json,action_json FROM config_rules WHERE rule_type='BATCH' ORDER BY priority,code;
SELECT setting_key,value_json FROM config_settings WHERE category='BATCH_MODEL' ORDER BY setting_key;
SELECT batch_no,batch_key,main_operation_code,recipe_no,status,job_count,total_qty,total_surface_dm2,process_time_minutes,created_at FROM planning_batches ORDER BY created_at DESC LIMIT 20;
