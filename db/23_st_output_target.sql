-- ST Planning v015 — ST Output Target Core
-- Max 8 statements per file. Run AFTER 22_batch_config_seed.sql.

-- 1
CREATE TABLE IF NOT EXISTS st_output_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_date date NOT NULL,
    cutoff_time time NOT NULL DEFAULT '15:00:00',
    metric_code text NOT NULL DEFAULT 'SURFACE_DM2',
    target_value numeric NOT NULL CHECK (target_value >= 0),
    status text NOT NULL DEFAULT 'ACTIVE',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (target_date, metric_code)
);

-- 2
CREATE INDEX IF NOT EXISTS ix_st_output_targets_status_date
ON st_output_targets (status, target_date DESC);

-- 3
CREATE INDEX IF NOT EXISTS ix_st_output_targets_metric_date
ON st_output_targets (metric_code, target_date DESC);
