-- ST Planning v026.2 — Commitment Ledger + Batch Lifecycle + Audit Trail
-- Aiven/Supabase-safe deployment rule: EXACTLY 10 SQL statements.
-- Run after db/40_production_snapshot_proposed_plan_v025.sql.

ALTER TABLE public.planning_batches
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.planning_batch_jobs
  ADD COLUMN IF NOT EXISTS route_occurrence_key text,
  ADD COLUMN IF NOT EXISTS route_position integer,
  ADD COLUMN IF NOT EXISTS main_operation_code text;

CREATE TABLE IF NOT EXISTS public.erp_job_commitments (
  id bigserial PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.planning_batches(id) ON DELETE CASCADE,
  batch_job_id bigint REFERENCES public.planning_batch_jobs(id) ON DELETE CASCADE,
  planning_job_id bigint,
  job_num text NOT NULL,
  main_operation_code text NOT NULL,
  route_occurrence_key text NOT NULL,
  route_position integer,
  state text NOT NULL DEFAULT 'ACTIVE',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_erp_job_commitments_active_job_main
  ON public.erp_job_commitments (upper(btrim(job_num)), upper(btrim(main_operation_code)))
  WHERE state='ACTIVE';

CREATE INDEX IF NOT EXISTS ix_erp_job_commitments_batch
  ON public.erp_job_commitments (batch_id, state, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.erp_audit_events (
  id bigserial PRIMARY KEY,
  event_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  job_num text,
  batch_id uuid,
  actor text NOT NULL DEFAULT 'PUBLIC_UI',
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  old_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_erp_audit_events_entity
  ON public.erp_audit_events (entity_type, entity_id, created_at DESC);

UPDATE public.config_items
SET data = COALESCE(data,'{}'::jsonb) || CASE code
  WHEN 'DRAFT' THEN '{"allowedTo":["READY","CANCELLED"],"blocksCandidate":true,"allowDelete":true,"terminal":false}'::jsonb
  WHEN 'READY' THEN '{"allowedTo":["DRAFT","SCHEDULED","CANCELLED"],"blocksCandidate":true,"allowDelete":false,"terminal":false}'::jsonb
  WHEN 'SCHEDULED' THEN '{"allowedTo":["READY","STARTED","CANCELLED"],"blocksCandidate":true,"allowDelete":false,"terminal":false}'::jsonb
  WHEN 'STARTED' THEN '{"allowedTo":["SCHEDULED","COMPLETED","CANCELLED"],"blocksCandidate":true,"allowDelete":false,"terminal":false}'::jsonb
  WHEN 'COMPLETED' THEN '{"allowedTo":[],"blocksCandidate":false,"allowDelete":false,"terminal":true}'::jsonb
  WHEN 'CANCELLED' THEN '{"allowedTo":[],"blocksCandidate":false,"allowDelete":false,"terminal":true}'::jsonb
  ELSE '{}'::jsonb
END,
updated_at=now()
WHERE category='BATCH_STATUS';

INSERT INTO public.config_settings (setting_key,category,label,data_type,value_json,enabled,description)
VALUES
('batchModel.requireExpectedVersion','BATCH_MODEL','Require Batch Version Check','boolean','true'::jsonb,true,'Reject stale status/delete writes when the client version does not match the current Batch version.'),
('batchModel.commitmentScope','BATCH_MODEL','Active Commitment Scope','string','"JOB_MAIN"'::jsonb,true,'At most one ACTIVE commitment is allowed for the same Job + Main Operation. This remains valid across import snapshots.'),
('batchModel.auditActorFallback','BATCH_MODEL','Audit Actor Fallback','string','"PUBLIC_UI"'::jsonb,true,'Actor stored in ERP Audit Trail while the app is intentionally running without login.')
ON CONFLICT (setting_key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,enabled=true,description=EXCLUDED.description,updated_at=now();

INSERT INTO public.erp_job_commitments (
  batch_id,batch_job_id,planning_job_id,job_num,main_operation_code,route_occurrence_key,route_position,state
)
SELECT
  b.id,j.id,j.planning_job_id,j.job_num,b.main_operation_code,
  COALESCE(NULLIF(j.route_occurrence_key,''),'LEGACY:'||j.id::text),j.route_position,
  CASE WHEN b.status='COMPLETED' THEN 'COMPLETED' WHEN b.status='CANCELLED' THEN 'CANCELLED' ELSE 'ACTIVE' END
FROM public.planning_batch_jobs j
JOIN public.planning_batches b ON b.id=j.batch_id
ON CONFLICT DO NOTHING;
