-- ST Planning Clean Rebuild v008 - Batch 06/06
-- Full Job Operation Sequence
-- 7 statements. Run AFTER 05_routing_core.sql.

-- 1
CREATE TABLE IF NOT EXISTS job_operation_sequence (
    id bigserial PRIMARY KEY,
    job_route_id bigint NOT NULL REFERENCES job_routes(id) ON DELETE CASCADE,
    operation_position smallint NOT NULL CHECK (operation_position BETWEEN 1 AND 36),
    operation_code text NOT NULL,
    operation_seq integer,
    is_complete boolean,
    open_nonconformance text,
    source_operation_text text NOT NULL,
    source_operation_column text NOT NULL,
    source_complete_column text NOT NULL,
    source_nonconf_column text NOT NULL,
    source_seq_column text NOT NULL,
    UNIQUE (job_route_id, operation_position)
);

-- 2
CREATE INDEX IF NOT EXISTS ix_job_operation_sequence_route_position
ON job_operation_sequence (job_route_id, operation_position);

-- 3
CREATE INDEX IF NOT EXISTS ix_job_operation_sequence_code
ON job_operation_sequence (operation_code);

-- 4
CREATE INDEX IF NOT EXISTS ix_job_routes_next_operation
ON job_routes (next_operation);

-- 5
CREATE INDEX IF NOT EXISTS ix_job_routes_program
ON job_routes (program);

-- 6
CREATE OR REPLACE VIEW v_active_job_routes AS
SELECT j.*
FROM job_routes j
JOIN route_import_runs i ON i.id=j.import_id
WHERE i.is_active=true AND i.status='COMPLETED';

-- 7
CREATE OR REPLACE VIEW v_active_job_operation_sequence AS
SELECT o.*
FROM job_operation_sequence o
JOIN job_routes j ON j.id=o.job_route_id
JOIN route_import_runs i ON i.id=j.import_id
WHERE i.is_active=true AND i.status='COMPLETED';
