-- ST Planning v022 verification — 6 read-only queries.
SELECT setting_key,label,value_json FROM config_settings WHERE setting_key LIKE 'capacity.criticalPath%' ORDER BY setting_key;
SELECT setting_key,label,value_json FROM config_settings WHERE setting_key LIKE 'capacity.bottleneck%' ORDER BY setting_key;
SELECT setting_key,label,value_json FROM config_settings WHERE setting_key LIKE 'capacity.recovery%' ORDER BY setting_key;
SELECT setting_key,value_json FROM config_settings WHERE setting_key='stOutput.timeModelVersion';
SELECT COUNT(*) AS capacity_resources FROM config_items WHERE enabled=true AND category='CAPACITY_RESOURCE';
SELECT COUNT(*) AS enabled_capacity_rules FROM config_rules WHERE enabled=true AND rule_type IN ('PAINT_CAPACITY','MANUAL_CAPACITY');
