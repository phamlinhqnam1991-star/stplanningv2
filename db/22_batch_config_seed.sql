-- ST Planning v014 — Batch Configuration Seed
-- Max 8 statements per file.

INSERT INTO config_items (category,code,label,enabled,sort_order,data)
VALUES
('BATCH_KEY_FIELD','MAIN_OPERATION','Main Operation',true,10,'{"sourceKind":"BUILTIN","builtInField":"MAIN_OPERATION"}'::jsonb),
('BATCH_KEY_FIELD','RECIPE_NO','Recipe No.',true,20,'{"sourceKind":"BUILTIN","builtInField":"RECIPE_NO"}'::jsonb),
('BATCH_KEY_FIELD','RECIPE_NAME','Recipe Name',true,30,'{"sourceKind":"BUILTIN","builtInField":"RECIPE_NAME"}'::jsonb),
('BATCH_KEY_FIELD','PROGRAM','Program',true,40,'{"sourceKind":"BUILTIN","builtInField":"PROGRAM"}'::jsonb),
('BATCH_KEY_FIELD','PART','Part',true,50,'{"sourceKind":"BUILTIN","builtInField":"PART"}'::jsonb),
('BATCH_KEY_FIELD','REVISION','Revision',true,60,'{"sourceKind":"BUILTIN","builtInField":"REVISION"}'::jsonb),
('BATCH_KEY_FIELD','PART_CLUSTER','Part Cluster',true,70,'{"sourceKind":"BUILTIN","builtInField":"PART_CLUSTER"}'::jsonb),
('BATCH_KEY_FIELD','NEXT_OPERATION','Next Operation',true,80,'{"sourceKind":"BUILTIN","builtInField":"NEXT_OPERATION"}'::jsonb),
('BATCH_KEY_FIELD','NEXT_ST_OPERATION','Next ST Operation',true,90,'{"sourceKind":"BUILTIN","builtInField":"NEXT_ST_OPERATION"}'::jsonb),
('BATCH_KEY_FIELD','PLANNER','Planner',true,100,'{"sourceKind":"BUILTIN","builtInField":"PLANNER"}'::jsonb),
('BATCH_KEY_FIELD','SCHEDULE_AREA','Schedule Area',true,110,'{"sourceKind":"BUILTIN","builtInField":"SCHEDULE_AREA"}'::jsonb),
('BATCH_KEY_FIELD','PHYSICAL_AREA','Physical Area',true,120,'{"sourceKind":"BUILTIN","builtInField":"PHYSICAL_AREA"}'::jsonb),
('BATCH_KEY_FIELD','ST_GROUP','ST Group',true,130,'{"sourceKind":"BUILTIN","builtInField":"ST_GROUP"}'::jsonb),
('BATCH_KEY_FIELD','PROCESS_TIME_MINUTES','Process Time Minutes',true,140,'{"sourceKind":"BUILTIN","builtInField":"PROCESS_TIME_MINUTES"}'::jsonb)
ON CONFLICT (category,code) DO NOTHING;

INSERT INTO config_items (category,code,label,enabled,sort_order,data)
VALUES
('BATCH_STATUS','DRAFT','Draft',true,10,'{"color":"#64748b","blocksCandidate":true,"allowDelete":true}'::jsonb),
('BATCH_STATUS','READY','Ready',true,20,'{"color":"#1667b1","blocksCandidate":true,"allowDelete":false}'::jsonb),
('BATCH_STATUS','SCHEDULED','Scheduled',true,30,'{"color":"#7c3aed","blocksCandidate":true,"allowDelete":false}'::jsonb),
('BATCH_STATUS','STARTED','Started',true,40,'{"color":"#b7791f","blocksCandidate":true,"allowDelete":false}'::jsonb),
('BATCH_STATUS','COMPLETED','Completed',true,50,'{"color":"#178750","blocksCandidate":false,"allowDelete":false}'::jsonb),
('BATCH_STATUS','CANCELLED','Cancelled',true,60,'{"color":"#b42318","blocksCandidate":false,"allowDelete":false}'::jsonb)
ON CONFLICT (category,code) DO NOTHING;

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description)
VALUES
('batchModel.defaultKeyFields','BATCH_MODEL','Default Batch Key Fields','json','["MAIN_OPERATION","RECIPE_NO"]'::jsonb,true,'Fallback Batch Key dimensions when a Batch Rule does not define keyFields.'),
('batchModel.defaultDelimiter','BATCH_MODEL','Batch Key Delimiter','string','"|"'::jsonb,true,'Delimiter used to compose automatic Batch Keys.'),
('batchModel.manualKeyAllowed','BATCH_MODEL','Allow Manual Batch Key','boolean','true'::jsonb,true,'Planner may override the automatic Batch Key when creating a batch.'),
('batchModel.requireSameBatchKey','BATCH_MODEL','Require Same Batch Key','boolean','true'::jsonb,true,'Selected jobs must share the same configured automatic Batch Key unless a future rule explicitly changes this behavior.'),
('batchModel.defaultProcessTimeAggregation','BATCH_MODEL','Batch Process Time Aggregation','string','"MAX"'::jsonb,true,'How selected job process-time suggestions become batch process time: MAX, SUM, MIN or FIRST.'),
('batchModel.batchNumberPattern','BATCH_MODEL','Batch Number Pattern','string','"{SHORT}_{YYYYMMDD}_{SEQ3}"'::jsonb,true,'Supported placeholders: {SHORT}, {MAIN}, {YYYYMMDD}, {DDMMM}, {SEQ3}, {SEQ4}.'),
('batchModel.candidateScanLimit','BATCH_MODEL','Candidate Scan Limit','number','1000'::jsonb,true,'Maximum active Planning rows evaluated per Candidate request. Increase carefully on small Aiven services.'),
('batchModel.initialStatus','BATCH_MODEL','Initial Batch Status','string','"DRAFT"'::jsonb,true,'Status assigned when a new batch is created.')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO config_rules (rule_type,code,name,enabled,priority,condition_json,action_json,notes)
VALUES (
'BATCH','DEFAULT_BATCH','Default Batch Rule',true,1000,'{}'::jsonb,
'{"keyFields":["MAIN_OPERATION","RECIPE_NO"],"delimiter":"|","ignoreEmptyKeyParts":true,"requireRecipe":false,"blockReviewCandidates":false,"maxJobs":null,"maxQty":null,"maxSurfaceDm2":null,"processTimeAggregation":"MAX"}'::jsonb,
'Fallback only. Create lower-priority Main Operation rules in CFG-93 for operation-specific limits and key fields.'
)
ON CONFLICT (rule_type,code) DO NOTHING;
