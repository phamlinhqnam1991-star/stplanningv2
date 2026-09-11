-- ST Planning v015 verification — 6 queries.
SELECT count(*) AS target_rows FROM st_output_targets;
SELECT code,label,data FROM config_items WHERE category='ST_OUTPUT_STATUS' ORDER BY sort_order,code;
SELECT setting_key,value_json FROM config_settings WHERE category='ST_OUTPUT_MODEL' ORDER BY setting_key;
SELECT count(*) AS active_planning_jobs, COALESCE(sum(surface_dm2),0) AS active_surface_dm2 FROM v_active_planning_jobs;
SELECT count(*) AS jobs_with_finsst FROM v_active_job_routes r WHERE EXISTS (SELECT 1 FROM v_active_job_operation_sequence o WHERE o.job_route_id=r.id AND upper(trim(o.operation_code))='FINSST');
SELECT max(COALESCE(completed_at,imported_at)) AS active_route_snapshot FROM route_import_runs WHERE is_active=true AND status='COMPLETED';
