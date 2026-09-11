-- ST Planning v015 — ST Output Target Configuration Seed
-- Max 8 statements per file.

-- 1. Output states are display/configuration data, not hard-coded business labels.
INSERT INTO config_items (category,code,label,enabled,sort_order,data)
VALUES
('ST_OUTPUT_STATUS','OUTPUT','Output',true,10,'{"color":"#178750","countsActual":true}'::jsonb),
('ST_OUTPUT_STATUS','COMMITTED','Committed',true,20,'{"color":"#1667b1","countsPlanned":true}'::jsonb),
('ST_OUTPUT_STATUS','PLANNED','Planned',true,30,'{"color":"#7c3aed","countsPlanned":true}'::jsonb),
('ST_OUTPUT_STATUS','NEED_PLAN','Need Plan',true,40,'{"color":"#b7791f","recommendable":true}'::jsonb),
('ST_OUTPUT_STATUS','AT_RISK','At Risk / Miss',true,50,'{"color":"#b42318"}'::jsonb),
('ST_OUTPUT_STATUS','REVIEW','Review',true,60,'{"color":"#c2410c"}'::jsonb),
('ST_OUTPUT_STATUS','OUTPUT_OTHER_DAY','Output Other Day',true,70,'{"color":"#64748b"}'::jsonb),
('ST_OUTPUT_STATUS','NOT_APPLICABLE','Not Applicable',true,80,'{"color":"#94a3b8"}'::jsonb)
ON CONFLICT (category,code) DO NOTHING;

-- 2. Engine settings. FINSST and 15:00 are seeds and remain editable in Configuration.
INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description)
VALUES
('stOutput.endpointOperationCode','ST_OUTPUT_MODEL','Final ST Operation','string','"FINSST"'::jsonb,true,'A Job reaches ST Output when it arrives at this route operation.'),
('stOutput.defaultCutoffTime','ST_OUTPUT_MODEL','Default Output Cutoff','string','"15:00"'::jsonb,true,'Daily cutoff used to decide whether arrival at Final ST contributes to the target.'),
('stOutput.defaultTargetValue','ST_OUTPUT_MODEL','Default Daily Target','number','50000'::jsonb,true,'Default ST Output target used when the selected date has no saved target.'),
('stOutput.metricCode','ST_OUTPUT_MODEL','Output Metric','string','"SURFACE_DM2"'::jsonb,true,'ST Output target metric.'),
('stOutput.surfaceCalculationMode','ST_OUTPUT_MODEL','Surface Contribution Formula','string','"DIRECT"'::jsonb,true,'DIRECT uses Planning Surface dm2 as-is. Alternatives: SURFACE_X_PROD_QTY or SURFACE_X_GOOD_WIP_QTY.'),
('stOutput.timezoneOffsetMinutes','ST_OUTPUT_MODEL','Timezone Offset Minutes','number','420'::jsonb,true,'Vietnam wall-clock offset used for route snapshot and cutoff calculations.'),
('stOutput.includeNonPlanningOperations','ST_OUTPUT_MODEL','Include Non-Planning Route Steps','boolean','true'::jsonb,true,'Include every remaining route step between NextOperation and FINSST. Missing process times follow the configured Unknown Process Time Policy.'),
('stOutput.unknownStepPolicy','ST_OUTPUT_MODEL','Unknown Process Time Policy','string','"REVIEW_ZERO"'::jsonb,true,'REVIEW_ZERO keeps the route visible with configured fallback time; BLOCK prevents a feasibility conclusion.'),
('stOutput.defaultUnknownMinutes','ST_OUTPUT_MODEL','Unknown Step Fallback Minutes','number','0'::jsonb,true,'Used only when Unknown Process Time Policy is REVIEW_ZERO. The row is still flagged for review.'),
('stOutput.countReadyAtEndpointAsOutput','ST_OUTPUT_MODEL','NextOperation FINSST Counts as Arrival','boolean','true'::jsonb,true,'If the route snapshot shows NextOperation=FINSST before cutoff, the Job has reached Final ST and counts as Output.'),
('stOutput.completedDateAssumeBeforeCutoff','ST_OUTPUT_MODEL','Assume Date-Only Completion Before Cutoff','boolean','false'::jsonb,true,'Keep false unless the source guarantees date-only FINSST completion occurred before the cutoff.'),
('stOutput.recommendationStrategy','ST_OUTPUT_MODEL','Recommendation Strategy','string','"EARLIEST_FINISH_THEN_SURFACE"'::jsonb,true,'Select NEED_PLAN Jobs by earliest FINSST arrival, shortest remaining time, then surface contribution.'),
('stOutput.maxScanJobs','ST_OUTPUT_MODEL','Maximum Jobs Per Target Scan','number','7000'::jsonb,true,'Upper bound for active Planning Jobs evaluated by the ST Output Target engine.')
ON CONFLICT (setting_key) DO NOTHING;

-- 3. Make the new configuration family visible to the generic Configuration Center.
INSERT INTO config_items (category,code,label,enabled,sort_order,data)
VALUES ('CONFIG_CATEGORY','ST_OUTPUT_STATUS','ST Output Status',true,95,'{"description":"Output forecast and target states."}'::jsonb)
ON CONFLICT (category,code) DO NOTHING;

-- 4. Reserve ST_OUTPUT rule type for future per-program/area target policies without code changes.
INSERT INTO config_items (category,code,label,enabled,sort_order,data)
VALUES ('RULE_TYPE','ST_OUTPUT','ST Output Rule',true,95,'{"description":"Target eligibility, scoring and cutoff overrides."}'::jsonb)
ON CONFLICT (category,code) DO NOTHING;
