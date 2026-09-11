-- ST Planning Clean Rebuild v008 - Batch 05/06
-- All Open Jobs Routing Source
-- 8 statements. Run AFTER 04_views.sql.

-- 1
CREATE TABLE IF NOT EXISTS route_import_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_filename text NOT NULL,
    source_sha256 text,
    sheet_name text NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    status text NOT NULL DEFAULT 'IMPORTING'
        CHECK (status IN ('IMPORTING','COMPLETED','FAILED')),
    is_active boolean NOT NULL DEFAULT false,
    route_row_count integer,
    route_column_count integer,
    error_message text
);

-- 2
CREATE UNIQUE INDEX IF NOT EXISTS ux_route_import_runs_one_active
ON route_import_runs ((is_active))
WHERE is_active = true;

-- 3
CREATE TABLE IF NOT EXISTS route_source_columns (
    id bigserial PRIMARY KEY,
    import_id uuid NOT NULL REFERENCES route_import_runs(id) ON DELETE CASCADE,
    sheet_name text NOT NULL,
    excel_column text NOT NULL,
    column_order integer NOT NULL,
    header_row_1 text,
    UNIQUE (import_id, column_order)
);

-- 4
CREATE TABLE IF NOT EXISTS raw_route_rows (
    import_id uuid NOT NULL REFERENCES route_import_runs(id) ON DELETE CASCADE,
    source_row_no integer NOT NULL,
    row_data jsonb NOT NULL,
    row_hash text,
    PRIMARY KEY (import_id, source_row_no)
);

-- 5
CREATE INDEX IF NOT EXISTS ix_raw_route_rows_import_row
ON raw_route_rows (import_id, source_row_no);

-- 6
CREATE TABLE IF NOT EXISTS job_routes (
    id bigserial PRIMARY KEY,
    import_id uuid NOT NULL REFERENCES route_import_runs(id) ON DELETE CASCADE,
    source_row_no integer NOT NULL,
    program text,
    epicor_part text,
    revision_num text,
    job_num text,
    prod_qty numeric,
    last_labor_op text,
    last_labor_opr_seq integer,
    next_operation text,
    last_complete_opr_seq integer,
    job_complete boolean,
    operation_count smallint NOT NULL DEFAULT 0,
    UNIQUE (import_id, source_row_no)
);

-- 7
CREATE INDEX IF NOT EXISTS ix_job_routes_job_num
ON job_routes (job_num);

-- 8
CREATE INDEX IF NOT EXISTS ix_job_routes_part
ON job_routes (epicor_part);
