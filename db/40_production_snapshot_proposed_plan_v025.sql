-- ST Planning v026.0 stabilization of the v025 proposal persistence schema.
-- Clean-install compatible with the actual runtime tables:
--   planning_batches (uuid), schedule_blocks (bigint), planning_job_operations (bigint).
-- EXACTLY 10 SQL statements. No hidden DO/EXECUTE block.

CREATE TABLE IF NOT EXISTS public.planning_production_snapshot (
    id bigserial PRIMARY KEY,
    snapshot_no text NOT NULL UNIQUE,
    captured_at timestamptz NOT NULL DEFAULT now(),
    horizon_start timestamptz,
    horizon_end timestamptz,
    source_hash text,
    snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planning_proposed_plan (
    id bigserial PRIMARY KEY,
    proposal_no text NOT NULL UNIQUE,
    snapshot_id bigint NOT NULL REFERENCES public.planning_production_snapshot(id) ON DELETE RESTRICT,
    what_if_run_id bigint,
    scenario_name text,
    target_dm2 numeric(18,3) NOT NULL DEFAULT 0,
    cutoff_time timestamptz,
    status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','READY','PARTIALLY_ACCEPTED','ACCEPTED','REJECTED','STALE')),
    already_final_dm2 numeric(18,3) NOT NULL DEFAULT 0,
    existing_scheduled_dm2 numeric(18,3) NOT NULL DEFAULT 0,
    existing_unscheduled_dm2 numeric(18,3) NOT NULL DEFAULT 0,
    existing_plan_dm2 numeric(18,3) NOT NULL DEFAULT 0,
    proposed_dm2 numeric(18,3) NOT NULL DEFAULT 0,
    forecast_dm2 numeric(18,3) NOT NULL DEFAULT 0,
    gap_dm2 numeric(18,3) NOT NULL DEFAULT 0,
    output_ledger_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    timeline_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.planning_proposed_batch (
    id bigserial PRIMARY KEY,
    proposed_plan_id bigint NOT NULL REFERENCES public.planning_proposed_plan(id) ON DELETE CASCADE,
    source_mode text NOT NULL CHECK(source_mode IN ('EXISTING_UNSCHEDULED','NEW_PROPOSED')),
    existing_batch_id uuid REFERENCES public.planning_batches(id) ON DELETE RESTRICT,
    main_operation text NOT NULL,
    recipe_id bigint,
    recipe_no text,
    recipe_name text,
    batch_key text,
    resource_type text,
    resource_code text,
    loading_start timestamptz,
    loading_end timestamptz,
    process_start timestamptz,
    process_end timestamptz,
    ndt_start timestamptz,
    ndt_end timestamptz,
    unloading_start timestamptz,
    unloading_end timestamptz,
    start_time timestamptz,
    end_time timestamptz,
    qty numeric(18,3) NOT NULL DEFAULT 0,
    surface_dm2 numeric(18,3) NOT NULL DEFAULT 0,
    process_minutes integer,
    status text NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','SELECTED','ACCEPTED','REJECTED','CONFLICT')),
    accepted_batch_id uuid REFERENCES public.planning_batches(id) ON DELETE SET NULL,
    accepted_schedule_id bigint REFERENCES public.schedule_blocks(id) ON DELETE SET NULL,
    conflict_code text,
    conflict_detail text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT planning_proposed_batch_time_ck CHECK(end_time IS NULL OR start_time IS NULL OR end_time >= start_time),
    CONSTRAINT planning_proposed_batch_existing_ck CHECK((source_mode='EXISTING_UNSCHEDULED' AND existing_batch_id IS NOT NULL) OR source_mode='NEW_PROPOSED')
);

CREATE TABLE IF NOT EXISTS public.planning_proposed_batch_job (
    id bigserial PRIMARY KEY,
    proposed_batch_id bigint NOT NULL REFERENCES public.planning_proposed_batch(id) ON DELETE CASCADE,
    planning_job_operation_id bigint NOT NULL REFERENCES public.planning_job_operations(id) ON DELETE RESTRICT,
    job_num text NOT NULL,
    qty numeric(18,3) NOT NULL DEFAULT 0,
    surface_dm2 numeric(18,3) NOT NULL DEFAULT 0,
    sequence_no integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT planning_proposed_batch_job_ux UNIQUE(proposed_batch_id, planning_job_operation_id)
);

CREATE INDEX IF NOT EXISTS ix_planning_production_snapshot_captured ON public.planning_production_snapshot(captured_at DESC);
CREATE INDEX IF NOT EXISTS ix_planning_proposed_plan_status ON public.planning_proposed_plan(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_planning_proposed_plan_snapshot ON public.planning_proposed_plan(snapshot_id);
CREATE INDEX IF NOT EXISTS ix_planning_proposed_batch_plan ON public.planning_proposed_batch(proposed_plan_id, status);
CREATE INDEX IF NOT EXISTS ix_planning_proposed_batch_existing ON public.planning_proposed_batch(existing_batch_id) WHERE existing_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_planning_proposed_batch_job_job ON public.planning_proposed_batch_job(job_num, proposed_batch_id);
