-- ============================================================
-- ST Planning v025.4 checkpoint
-- Production State Snapshot + Proposed Plan persistence layer
-- ADDITIVE ONLY: does not change READY/WAIT, Planning Chain,
-- existing Batch/Schedule behavior or v024 What-if engine.
-- MAX 10 SQL statements requirement: this migration uses 7.
-- Run only after the current v024 schema is installed.
-- ============================================================

begin;

create table if not exists public.planning_production_snapshot (
    id bigserial primary key,
    snapshot_no text not null unique,
    captured_at timestamptz not null default now(),
    horizon_start timestamptz,
    horizon_end timestamptz,
    source_hash text,
    snapshot_json jsonb not null default '{}'::jsonb,
    summary_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.planning_proposed_plan (
    id bigserial primary key,
    proposal_no text not null unique,
    snapshot_id bigint not null
        references public.planning_production_snapshot(id) on delete restrict,
    what_if_run_id bigint,
    scenario_name text,
    target_dm2 numeric(18,3) not null default 0,
    cutoff_time timestamptz,
    status text not null default 'DRAFT'
        check(status in (
            'DRAFT','READY','PARTIALLY_ACCEPTED','ACCEPTED','REJECTED','STALE'
        )),
    already_final_dm2 numeric(18,3) not null default 0,
    existing_scheduled_dm2 numeric(18,3) not null default 0,
    existing_unscheduled_dm2 numeric(18,3) not null default 0,
    existing_plan_dm2 numeric(18,3) not null default 0,
    proposed_dm2 numeric(18,3) not null default 0,
    forecast_dm2 numeric(18,3) not null default 0,
    gap_dm2 numeric(18,3) not null default 0,
    output_ledger_json jsonb not null default '[]'::jsonb,
    timeline_json jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    accepted_at timestamptz
);

create table if not exists public.planning_proposed_batch (
    id bigserial primary key,
    proposed_plan_id bigint not null
        references public.planning_proposed_plan(id) on delete cascade,
    source_mode text not null
        check(source_mode in ('EXISTING_UNSCHEDULED','NEW_PROPOSED')),
    existing_batch_id bigint
        references public.planning_batch(id) on delete restrict,
    main_operation text not null,
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
    qty numeric(18,3) not null default 0,
    surface_dm2 numeric(18,3) not null default 0,
    process_minutes integer,
    status text not null default 'PROPOSED'
        check(status in ('PROPOSED','SELECTED','ACCEPTED','REJECTED','CONFLICT')),
    accepted_batch_id bigint
        references public.planning_batch(id) on delete set null,
    accepted_schedule_id bigint
        references public.planning_schedule(id) on delete set null,
    conflict_code text,
    conflict_detail text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint planning_proposed_batch_time_ck
        check(end_time is null or start_time is null or end_time >= start_time),
    constraint planning_proposed_batch_existing_ck
        check(
            (source_mode = 'EXISTING_UNSCHEDULED' and existing_batch_id is not null)
            or
            (source_mode = 'NEW_PROPOSED')
        )
);

create table if not exists public.planning_proposed_batch_job (
    id bigserial primary key,
    proposed_batch_id bigint not null
        references public.planning_proposed_batch(id) on delete cascade,
    planning_job_operation_id bigint not null
        references public.planning_job_operation(id) on delete restrict,
    job_num text not null,
    qty numeric(18,3) not null default 0,
    surface_dm2 numeric(18,3) not null default 0,
    sequence_no integer not null default 0,
    created_at timestamptz not null default now(),
    constraint planning_proposed_batch_job_ux
        unique(proposed_batch_id, planning_job_operation_id)
);

-- One statement for all secondary indexes, keeping the whole migration <= 10 statements.
do $$
begin
    execute 'create index if not exists ix_planning_production_snapshot_captured on public.planning_production_snapshot(captured_at desc)';
    execute 'create index if not exists ix_planning_proposed_plan_status on public.planning_proposed_plan(status, created_at desc)';
    execute 'create index if not exists ix_planning_proposed_plan_snapshot on public.planning_proposed_plan(snapshot_id)';
    execute 'create index if not exists ix_planning_proposed_batch_plan on public.planning_proposed_batch(proposed_plan_id, status)';
    execute 'create index if not exists ix_planning_proposed_batch_existing on public.planning_proposed_batch(existing_batch_id) where existing_batch_id is not null';
    execute 'create index if not exists ix_planning_proposed_batch_job_job on public.planning_proposed_batch_job(job_num, proposed_batch_id)';
end $$;

commit;
