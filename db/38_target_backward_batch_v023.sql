-- ST Planning v023 — Target Backward Batch Generator
-- Run after v022. This file contains 2 statements (Aiven-safe: <= 8).

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('capacity.backwardTargetEnabled','CAPACITY_MODEL','Target Backward Batch Plan','boolean','true'::jsonb,true,'Build a non-destructive backward requirement plan from FINSST cutoff through every finite-capacity batch required by the selected target-output Job portfolio.'),
('capacity.backwardTargetReservePct','CAPACITY_MODEL','Backward Target Reserve %','number','0'::jsonb,true,'Optional additional output reserve when selecting the minimum target Job portfolio. Baseline 0%. Increase only when planners want deliberate buffer above target.'),
('capacity.backwardTargetPlannedFirst','CAPACITY_MODEL','Backward Portfolio Planned First','boolean','true'::jsonb,true,'Use finite-capacity PLANNED Jobs before NEED_PLAN Jobs when selecting the minimum Job portfolio required to close the ST Output target gap.'),
('capacity.backwardTargetPortfolioSort','CAPACITY_MODEL','Backward Portfolio Sort','string','"EARLIEST_FINISH"'::jsonb,true,'Portfolio ordering after planned-first preference. Supported values: EARLIEST_FINISH or HIGHEST_SURFACE.'),
('capacity.backwardTargetMaxPortfolioJobs','CAPACITY_MODEL','Backward Portfolio Max Jobs','number','500'::jsonb,true,'Safety limit for Jobs selected into one target-backward calculation.'),
('capacity.backwardTargetAreaRollup','CAPACITY_MODEL','Backward Area Rollup','boolean','true'::jsonb,true,'Aggregate required batches into Schedule Area / Planner demand showing unique target dm2, route flow dm2, process load, earliest start and finish deadlines.')
ON CONFLICT (setting_key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,enabled=true,description=EXCLUDED.description,updated_at=now();

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('stOutput.timeModelVersion','ST_OUTPUT_MODEL','Time Model Version','string','"V023_TARGET_BACKWARD_BATCH"'::jsonb,true,'Finite-capacity ST Output simulation includes v022 critical path/bottleneck/recovery plus target-backward Job portfolio selection and batch/recipe/area deadlines calculated from FINSST cutoff.')
ON CONFLICT (setting_key) DO UPDATE SET value_json=EXCLUDED.value_json,description=EXCLUDED.description,enabled=true,updated_at=now();
