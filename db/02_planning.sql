-- ST Planning Clean Rebuild v002 - Batch 02/04
-- Aiven PostgreSQL
-- 8 statements. Run AFTER 01_core_raw.sql.

-- 1
CREATE TABLE IF NOT EXISTS planning_jobs (
    id bigserial PRIMARY KEY,
    import_id uuid NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
    source_row_no integer NOT NULL,
    program text,
    part_cluster text,
    epicor_part text,
    surface_dm2 numeric,
    part_description text,
    job_num text,
    last_labor_op text,
    next_operation text,
    last_labor_qty numeric,
    prod_qty numeric,
    current_good_wip_qty numeric,
    st_source_value text,
    st_wip_area text,
    wip_sequence text,
    all_operation text,
    UNIQUE (import_id, source_row_no)
);

-- 2
CREATE INDEX IF NOT EXISTS ix_planning_jobs_job_num
ON planning_jobs (job_num);

-- 3
CREATE INDEX IF NOT EXISTS ix_planning_jobs_part
ON planning_jobs (epicor_part);

-- 4
CREATE INDEX IF NOT EXISTS ix_planning_jobs_next_operation
ON planning_jobs (next_operation);

-- 5
CREATE INDEX IF NOT EXISTS ix_planning_jobs_program
ON planning_jobs (program);

-- 6
CREATE TABLE IF NOT EXISTS planning_job_operations (
    id bigserial PRIMARY KEY,
    planning_job_id bigint NOT NULL REFERENCES planning_jobs(id) ON DELETE CASCADE,
    operation_code text NOT NULL,
    operation_order smallint NOT NULL,
    source_excel_column text NOT NULL,
    source_value text NOT NULL,
    UNIQUE (planning_job_id, operation_order)
);

-- 7
CREATE INDEX IF NOT EXISTS ix_planning_job_operations_code
ON planning_job_operations (operation_code);

-- 8
CREATE INDEX IF NOT EXISTS ix_planning_job_operations_value
ON planning_job_operations (source_value);
