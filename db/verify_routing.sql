-- All Open Jobs routing verification - 5 statements.
-- Run after a successful routing import.
SELECT id, source_filename, sheet_name, status, is_active, imported_at, completed_at,
       route_row_count, route_column_count
FROM route_import_runs
ORDER BY imported_at DESC
LIMIT 10;

SELECT count(*) AS active_job_routes FROM v_active_job_routes;

SELECT count(*) AS active_job_operation_rows FROM v_active_job_operation_sequence;

SELECT count(*) AS jobs_without_operations
FROM v_active_job_routes
WHERE operation_count=0;

SELECT count(*) AS jobs_with_next_operation,
       count(*) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM v_active_job_operation_sequence o
           WHERE o.job_route_id=j.id AND o.operation_code=j.next_operation
         )
       ) AS next_operation_found_in_route
FROM v_active_job_routes j
WHERE NULLIF(next_operation,'') IS NOT NULL;
