-- ST Planning v014 — Batch Core
-- Max 8 statements per file.

CREATE TABLE IF NOT EXISTS planning_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_no text NOT NULL UNIQUE,
    batch_key text NOT NULL,
    main_operation_code text NOT NULL,
    main_operation_label text,
    recipe_no text,
    recipe_name text,
    status text NOT NULL DEFAULT 'DRAFT',
    job_count integer NOT NULL DEFAULT 0,
    total_qty numeric NOT NULL DEFAULT 0,
    total_surface_dm2 numeric NOT NULL DEFAULT 0,
    process_time_minutes numeric,
    batch_rule_code text,
    batch_key_parts jsonb NOT NULL DEFAULT '[]'::jsonb,
    config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planning_batch_jobs (
    id bigserial PRIMARY KEY,
    batch_id uuid NOT NULL REFERENCES planning_batches(id) ON DELETE CASCADE,
    planning_job_id bigint REFERENCES planning_jobs(id) ON DELETE SET NULL,
    job_num text NOT NULL,
    part_num text,
    revision_num text,
    program text,
    qty numeric,
    surface_dm2 numeric,
    recipe_no text,
    recipe_name text,
    process_time_minutes numeric,
    sequence_order integer NOT NULL DEFAULT 1,
    candidate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (batch_id, job_num)
);

CREATE TABLE IF NOT EXISTS batch_number_sequences (
    sequence_date date NOT NULL,
    prefix text NOT NULL,
    last_sequence integer NOT NULL DEFAULT 0,
    PRIMARY KEY (sequence_date, prefix)
);

CREATE INDEX IF NOT EXISTS ix_planning_batches_status
ON planning_batches (status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_planning_batches_main
ON planning_batches (main_operation_code, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_planning_batch_jobs_job
ON planning_batch_jobs (job_num, created_at DESC);
