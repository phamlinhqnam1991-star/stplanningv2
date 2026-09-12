-- ST Planning v024 — What-if / Target Optimizer
-- Run after v023. This file contains 2 statements (Aiven-safe: <= 8).

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('capacity.whatIfEnabled','CAPACITY_MODEL','What-if / Target Optimizer','boolean','true'::jsonb,true,'Enable simulation-only capacity what-if comparison and optimizer trials. No real batch or schedule data is changed.'),
('capacity.whatIfMaxAutoTrials','CAPACITY_MODEL','What-if Max Auto Trials','number','6'::jsonb,true,'Maximum automatic alternative scenarios evaluated per optimizer run.'),
('capacity.whatIfCutoffExtensionsMinutes','CAPACITY_MODEL','What-if Cutoff Extensions','json','[60,120]'::jsonb,true,'Optional FINSST cutoff extensions evaluated by the optimizer, in minutes, without changing the saved target.'),
('capacity.whatIfChemicalConcurrencyBoost','CAPACITY_MODEL','What-if Chemical Concurrency Boost','number','1'::jsonb,true,'Temporary increase in Chemical Line shared Process concurrency used by an optimizer trial.'),
('capacity.whatIfLaborBoost','CAPACITY_MODEL','What-if Labor Boost','number','1'::jsonb,true,'Temporary operator increase used by Masking and Unmasking optimizer trials.'),
('capacity.whatIfTryCutoffExtension','CAPACITY_MODEL','Try Cutoff Extension','boolean','true'::jsonb,true,'Allow automatic cutoff extension trials.'),
('capacity.whatIfTryChemicalConcurrency','CAPACITY_MODEL','Try Chemical Concurrency','boolean','true'::jsonb,true,'Allow automatic Chemical Process concurrency boost trial.'),
('capacity.whatIfTryMaskingLabor','CAPACITY_MODEL','Try Masking Labor','boolean','true'::jsonb,true,'Allow automatic Masking labor boost trial.'),
('capacity.whatIfTryUnmaskingLabor','CAPACITY_MODEL','Try Unmasking Labor','boolean','true'::jsonb,true,'Allow automatic Unmasking labor boost trial.')
ON CONFLICT (setting_key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,enabled=true,description=EXCLUDED.description,updated_at=now();

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('stOutput.timeModelVersion','ST_OUTPUT_MODEL','Time Model Version','string','"V024_WHAT_IF_TARGET_OPTIMIZER"'::jsonb,true,'v024 retains full route dependency, Smart Split, segmented Chemical/Paint/Manual finite capacity, Critical Path, Recovery and Backward Target Plan, and adds simulation-only what-if scenario comparison / target optimizer.')
ON CONFLICT (setting_key) DO UPDATE SET value_json=EXCLUDED.value_json,description=EXCLUDED.description,enabled=true,updated_at=now();
