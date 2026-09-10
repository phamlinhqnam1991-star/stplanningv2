-- ST Planning Clean Rebuild v002 - Batch 03/04
-- Aiven PostgreSQL
-- 7 statements. Run AFTER 02_planning.sql.

-- 1
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

-- 2
CREATE INDEX IF NOT EXISTS ix_schedule_blocks_date_slot
ON schedule_blocks (schedule_date, slot_no);

-- 3
CREATE INDEX IF NOT EXISTS ix_schedule_blocks_batch
ON schedule_blocks (batch_ref);

-- 4
CREATE INDEX IF NOT EXISTS ix_schedule_blocks_status
ON schedule_blocks (status);

-- 5
CREATE TABLE IF NOT EXISTS schedule_resource_assignments (
    id bigserial PRIMARY KEY,
    schedule_block_id bigint NOT NULL REFERENCES schedule_blocks(id) ON DELETE CASCADE,
    resource_code text NOT NULL,
    resource_order smallint NOT NULL,
    source_excel_column text NOT NULL,
    batch_ref text NOT NULL,
    UNIQUE (schedule_block_id, resource_order)
);

-- 6
CREATE INDEX IF NOT EXISTS ix_schedule_resource_assignments_resource
ON schedule_resource_assignments (resource_code);

-- 7
CREATE INDEX IF NOT EXISTS ix_schedule_resource_assignments_batch
ON schedule_resource_assignments (batch_ref);
