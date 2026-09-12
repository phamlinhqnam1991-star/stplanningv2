-- ST Planning v019 — Detailed Painting / Cabin segmented finite-capacity model
-- Run after v018. This file contains 4 statements (Aiven-safe: <= 8).

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('capacity.paintingSegmented','CAPACITY_MODEL','Painting Segmented Scheduler','boolean','true'::jsonb,true,'Schedule wet-paint batches as Setup → Application → Flash/Wait → Cure → Release instead of one monolithic cabin block.'),
('capacity.paintingMainOperations','CAPACITY_MODEL','Painting Main Operations','json','["PRIMER","PRIMER2","PRIMER3","TOPCOAT1","TOPCOAT2","ANTI_ABRASION","PAINT_MARKING","VARNISH"]'::jsonb,true,'Main Operations handled by the detailed wet-paint cabin scheduler.'),
('capacity.paintingDefaultResources','CAPACITY_MODEL','Painting Default Cabins','json','["CAB1","CAB2","CAB3","CAB4"]'::jsonb,true,'Fallback eligible cabins when no operation/recipe rule or recipe master restriction is configured.'),
('capacity.paintingSetupMinutes','CAPACITY_MODEL','Painting Default Setup Minutes','number','30'::jsonb,true,'Baseline cabin preparation/setup segment. User-authorized estimate until shop-standard data replaces it.'),
('capacity.paintingFlashMinutes','CAPACITY_MODEL','Painting Default Flash Minutes','number','30'::jsonb,true,'Baseline flash/wait segment when Recipe Master does not provide a usable stage value.'),
('capacity.paintingCureMinutes','CAPACITY_MODEL','Painting Default Cure Minutes','number','60'::jsonb,true,'Baseline curing segment when Recipe Master does not provide a usable curing stage.'),
('capacity.paintingReleaseMinutes','CAPACITY_MODEL','Painting Default Release Minutes','number','15'::jsonb,true,'Baseline release/unload/closeout segment after curing.'),
('capacity.paintingUseRecipeStages','CAPACITY_MODEL','Use Recipe Stage Times','boolean','true'::jsonb,true,'Use Recipe Master Degas/Flash and Curing stage minutes when available; total process time remains the governing elapsed duration.'),
('capacity.paintingFlashOccupiesCabin','CAPACITY_MODEL','Flash Occupies Cabin','boolean','true'::jsonb,true,'Conservative baseline: flash/wait keeps the selected cabin occupied. Set false if parts leave the cabin during flash.'),
('capacity.paintingCureOccupiesCabin','CAPACITY_MODEL','Cure Occupies Cabin','boolean','true'::jsonb,true,'Conservative baseline: curing keeps the selected cabin occupied. Set false if curing occurs in a separate resource.'),
('capacity.paintingReleaseOccupiesCabin','CAPACITY_MODEL','Release Occupies Cabin','boolean','true'::jsonb,true,'Release/closeout reserves the selected cabin.'),
('capacity.paintingExistingSchedulePolicy','CAPACITY_MODEL','Existing Painting Schedule Policy','string','"CONSERVATIVE_FULL_BLOCK"'::jsonb,true,'Existing CAB1-CAB4 schedule rows do not contain stage timestamps, so preserve their full scheduled blocks as cabin occupancy.')
ON CONFLICT (setting_key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,enabled=true,description=EXCLUDED.description,updated_at=now();

INSERT INTO config_rules (rule_type,code,name,enabled,priority,condition_json,action_json,notes) VALUES
('PAINT_CAPACITY','PAINT_PRIMER_FAMILY','Primer family cabin baseline',true,10,'{"mainOperationIn":["PRIMER","PRIMER2","PRIMER3"]}'::jsonb,'{"allowedResources":["CAB1","CAB2","CAB3","CAB4"],"setupMinutes":30,"releaseMinutes":15}'::jsonb,'All four cabins are initially eligible. Flash/Cure use Recipe Master stages when present, otherwise CFG-95 defaults.'),
('PAINT_CAPACITY','PAINT_TOPCOAT_FAMILY','Topcoat family cabin baseline',true,20,'{"mainOperationIn":["TOPCOAT1","TOPCOAT2"]}'::jsonb,'{"allowedResources":["CAB1","CAB2","CAB3","CAB4"],"setupMinutes":30,"releaseMinutes":15}'::jsonb,'All four cabins are initially eligible. Recipe-specific cabin rules can be inserted at a lower priority number.'),
('PAINT_CAPACITY','PAINT_ANTI_ABRASION','Anti-abrasion cabin baseline',true,30,'{"mainOperation":"ANTI_ABRASION"}'::jsonb,'{"allowedResources":["CAB1","CAB2","CAB3","CAB4"],"setupMinutes":30,"flashMinutes":45,"cureMinutes":90,"releaseMinutes":15}'::jsonb,'User-authorized estimated baseline; revise after shop-standard confirmation.'),
('PAINT_CAPACITY','PAINT_MARKING_BASELINE','Paint marking cabin baseline',true,40,'{"mainOperation":"PAINT_MARKING"}'::jsonb,'{"allowedResources":["CAB1","CAB2","CAB3","CAB4"],"setupMinutes":15,"flashMinutes":15,"cureMinutes":30,"releaseMinutes":10}'::jsonb,'User-authorized estimated baseline; revise after shop-standard confirmation.'),
('PAINT_CAPACITY','PAINT_VARNISH_BASELINE','Varnish cabin baseline',true,50,'{"mainOperation":"VARNISH"}'::jsonb,'{"allowedResources":["CAB1","CAB2","CAB3","CAB4"],"setupMinutes":20,"releaseMinutes":10}'::jsonb,'Flash/Cure use Recipe Master stages when present, otherwise CFG-95 defaults.')
ON CONFLICT (rule_type,code) DO UPDATE SET name=EXCLUDED.name,enabled=EXCLUDED.enabled,priority=EXCLUDED.priority,condition_json=EXCLUDED.condition_json,action_json=EXCLUDED.action_json,notes=EXCLUDED.notes,updated_at=now();

UPDATE config_items
SET data = data || '{"segmentedScheduler":true,"segmentOrder":["PAINT_SETUP","PAINT_APPLICATION","PAINT_FLASH","PAINT_CURE","PAINT_RELEASE"],"eligibilityRuleType":"PAINT_CAPACITY","seedVersion":"v019","sourceBasis":"user-authorized detailed painting baseline"}'::jsonb,
    updated_at = now()
WHERE category='CAPACITY_RESOURCE' AND code IN ('CAB1','CAB2','CAB3','CAB4');

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('stOutput.timeModelVersion','ST_OUTPUT_MODEL','Time Model Version','string','"V019_CHEMICAL_AND_PAINT_SEGMENTED"'::jsonb,true,'Finite-capacity target simulation uses segmented Chemical Line and wet-paint cabin scheduling with recipe-aware cabin eligibility.')
ON CONFLICT (setting_key) DO UPDATE SET value_json=EXCLUDED.value_json,description=EXCLUDED.description,enabled=true,updated_at=now();
