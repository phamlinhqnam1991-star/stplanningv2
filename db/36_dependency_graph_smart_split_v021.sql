-- ST Planning v021 — Full Route Dependency Graph + Smart Batch Split
-- Run after v020.2. This file contains 2 statements (Aiven-safe: <= 8).

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('capacity.dependencyGraphEnabled','CAPACITY_MODEL','Full Route Dependency Graph','boolean','true'::jsonb,true,'Build Job-level predecessor edges between all finite-capacity Main Operation batches. Downstream batch readiness is the latest ready time across all member Jobs.'),
('capacity.smartBatchSplitEnabled','CAPACITY_MODEL','Smart Batch Split','boolean','true'::jsonb,true,'Allow the simulator to trial-split PROPOSED batches when a late Job subset blocks ready Jobs. Existing/production batches are never auto-split.'),
('capacity.smartBatchSplitOnlyWhenTargetRecovery','CAPACITY_MODEL','Split Only for Target Recovery','boolean','true'::jsonb,true,'Run Smart Batch Split only when the unsplit finite-capacity forecast is below the ST Output target.'),
('capacity.smartBatchSplitDelayThresholdMinutes','CAPACITY_MODEL','Split Delay Threshold Minutes','number','60'::jsonb,true,'Minimum route-ready gap between adjacent Jobs that can create a split boundary. Baseline: 60 minutes.'),
('capacity.smartBatchSplitMinReadyJobs','CAPACITY_MODEL','Minimum Ready Jobs Before Split','number','2'::jsonb,true,'The early sub-batch must contain at least this many route-ready Jobs before a split is considered.'),
('capacity.smartBatchSplitMinReadySurfaceDm2','CAPACITY_MODEL','Minimum Ready Surface Before Split','number','500'::jsonb,true,'The early sub-batch must contain at least this surface before a split is considered.'),
('capacity.smartBatchSplitMaxParts','CAPACITY_MODEL','Maximum Smart Split Parts','number','3'::jsonb,true,'Maximum number of trial sub-batches created from one proposed batch.'),
('capacity.smartBatchSplitPenaltyMinutes','CAPACITY_MODEL','Smart Split Penalty Minutes','number','10'::jsonb,true,'Conservative extra elapsed minutes added to every smart-split sub-batch for duplicated handling/setup. The split is kept only if the complete re-simulation improves the target result.')
ON CONFLICT (setting_key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,enabled=true,description=EXCLUDED.description,updated_at=now();

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('stOutput.timeModelVersion','ST_OUTPUT_MODEL','Time Model Version','string','"V021_FULL_ROUTE_DEPENDENCY_SMART_SPLIT"'::jsonb,true,'Finite-capacity ST Output simulation includes the complete batch dependency graph and target-recovery Smart Batch Split with full re-simulation before accepting a split.')
ON CONFLICT (setting_key) DO UPDATE SET value_json=EXCLUDED.value_json,description=EXCLUDED.description,enabled=true,updated_at=now();
