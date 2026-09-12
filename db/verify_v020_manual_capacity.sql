-- ST Planning v020 verification — 6 read-only queries.
SELECT setting_key,value_json FROM config_settings WHERE setting_key IN ('capacity.manualWorkSegmented','capacity.manualSetupAggregation','capacity.manualMaxOperatorsPerBatch','capacity.manualParallelEfficiency') ORDER BY setting_key;
SELECT code,label,data FROM config_items WHERE category='CAPACITY_RESOURCE' AND code IN ('MASKING','UNMASKING','MASKING_LABOR','UNMASKING_LABOR') ORDER BY sort_order;
SELECT code,name,priority,condition_json,action_json FROM config_rules WHERE rule_type='MANUAL_CAPACITY' ORDER BY priority,code;
SELECT from_code,to_code FROM config_links WHERE link_type='MAIN_TO_RESOURCE' AND from_code IN ('MASKING','FMSKG_CM','UNMASKING') ORDER BY from_code,to_code;
SELECT code,name,action_json FROM config_rules WHERE rule_type='BATCH' AND code IN ('MASK_BATCH_CAP','UNMASK_BATCH_CAP') ORDER BY code;
SELECT setting_key,value_json FROM config_settings WHERE setting_key='stOutput.timeModelVersion';
