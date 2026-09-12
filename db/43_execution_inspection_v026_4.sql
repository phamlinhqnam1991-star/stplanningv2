-- ST Planning v026.4 — Actual Execution + Intermediate Inspection Actual
-- EXACTLY 8 SQL statements. Run after db/42_transactional_scheduling_v026_3.sql.

CREATE TABLE IF NOT EXISTS public.erp_job_operation_execution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.planning_batches(id) ON DELETE SET NULL,
  batch_job_id bigint REFERENCES public.planning_batch_jobs(id) ON DELETE SET NULL,
  job_num text NOT NULL,
  main_operation_code text NOT NULL,
  route_occurrence_key text NOT NULL,
  route_position integer,
  state text NOT NULL DEFAULT 'WAITING' CHECK(state IN ('WAITING','IN_PROGRESS','DONE','HOLD','CANCELLED')),
  actual_start timestamptz,
  actual_end timestamptz,
  good_qty numeric,
  reject_qty numeric,
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor text NOT NULL DEFAULT 'PUBLIC_UI',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_job_execution_time_ck CHECK(actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start),
  CONSTRAINT erp_job_execution_occurrence_ux UNIQUE(job_num,route_occurrence_key)
);

CREATE INDEX IF NOT EXISTS ix_erp_job_execution_batch
  ON public.erp_job_operation_execution(batch_id,state,updated_at DESC);

CREATE INDEX IF NOT EXISTS ix_erp_job_execution_job
  ON public.erp_job_operation_execution(job_num,route_position,state);

CREATE TABLE IF NOT EXISTS public.erp_inspection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_num text NOT NULL,
  route_occurrence_key text NOT NULL,
  route_position integer,
  operation_code text NOT NULL,
  inspection_type text NOT NULL DEFAULT 'INTERMEDIATE' CHECK(inspection_type IN ('INTERMEDIATE','FINAL')),
  status text NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING','IN_PROGRESS','PASSED','FAILED','SKIPPED')),
  actual_start timestamptz,
  actual_end timestamptz,
  result_code text,
  notes text,
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor text NOT NULL DEFAULT 'PUBLIC_UI',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_inspection_time_ck CHECK(actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start),
  CONSTRAINT erp_inspection_occurrence_ux UNIQUE(job_num,route_occurrence_key)
);

CREATE INDEX IF NOT EXISTS ix_erp_inspection_job
  ON public.erp_inspection_events(job_num,route_position,status);

CREATE INDEX IF NOT EXISTS ix_erp_inspection_status
  ON public.erp_inspection_events(status,updated_at DESC);

ALTER TABLE public.planning_batches
  ADD COLUMN IF NOT EXISTS actual_start timestamptz,
  ADD COLUMN IF NOT EXISTS actual_end timestamptz;

INSERT INTO public.config_settings(setting_key,category,label,data_type,value_json,enabled,description)
VALUES
('execution.actualEnabled','EXECUTION','Job Actual Execution','boolean','true'::jsonb,true,'Capture Job/Main actual start and end against the committed route occurrence.'),
('inspection.actualEnabled','EXECUTION','Inspection Actual','boolean','true'::jsonb,true,'Capture Intermediate and Final inspection status per physical-route occurrence.'),
('inspection.failedBlocksOutput','EXECUTION','Failed Inspection Blocks Output','boolean','true'::jsonb,true,'FAILED inspection prevents the Job from contributing to output until disposition changes.'),
('execution.autoAdvanceBatchStatus','EXECUTION','Auto Advance Batch Status','boolean','true'::jsonb,true,'Starting any Batch member advances Batch to STARTED; completing all members advances Batch to COMPLETED.')
ON CONFLICT(setting_key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,enabled=true,description=EXCLUDED.description,updated_at=now();
