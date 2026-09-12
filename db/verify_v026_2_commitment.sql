-- ST Planning v026.2 verification. 5 read-only statements.
SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='planning_batches' AND column_name IN ('version','status_changed_at') ORDER BY column_name;
SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='planning_batch_jobs' AND column_name IN ('route_occurrence_key','route_position','main_operation_code') ORDER BY column_name;
SELECT to_regclass('public.erp_job_commitments') AS commitment_table,to_regclass('public.erp_audit_events') AS audit_table;
SELECT code,data->'allowedTo' AS allowed_to,data->>'blocksCandidate' AS blocks_candidate,data->>'terminal' AS terminal FROM public.config_items WHERE category='BATCH_STATUS' ORDER BY sort_order,code;
SELECT state,count(*)::int AS commitments FROM public.erp_job_commitments GROUP BY state ORDER BY state;
