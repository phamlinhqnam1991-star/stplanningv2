-- ST Planning Clean Rebuild v001
-- Aiven PostgreSQL
-- Only RAW preservation + approved Planning/Scheduling normalization.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS import_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_filename text NOT NULL,
    source_sha256 text,
    imported_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    status text NOT NULL DEFAULT 'IMPORTING'
        CHECK (status IN ('IMPORTING','COMPLETED','FAILED')),
    is_active boolean NOT NULL DEFAULT false,
    planning_row_count integer,
    scheduling_row_count integer,
    planning_column_count integer,
    scheduling_column_count integer,
    error_message text
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_import_runs_one_active
ON import_runs ((is_active))
WHERE is_active = true;

CREATE TABLE IF NOT EXISTS source_columns (
    id bigserial PRIMARY KEY,
    import_id uuid NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
    sheet_name text NOT NULL,
    excel_column text NOT NULL,
    column_order integer NOT NULL,
    header_row_1 text,
    header_row_2 text,
    header_row_3 text,
    business_group text,
    phase1_strategy text,
    target_table text,
    target_field text,
    source_data_type text,
    UNIQUE (import_id, sheet_name, column_order)
);

CREATE INDEX IF NOT EXISTS ix_source_columns_import_sheet
ON source_columns (import_id, sheet_name, column_order);

CREATE TABLE IF NOT EXISTS raw_sheet_rows (
    import_id uuid NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
    sheet_name text NOT NULL,
    source_row_no integer NOT NULL,
    row_data jsonb NOT NULL,
    row_hash text,
    PRIMARY KEY (import_id, sheet_name, source_row_no)
);

CREATE INDEX IF NOT EXISTS ix_raw_sheet_rows_sheet
ON raw_sheet_rows (sheet_name, import_id, source_row_no);

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

CREATE INDEX IF NOT EXISTS ix_planning_jobs_job_num ON planning_jobs (job_num);
CREATE INDEX IF NOT EXISTS ix_planning_jobs_part ON planning_jobs (epicor_part);
CREATE INDEX IF NOT EXISTS ix_planning_jobs_next_operation ON planning_jobs (next_operation);
CREATE INDEX IF NOT EXISTS ix_planning_jobs_program ON planning_jobs (program);

CREATE TABLE IF NOT EXISTS planning_job_operations (
    id bigserial PRIMARY KEY,
    planning_job_id bigint NOT NULL REFERENCES planning_jobs(id) ON DELETE CASCADE,
    operation_code text NOT NULL,
    operation_order smallint NOT NULL,
    source_excel_column text NOT NULL,
    source_value text NOT NULL,
    UNIQUE (planning_job_id, operation_order)
);

CREATE INDEX IF NOT EXISTS ix_planning_job_operations_code ON planning_job_operations (operation_code);
CREATE INDEX IF NOT EXISTS ix_planning_job_operations_value ON planning_job_operations (source_value);

CREATE TABLE IF NOT EXISTS schedule_blocks (
    id bigserial PRIMARY KEY,
    import_id uuid NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
    source_row_no integer NOT NULL,
    schedule_date date,
    day_label text,
    slot_no integer,
    batch_ref text,
    recipe_no text,
    recipe_description text,
    job_count integer,
    pcs numeric,
    surface_dm2 numeric,
    start_time time,
    end_time time,
    duration_minutes numeric,
    status text,
    comments text,
    UNIQUE (import_id, source_row_no)
);

CREATE INDEX IF NOT EXISTS ix_schedule_blocks_date_slot ON schedule_blocks (schedule_date, slot_no);
CREATE INDEX IF NOT EXISTS ix_schedule_blocks_batch ON schedule_blocks (batch_ref);
CREATE INDEX IF NOT EXISTS ix_schedule_blocks_status ON schedule_blocks (status);

CREATE TABLE IF NOT EXISTS schedule_resource_assignments (
    id bigserial PRIMARY KEY,
    schedule_block_id bigint NOT NULL REFERENCES schedule_blocks(id) ON DELETE CASCADE,
    resource_code text NOT NULL,
    resource_order smallint NOT NULL,
    source_excel_column text NOT NULL,
    batch_ref text NOT NULL,
    UNIQUE (schedule_block_id, resource_order)
);

CREATE INDEX IF NOT EXISTS ix_schedule_resource_assignments_resource
ON schedule_resource_assignments (resource_code);
CREATE INDEX IF NOT EXISTS ix_schedule_resource_assignments_batch
ON schedule_resource_assignments (batch_ref);

CREATE OR REPLACE VIEW v_active_planning_jobs AS
SELECT p.*
FROM planning_jobs p
JOIN import_runs i ON i.id = p.import_id
WHERE i.is_active = true AND i.status = 'COMPLETED';

CREATE OR REPLACE VIEW v_active_schedule_blocks AS
SELECT s.*
FROM schedule_blocks s
JOIN import_runs i ON i.id = s.import_id
WHERE i.is_active = true AND i.status = 'COMPLETED';

CREATE OR REPLACE VIEW v_active_schedule_resource_assignments AS
SELECT a.*
FROM schedule_resource_assignments a
JOIN schedule_blocks s ON s.id = a.schedule_block_id
JOIN import_runs i ON i.id = s.import_id
WHERE i.is_active = true AND i.status = 'COMPLETED';
