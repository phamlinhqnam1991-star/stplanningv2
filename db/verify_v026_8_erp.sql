-- ST Planning v026.8 ERP verification — EXACTLY 10 read-only queries.

SELECT to_regclass('public.erp_schedule_reservations') AS schedule_reservation_ledger,
       to_regclass('public.erp_job_operation_execution') AS execution_ledger,
       to_regclass('public.erp_inspection_events') AS inspection_ledger,
       to_regclass('public.planning_proposed_plan') AS proposed_plan;

SELECT setting_key,value_json,enabled FROM config_settings
WHERE setting_key IN ('scheduling.transactionalEnabled','execution.actualEnabled','inspection.actualEnabled','proposal.acceptAtomic','predictiveEta.enabled','predictiveEta.p80RiskAlert')
ORDER BY setting_key;

SELECT state,count(*) AS rows FROM erp_schedule_reservations GROUP BY state ORDER BY state;

SELECT state,count(*) AS rows,count(*) FILTER(WHERE actual_start IS NOT NULL) AS started,count(*) FILTER(WHERE actual_end IS NOT NULL) AS ended
FROM erp_job_operation_execution GROUP BY state ORDER BY state;

SELECT status,count(*) AS rows,count(*) FILTER(WHERE actual_end IS NOT NULL) AS ended
FROM erp_inspection_events GROUP BY status ORDER BY status;

SELECT status,count(*) AS plans FROM planning_proposed_plan GROUP BY status ORDER BY status;

SELECT status,selected,count(*) AS proposed_batches FROM planning_proposed_batch GROUP BY status,selected ORDER BY status,selected;

SELECT main_operation_code,count(*) AS samples,
       percentile_cont(0.50) WITHIN GROUP(ORDER BY EXTRACT(EPOCH FROM(actual_end-actual_start))/60.0) AS p50_minutes,
       percentile_cont(0.80) WITHIN GROUP(ORDER BY EXTRACT(EPOCH FROM(actual_end-actual_start))/60.0) AS p80_minutes
FROM erp_job_operation_execution
WHERE state='DONE' AND actual_start IS NOT NULL AND actual_end IS NOT NULL
GROUP BY main_operation_code ORDER BY samples DESC,main_operation_code;

SELECT job_num,main_operation_code,count(*) AS active_commitments
FROM erp_job_commitments WHERE state='ACTIVE'
GROUP BY job_num,main_operation_code HAVING count(*)>1
ORDER BY active_commitments DESC,job_num;

SELECT a.resource_code,a.batch_no AS batch_a,b.batch_no AS batch_b,a.start_at,a.end_at,b.start_at,b.end_at
FROM erp_schedule_reservations a
JOIN erp_schedule_reservations b ON a.id<b.id AND a.state='ACTIVE' AND b.state='ACTIVE' AND upper(btrim(a.resource_code))=upper(btrim(b.resource_code)) AND a.start_at<b.end_at AND a.end_at>b.start_at
ORDER BY a.resource_code,a.start_at LIMIT 100;
