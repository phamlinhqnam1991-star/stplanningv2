-- ST Planning v022 — Critical Path + Bottleneck + Recovery Engine
-- Run after v021. This file contains 2 statements (Aiven-safe: <= 8).

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('capacity.criticalPathEnabled','CAPACITY_MODEL','Critical Path Analysis','boolean','true'::jsonb,true,'Calculate finite-capacity critical routes from current WIP through all scheduled Main Operation batches to FINSST.'),
('capacity.criticalPathNearCutoffMinutes','CAPACITY_MODEL','Critical Near-Cutoff Window Minutes','number','60'::jsonb,true,'Include on-time Jobs in Critical Path when their FINSST slack is less than or equal to this threshold. Baseline: 60 minutes.'),
('capacity.bottleneckTopN','CAPACITY_MODEL','Bottleneck Top N','number','10'::jsonb,true,'Maximum number of ranked finite-capacity/readiness bottlenecks returned by the Target Engine.'),
('capacity.bottleneckMinDelayMinutes','CAPACITY_MODEL','Bottleneck Minimum Delay Minutes','number','15'::jsonb,true,'Ignore small route-gate/resource waits below this threshold when building bottleneck ranking. Baseline: 15 minutes.'),
('capacity.recoveryEnabled','CAPACITY_MODEL','Recovery Re-Simulation','boolean','true'::jsonb,true,'Enable non-destructive finite-capacity recovery trials. Trials never write to planning or scheduling tables.'),
('capacity.recoveryOnlyWhenTargetGap','CAPACITY_MODEL','Recovery Only When Target Has Gap','boolean','true'::jsonb,true,'Run priority recovery trials only when the current finite-capacity forecast remains below ST Output target. Verified Smart Batch Split is still reported when already applied.'),
('capacity.recoveryMaxTrials','CAPACITY_MODEL','Maximum Recovery Trials','number','4'::jsonb,true,'Maximum number of additional full finite-capacity re-simulations used to test priority recovery options per Target calculation.'),
('capacity.recoveryMinRecoveredSurfaceDm2','CAPACITY_MODEL','Minimum Recovered Output dm2','number','100'::jsonb,true,'Only show a recovery trial as a recommendation when re-simulation recovers at least this much ST Output, unless Include No-Gain Trials is enabled.'),
('capacity.recoveryIncludeNoGainTrials','CAPACITY_MODEL','Show No-Gain Recovery Trials','boolean','false'::jsonb,true,'When enabled, also return recovery trials that were re-simulated but did not improve output before FINSST cutoff.')
ON CONFLICT (setting_key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,enabled=true,description=EXCLUDED.description,updated_at=now();

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('stOutput.timeModelVersion','ST_OUTPUT_MODEL','Time Model Version','string','"V022_CRITICAL_PATH_BOTTLENECK_RECOVERY"'::jsonb,true,'Finite-capacity ST Output simulation includes full-route Critical Path analysis, ranked bottlenecks and non-destructive verified recovery re-simulations on top of v021 dependency graph + Smart Batch Split.')
ON CONFLICT (setting_key) DO UPDATE SET value_json=EXCLUDED.value_json,description=EXCLUDED.description,enabled=true,updated_at=now();
