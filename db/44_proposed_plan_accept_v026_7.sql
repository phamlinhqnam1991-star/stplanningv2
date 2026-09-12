-- ST Planning v026.7 — Proposed Plan → Revalidate → Accept
-- EXACTLY 6 SQL statements. Run after db/43_execution_inspection_v026_4.sql.

ALTER TABLE public.planning_proposed_batch_job
  ALTER COLUMN planning_job_operation_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS planning_job_id bigint REFERENCES public.planning_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS route_occurrence_key text,
  ADD COLUMN IF NOT EXISTS route_position integer,
  ADD COLUMN IF NOT EXISTS operation_code text,
  ADD COLUMN IF NOT EXISTS main_operation_code text,
  ADD COLUMN IF NOT EXISTS selected boolean NOT NULL DEFAULT true;

ALTER TABLE public.planning_proposed_plan
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS conflict_json jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.planning_proposed_batch
  ADD COLUMN IF NOT EXISTS accepted_reservation_id uuid REFERENCES public.erp_schedule_reservations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expected_existing_batch_version integer,
  ADD COLUMN IF NOT EXISTS revalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS conflict_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS ix_planning_proposed_batch_status_time
  ON public.planning_proposed_batch(status,start_time,end_time);

CREATE INDEX IF NOT EXISTS ix_planning_proposed_batch_job_planning_job
  ON public.planning_proposed_batch_job(planning_job_id,proposed_batch_id);

INSERT INTO public.config_settings(setting_key,category,label,data_type,value_json,enabled,description)
VALUES
('proposal.acceptAtomic','PROPOSED_PLAN','Accept All Atomic','boolean','true'::jsonb,true,'Accept Selected/All is executed in one PostgreSQL transaction. Any conflict rolls back the entire acceptance.'),
('proposal.noSilentReschedule','PROPOSED_PLAN','No Silent Reschedule','boolean','true'::jsonb,true,'Revalidation surfaces resource/job/config conflicts and never moves an accepted proposal to another time/resource automatically.'),
('proposal.requireRevalidate','PROPOSED_PLAN','Require Revalidation','boolean','true'::jsonb,true,'Every proposed Batch is revalidated against live commitments, Batch versions and resource reservations immediately before acceptance.')
ON CONFLICT(setting_key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,enabled=true,description=EXCLUDED.description,updated_at=now();
