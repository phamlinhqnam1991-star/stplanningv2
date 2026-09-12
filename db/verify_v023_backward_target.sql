-- ST Planning v023 verification — 6 read-only queries.
SELECT setting_key, value_json, enabled FROM config_settings WHERE setting_key LIKE 'capacity.backwardTarget%' ORDER BY setting_key;
SELECT setting_key, value_json FROM config_settings WHERE setting_key='stOutput.timeModelVersion';
SELECT category, count(*) AS active_items FROM config_items WHERE enabled=true GROUP BY category ORDER BY category;
SELECT rule_type, count(*) AS active_rules FROM config_rules WHERE enabled=true GROUP BY rule_type ORDER BY rule_type;
SELECT count(*) AS planning_batches FROM planning_batches;
SELECT count(*) AS active_route_operations FROM job_operation_sequence WHERE is_active=true;
