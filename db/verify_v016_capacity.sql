-- ST Planning v016 finite capacity verification — 6 queries.
SELECT setting_key,value_json FROM config_settings WHERE category='CAPACITY_MODEL' ORDER BY setting_key;
SELECT code,label,data FROM config_items WHERE category='CAPACITY_RESOURCE' ORDER BY sort_order,code;
SELECT code,label,data FROM config_items WHERE category='RESOURCE' AND code IN ('FLYBAR','CAB1','CAB2','CAB3','CAB4') ORDER BY sort_order;
SELECT from_code AS main_operation,to_code AS resource_code,sort_order FROM config_links WHERE link_type='MAIN_TO_RESOURCE' AND to_code IN ('CAB1','CAB2','CAB3','CAB4') ORDER BY from_code,sort_order;
SELECT count(*) AS active_schedule_blocks FROM v_active_schedule_blocks;
SELECT a.resource_code,count(*) AS assignments FROM v_active_schedule_resource_assignments a GROUP BY a.resource_code ORDER BY a.resource_code;
