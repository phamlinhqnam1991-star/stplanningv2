-- ST Planning Clean Rebuild v002 - Batch 01/04
-- Aiven PostgreSQL
-- 7 statements. Run this file FIRST.

-- 1
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2
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

-- 3
CREATE UNIQUE INDEX IF NOT EXISTS ux_import_runs_one_active
ON import_runs ((is_active))
WHERE is_active = true;

-- 4
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

-- 5
CREATE INDEX IF NOT EXISTS ix_source_columns_import_sheet
ON source_columns (import_id, sheet_name, column_order);

-- 6
CREATE TABLE IF NOT EXISTS raw_sheet_rows (
    import_id uuid NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
    sheet_name text NOT NULL,
    source_row_no integer NOT NULL,
    row_data jsonb NOT NULL,
    row_hash text,
    PRIMARY KEY (import_id, sheet_name, source_row_no)
);

-- 7
CREATE INDEX IF NOT EXISTS ix_raw_sheet_rows_sheet
ON raw_sheet_rows (sheet_name, import_id, source_row_no);
