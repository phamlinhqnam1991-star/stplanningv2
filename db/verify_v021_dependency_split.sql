-- ST Planning v021 verification (6 read-only queries)
SELECT setting_key,value_json,enabled FROM config_settings WHERE setting_key LIKE 'capacity.dependencyGraph%' OR setting_key LIKE 'capacity.smartBatchSplit%' ORDER BY setting_key;
SELECT setting_key,value_json FROM config_settings WHERE setting_key='stOutput.timeModelVersion';
SELECT count(*) AS active_capacity_resources FROM config_items WHERE category='CAPACITY_RESOURCE' AND enabled=true;
SELECT count(*) AS active_batch_rules FROM config_rules WHERE rule_type='BATCH' AND enabled=true;
SELECT count(*) AS active_manual_capacity_rules FROM config_rules WHERE rule_type='MANUAL_CAPACITY' AND enabled=true;
SELECT count(*) AS active_paint_capacity_rules FROM config_rules WHERE rule_type='PAINT_CAPACITY' AND enabled=true;
