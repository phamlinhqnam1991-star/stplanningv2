-- ST Planning v026.8 — Predictive ETA P50/P80 from Actual History
-- EXACTLY 4 SQL statements. Run after db/44_proposed_plan_accept_v026_7.sql.

CREATE INDEX IF NOT EXISTS ix_erp_execution_predictive_history
  ON public.erp_job_operation_execution(main_operation_code,actual_end DESC)
  WHERE state='DONE' AND actual_start IS NOT NULL AND actual_end IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_erp_inspection_predictive_history
  ON public.erp_inspection_events(operation_code,actual_end DESC)
  WHERE status IN ('PASSED','FAILED','SKIPPED') AND actual_start IS NOT NULL AND actual_end IS NOT NULL;

INSERT INTO public.config_settings(setting_key,category,label,data_type,value_json,enabled,description)
VALUES
('predictiveEta.enabled','PREDICTIVE_ETA','Predictive ETA Enabled','boolean','true'::jsonb,true,'Use actual execution history to calculate P50/P80 process duration by Main Operation and Recipe.'),
('predictiveEta.lookbackDays','PREDICTIVE_ETA','History Lookback Days','number','180'::jsonb,true,'Only completed actual execution within this lookback window is used.'),
('predictiveEta.minSamples','PREDICTIVE_ETA','Minimum Samples','number','5'::jsonb,true,'Minimum sample count before historical P50/P80 may influence ETA.'),
('predictiveEta.blendPct','PREDICTIVE_ETA','P50 Blend Percent','number','50'::jsonb,true,'Percent of historical P50 blended with configured Process Time when both exist.'),
('predictiveEta.p80RiskAlert','PREDICTIVE_ETA','P80 Risk Alert','boolean','true'::jsonb,true,'Flag Jobs whose P50 is on time but P80 crosses Final Gate cutoff.'),
('predictiveEta.p80BlocksForecast','PREDICTIVE_ETA','P80 Blocks Forecast','boolean','false'::jsonb,true,'When enabled, P80-after-cutoff is treated as AT_RISK instead of counted forecast.')
ON CONFLICT(setting_key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,enabled=true,description=EXCLUDED.description,updated_at=now();

ANALYZE public.erp_job_operation_execution;

ANALYZE public.erp_inspection_events;
