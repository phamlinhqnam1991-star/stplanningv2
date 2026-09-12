-- ST Planning v018 — Detailed Chemical Line segmented finite-capacity model
-- Run after v017. This file contains 3 statements (Aiven-safe: <= 8).

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('capacity.chemicalLineSegmented','CAPACITY_MODEL','Chemical Line Segmented Scheduler','boolean','true'::jsonb,true,'Schedule Chemical Line as Loading → Process → optional NDT → Unloading instead of one monolithic block.'),
('capacity.chemicalLineResourceCode','CAPACITY_MODEL','Chemical Line Resource','string','"FLYBAR"'::jsonb,true,'Base finite-capacity resource used by the segmented Chemical Line scheduler.'),
('capacity.chemicalLineProcessMaxConcurrent','CAPACITY_MODEL','Chemical Process Max Concurrent','number','3'::jsonb,true,'Approved maximum number of Chemical Line Process segments running concurrently across all six Flybars.'),
('capacity.chemicalLineNdtRecipeNos','CAPACITY_MODEL','Preclean NDT Recipe Nos','json','["001","009","016","025"]'::jsonb,true,'Recipes requiring the fixed NDT segment after Chemical Line Process.'),
('capacity.chemicalLineNdtMinutes','CAPACITY_MODEL','Chemical NDT Duration Minutes','number','300'::jsonb,true,'Approved fixed NDT duration = 5 hours.'),
('capacity.chemicalLineNdtStartSpacingMinutes','CAPACITY_MODEL','NDT Start Spacing Minutes','number','90'::jsonb,true,'Approved minimum spacing between NDT start times of different Flybars = 1h30.'),
('capacity.chemicalLineLoadingDefaultMinutes','CAPACITY_MODEL','Chemical Loading Default Minutes','number','30'::jsonb,true,'v017 baseline loading duration for normal Chemical Line batch.'),
('capacity.chemicalLineLoadingHeavyMinutes','CAPACITY_MODEL','Chemical Loading Heavy Minutes','number','45'::jsonb,true,'v017 baseline loading duration when batch Qty/Surface crosses configured heavy threshold.'),
('capacity.chemicalLineLoadingQtyThreshold','CAPACITY_MODEL','Chemical Loading Heavy Qty Threshold','number','501'::jsonb,true,'Batch Qty at or above this value uses heavy loading duration.'),
('capacity.chemicalLineLoadingSurfaceThresholdDm2','CAPACITY_MODEL','Chemical Loading Heavy Surface Threshold','number','5001'::jsonb,true,'Batch Surface dm² at or above this value uses heavy loading duration.'),
('capacity.chemicalLineUnloadingDefaultMinutes','CAPACITY_MODEL','Chemical Unloading Default Minutes','number','30'::jsonb,true,'v017 baseline unloading duration for normal Chemical Line batch.'),
('capacity.chemicalLineUnloadingHeavyMinutes','CAPACITY_MODEL','Chemical Unloading Heavy Minutes','number','45'::jsonb,true,'v017 baseline unloading duration when batch Qty/Surface crosses configured heavy threshold.'),
('capacity.chemicalLineUnloadingQtyThreshold','CAPACITY_MODEL','Chemical Unloading Heavy Qty Threshold','number','501'::jsonb,true,'Batch Qty at or above this value uses heavy unloading duration.'),
('capacity.chemicalLineUnloadingSurfaceThresholdDm2','CAPACITY_MODEL','Chemical Unloading Heavy Surface Threshold','number','5001'::jsonb,true,'Batch Surface dm² at or above this value uses heavy unloading duration.'),
('capacity.chemicalLineExistingSchedulePolicy','CAPACITY_MODEL','Existing Chemical Schedule Policy','string','"CONSERVATIVE_PROCESS_BLOCK"'::jsonb,true,'Existing Main Planning Flybar rows have no segment timestamps; conservatively count their scheduled block against shared Process concurrency while preserving physical Flybar occupancy.')
ON CONFLICT (setting_key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,enabled=true,description=EXCLUDED.description,updated_at=now();

UPDATE config_items
SET data = data || '{"segmentedScheduler":true,"segmentOrder":["LOADING","PROCESS","WAIT_NDT","NDT","UNLOADING"],"processMaxConcurrent":3,"ndtStartSpacingMinutes":90,"seedVersion":"v018","sourceBasis":"approved 6 flybars / max 3 concurrent Process segments / 5h NDT / 1h30 NDT-start spacing"}'::jsonb,
    updated_at = now()
WHERE category='CAPACITY_RESOURCE' AND code='FLYBAR';

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('stOutput.timeModelVersion','ST_OUTPUT_MODEL','Time Model Version','string','"V018_CHEMICAL_SEGMENTED"'::jsonb,true,'Finite-capacity target simulation uses detailed Chemical Line Loading → Process → NDT → Unloading segmentation with Flybar/process/NDT constraints.')
ON CONFLICT (setting_key) DO UPDATE SET value_json=EXCLUDED.value_json,description=EXCLUDED.description,enabled=true,updated_at=now();
