-- ST Planning v018 verification (6 read-only queries)
SELECT setting_key,value_json FROM config_settings WHERE setting_key LIKE 'capacity.chemicalLine%' ORDER BY setting_key;
SELECT code,label,data FROM config_items WHERE category='CAPACITY_RESOURCE' AND code='FLYBAR';
SELECT setting_key,value_json FROM config_settings WHERE setting_key='stOutput.timeModelVersion';
SELECT count(*) AS chemical_main_to_flybar_links FROM config_links WHERE enabled=true AND link_type='MAIN_TO_RESOURCE' AND to_code='FLYBAR';
SELECT code,name,enabled,priority,action_json FROM config_rules WHERE rule_type='PROCESS_TIME' AND code='CHEM_RECIPE_TOTAL_TIME';
SELECT code,label,data FROM config_items WHERE category='RECIPE' AND code IN ('001','009','016','025') ORDER BY code;
