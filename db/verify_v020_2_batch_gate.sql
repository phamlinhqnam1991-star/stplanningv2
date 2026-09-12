-- ST Planning v020.2 verification (6 read-only queries)
SELECT setting_key,value_json,enabled FROM config_settings WHERE setting_key IN ('capacity.mainBatchGateMode','capacity.manualPrerequisiteGateMode') ORDER BY setting_key;
SELECT setting_key,value_json FROM config_settings WHERE setting_key='stOutput.timeModelVersion';
SELECT code,label,data FROM config_items WHERE category='CAPACITY_RESOURCE' AND code IN ('MASKING','UNMASKING','MASKING_LABOR','UNMASKING_LABOR') ORDER BY sort_order;
SELECT code,name,priority,condition_json,action_json FROM config_rules WHERE rule_type='MANUAL_CAPACITY' AND enabled=true ORDER BY priority,code;
SELECT code,label,data FROM config_items WHERE category='CAPACITY_RESOURCE' AND code='FLYBAR';
SELECT code,label,data FROM config_items WHERE category='CAPACITY_RESOURCE' AND code IN ('CAB1','CAB2','CAB3','CAB4') ORDER BY code;
