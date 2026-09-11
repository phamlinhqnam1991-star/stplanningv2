-- ST Planning/Scheduling verification - 6 statements.
-- Run after a successful ST workbook import.
SELECT id, source_filename, status, is_active, imported_at, completed_at,
       planning_row_count, planning_column_count,
       scheduling_row_count, scheduling_column_count
FROM import_runs
ORDER BY imported_at DESC
LIMIT 10;

SELECT sheet_name, count(*) AS raw_rows
FROM raw_sheet_rows r
JOIN import_runs i ON i.id=r.import_id
WHERE i.is_active=true
GROUP BY sheet_name
ORDER BY sheet_name;

SELECT count(*) AS planning_rows FROM v_active_planning_jobs;

SELECT count(*) AS planning_operation_rows
FROM planning_job_operations o
JOIN v_active_planning_jobs p ON p.id=o.planning_job_id;

SELECT count(*) AS schedule_rows FROM v_active_schedule_blocks;

SELECT count(*) AS resource_assignment_rows FROM v_active_schedule_resource_assignments;
