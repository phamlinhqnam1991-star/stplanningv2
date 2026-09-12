-- ST Planning v020.1 verification — 6 read-only queries.
SELECT setting_key,value_json FROM config_settings WHERE setting_key IN ('capacity.manualRouteAwareGrouping','capacity.manualRouteContextMode','stOutput.timeModelVersion') ORDER BY setting_key;
SELECT code,label,data FROM config_items WHERE category='CAPACITY_RESOURCE' AND code IN ('MASKING','UNMASKING','MASKING_LABOR','UNMASKING_LABOR') ORDER BY sort_order;
SELECT code,name,priority,condition_json,action_json FROM config_rules WHERE rule_type='MANUAL_CAPACITY' AND enabled=true ORDER BY priority,code;
SELECT COUNT(*) AS route_operation_count FROM v_active_job_operation_sequence WHERE operation_code IS NOT NULL;
SELECT operation_code,COUNT(*) AS occurrences FROM v_active_job_operation_sequence WHERE UPPER(operation_code) LIKE '%MSK%' OR UPPER(operation_code) LIKE '%MASK%' GROUP BY operation_code ORDER BY occurrences DESC,operation_code LIMIT 50;
SELECT job_num,COUNT(*) AS manual_route_steps FROM v_active_job_routes jr JOIN v_active_job_operation_sequence ro ON ro.job_route_id=jr.id WHERE UPPER(ro.operation_code) LIKE '%MSK%' OR UPPER(ro.operation_code) LIKE '%MASK%' GROUP BY job_num HAVING COUNT(*)>1 ORDER BY manual_route_steps DESC,job_num LIMIT 50;
