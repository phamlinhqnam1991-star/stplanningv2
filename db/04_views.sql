-- ST Planning Clean Rebuild v002 - Batch 04/04
-- Aiven PostgreSQL
-- 3 statements. Run AFTER 03_scheduling.sql.

-- 1
CREATE OR REPLACE VIEW v_active_planning_jobs AS
SELECT p.*
FROM planning_jobs p
JOIN import_runs i ON i.id = p.import_id
WHERE i.is_active = true AND i.status = 'COMPLETED';

-- 2
CREATE OR REPLACE VIEW v_active_schedule_blocks AS
SELECT s.*
FROM schedule_blocks s
JOIN import_runs i ON i.id = s.import_id
WHERE i.is_active = true AND i.status = 'COMPLETED';

-- 3
CREATE OR REPLACE VIEW v_active_schedule_resource_assignments AS
SELECT a.*
FROM schedule_resource_assignments a
JOIN schedule_blocks s ON s.id = a.schedule_block_id
JOIN import_runs i ON i.id = s.import_id
WHERE i.is_active = true AND i.status = 'COMPLETED';
