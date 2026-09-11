-- ST Planning v010 Configuration Defaults
-- Max 8 statements per file. Safe to run repeatedly.

INSERT INTO config_source_profiles
(source_key, display_name, sheet_name, header_rows, baseline_columns, operation_slots, parser_config)
VALUES
('PLANNING','ST Planning Source','SirusClean_Painting_MasterList',3,148,NULL,
 '{"criticalHeaders":{"A":"PROGRAM","C":"EPICORPART","F":"JOBNUM","H":"NEXTOPERATION","M":"CMSA","AV":"VARNISH"},"coreColumns":{"program":"A","partCluster":"B","epicorPart":"C","surfaceDm2":"D","partDescription":"E","jobNum":"F","lastLaborOp":"G","nextOperation":"H","lastLaborQty":"I","prodQty":"J","currentGoodWipQty":"K","stSourceValue":"AW","stWipArea":"AX","wipSequence":"AY","allOperation":"AZ"},"operationColumnStart":13,"operationColumnEnd":48,"displayColumns":{"alloy":"CD","temper":"CE","revisionNum":"CG","priorityType":"CM","catTransit":"CN","impactSaleValue":"CO"}}'::jsonb),
('SCHEDULING','Main Scheduling Source','Main Planning',2,38,NULL,
 '{"criticalHeaders":{"A":"DATE","D":"SPX CLEAN","Q":"SP#/FB#/PB#","R":"RECIPE#","AJ":"STATUS"},"coreColumns":{"date":"A","day":"B","slot":"C","batch":"Q","recipeNo":"R","recipeDescription":"S","jobCount":"T","pcs":"U","surfaceDm2":"V","start":"W","end":"X","duration":"Y","status":"AJ","comments":"AK"},"resourceColumns":{"D":"SPX_CLEAN","E":"MANUAL_DBL","F":"AUTO_DBL","G":"PLATING","H":"HE_BAKE","I":"PASSIVATION","J":"MANUAL_SP","K":"AUTO_SHP","L":"FLYBAR","M":"CAB1","N":"CAB2","O":"CAB3","P":"PAINT_POWDER"}}'::jsonb),
('ROUTING','All Open Jobs Routing','Sheet1',1,248,36,
 '{"criticalHeaders":{"D":"PROGRAM","E":"EPICORPART","J":"JOBNUM","AC":"NEXTOPERATION","CI":"OP.1","CW":"OPRSEQ.1","IN":"OPRSEQ.36"},"preferredSheetName":"Sheet1","coreColumns":{"program":"D","epicorPart":"E","jobNum":"J","prodQty":"L","lastLaborOp":"M","revisionNum":"X","lastLaborOprSeq":"AB","nextOperation":"AC","jobComplete":"AD","lastCompleteOprSeq":"AZ"},"operationPrefixes":{"operation":"Op.","complete":"OpC.","nonconformance":"OpenNonConfOp.","sequence":"OprSeq."}}'::jsonb)
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO config_items (category, code, label, sort_order, data)
VALUES
('RESOURCE','SPX_CLEAN','SPX Clean',10,'{"sourceColumn":"D"}'::jsonb),
('RESOURCE','MANUAL_DBL','Manual DBL',20,'{"sourceColumn":"E"}'::jsonb),
('RESOURCE','AUTO_DBL','Auto DBL',30,'{"sourceColumn":"F"}'::jsonb),
('RESOURCE','PLATING','Plating',40,'{"sourceColumn":"G"}'::jsonb),
('RESOURCE','HE_BAKE','He-Bake',50,'{"sourceColumn":"H"}'::jsonb),
('RESOURCE','PASSIVATION','Passivation',60,'{"sourceColumn":"I"}'::jsonb),
('RESOURCE','MANUAL_SP','Manual SP',70,'{"sourceColumn":"J"}'::jsonb),
('RESOURCE','AUTO_SHP','Auto SHP',80,'{"sourceColumn":"K"}'::jsonb),
('RESOURCE','FLYBAR','Flybar',90,'{"sourceColumn":"L"}'::jsonb),
('RESOURCE','CAB1','CAB1',100,'{"sourceColumn":"M"}'::jsonb),
('RESOURCE','CAB2','CAB2',110,'{"sourceColumn":"N"}'::jsonb),
('RESOURCE','CAB3','CAB3',120,'{"sourceColumn":"O"}'::jsonb),
('RESOURCE','PAINT_POWDER','Paint Powder',130,'{"sourceColumn":"P"}'::jsonb)
ON CONFLICT (category, code) DO NOTHING;

INSERT INTO config_items (category, code, label, sort_order, data)
VALUES
('SCHEDULE_STATUS','DONE','Done',10,'{"background":"#DCFCE7","text":"#166534","border":"#86EFAC"}'::jsonb),
('SCHEDULE_STATUS','ONGOING','Ongoing',20,'{"background":"#FEF3C7","text":"#92400E","border":"#FCD34D"}'::jsonb),
('SCHEDULE_STATUS','WAITING','Waiting',30,'{"background":"#FEF9C3","text":"#854D0E","border":"#FDE047"}'::jsonb),
('SCHEDULE_STATUS','REPLANNED','Replanned',40,'{"background":"#FEE2E2","text":"#991B1B","border":"#FCA5A5"}'::jsonb)
ON CONFLICT (category, code) DO NOTHING;

INSERT INTO config_settings (setting_key, category, label, data_type, value_json, description)
VALUES
('route.preferNextOperation','ROUTING','Prefer source NextOperation','boolean','true'::jsonb,'Use authoritative NextOperation before any fallback.'),
('route.fallbackFirstIncomplete','ROUTING','Fallback to first incomplete operation','boolean','true'::jsonb,'Used only when NextOperation cannot be matched.'),
('route.includeCurrentInRemaining','ROUTING','Include current operation in remaining route','boolean','true'::jsonb,'If disabled, Remaining Route starts after the current operation.'),
('import.maxStChunkRows','IMPORT','ST import chunk rows','number','100'::jsonb,'Maximum ST source rows sent per request.'),
('import.maxRoutingChunkRows','IMPORT','Routing import chunk rows','number','80'::jsonb,'Maximum routing source rows sent per request.'),
('ui.defaultPageSize','UI','Default table page size','number','100'::jsonb,'Default page size for operational grids.'),
('ui.maxPageSize','UI','Maximum table page size','number','500'::jsonb,'Upper bound for operational grids.')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO config_rules (rule_type, code, name, priority, condition_json, action_json, notes)
VALUES
('PRIORITY','SOURCE_PRIORITY_PRESENT','Source priority fields present',100,
 '{"anyNonBlank":["priority_type","cat_transit","impact_sale_value"]}'::jsonb,
 '{"visualTag":"PRIORITY"}'::jsonb,
 'Visual/config baseline only. Does not change planning order yet.')
ON CONFLICT (rule_type, code) DO NOTHING;

INSERT INTO config_view_profiles (view_key, profile_code, name, is_default, config_json)
VALUES
('PLANNING','STANDARD','Standard Planning',true,'{"pageSize":100,"sort":"row","direction":"asc"}'::jsonb),
('SCHEDULING','STANDARD','Standard Scheduling',true,'{"pageSize":100,"sort":"date","direction":"asc","mode":"table"}'::jsonb),
('ROUTING','STANDARD','Standard Routing',true,'{"pageSize":25,"sort":"job","direction":"asc"}'::jsonb)
ON CONFLICT (view_key, profile_code) DO NOTHING;

INSERT INTO config_items (category, code, label, sort_order, data)
VALUES
('CONFIG_CATEGORY','MAIN_OPERATION','Main Operations',10,'{"purpose":"Planning group master"}'::jsonb),
('CONFIG_CATEGORY','ST_OPERATION','ST Operations',20,'{"purpose":"ST source operation master"}'::jsonb),
('CONFIG_CATEGORY','OPERATION_CODE','All Operation Codes',30,'{"purpose":"Auto-discovered from All Open Jobs routing"}'::jsonb),
('CONFIG_CATEGORY','PHYSICAL_AREA','Physical Areas',40,'{}'::jsonb),
('CONFIG_CATEGORY','SCHEDULE_AREA','Schedule Areas',50,'{}'::jsonb),
('CONFIG_CATEGORY','PLANNER','Planners',60,'{}'::jsonb),
('CONFIG_CATEGORY','RECIPE_GROUP','Recipe Groups',70,'{}'::jsonb),
('CONFIG_CATEGORY','PAINT_TYPE','Paint Types',80,'{}'::jsonb)
ON CONFLICT (category, code) DO NOTHING;
