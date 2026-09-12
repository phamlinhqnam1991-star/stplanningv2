-- ST Planning v026.3 — Transactional Scheduling + Resource Reservation Ledger
-- EXACTLY 7 SQL statements. Run after db/41_commitment_lifecycle_audit_v026_2.sql.

CREATE TABLE IF NOT EXISTS public.erp_schedule_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.planning_batches(id) ON DELETE CASCADE,
  batch_no text NOT NULL,
  main_operation_code text NOT NULL,
  base_resource_code text NOT NULL,
  resource_code text NOT NULL,
  resource_type text NOT NULL DEFAULT 'FINITE_RESOURCE',
  phase text NOT NULL DEFAULT 'NORMAL',
  schedule_date date NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','CANCELLED','COMPLETED')),
  source_type text NOT NULL DEFAULT 'MANUAL' CHECK(source_type IN ('MANUAL','PROPOSAL_ACCEPT','SYSTEM_RECOVERY')),
  capacity_units integer NOT NULL DEFAULT 1 CHECK(capacity_units > 0),
  batch_version_snapshot integer NOT NULL DEFAULT 1,
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'PUBLIC_UI',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_schedule_reservations_time_ck CHECK(end_at > start_at)
);

CREATE INDEX IF NOT EXISTS ix_erp_schedule_reservations_resource_time
  ON public.erp_schedule_reservations(resource_code,start_at,end_at)
  WHERE state='ACTIVE';

CREATE INDEX IF NOT EXISTS ix_erp_schedule_reservations_batch
  ON public.erp_schedule_reservations(batch_id,state,start_at);

CREATE INDEX IF NOT EXISTS ix_erp_schedule_reservations_date
  ON public.erp_schedule_reservations(schedule_date,state,resource_code);

ALTER TABLE public.planning_batches
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

INSERT INTO public.config_settings (setting_key,category,label,data_type,value_json,enabled,description)
VALUES
('scheduling.transactionalEnabled','SCHEDULING','Transactional Scheduling','boolean','true'::jsonb,true,'Create and edit resource reservations inside PostgreSQL transactions with overlap revalidation.'),
('scheduling.requireExpectedBatchVersion','SCHEDULING','Require Batch Version','boolean','true'::jsonb,true,'Reject stale schedule writes when the Batch version changed after the screen was loaded.'),
('scheduling.preventExactResourceOverlap','SCHEDULING','Prevent Resource Overlap','boolean','true'::jsonb,true,'Reject overlapping ACTIVE reservations on the same exact finite resource instance.'),
('scheduling.importedScheduleReadOnly','SCHEDULING','Imported Schedule Read Only','boolean','true'::jsonb,true,'Legacy imported schedule remains visible as read-only baseline; new ERP reservations are transactional.')
ON CONFLICT (setting_key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,enabled=true,description=EXCLUDED.description,updated_at=now();

UPDATE public.config_items
SET data=COALESCE(data,'{}'::jsonb) || '{"erpReservation":true}'::jsonb,updated_at=now()
WHERE category='RESOURCE' AND enabled=true;
