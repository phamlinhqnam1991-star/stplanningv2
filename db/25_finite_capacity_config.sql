-- ST Planning v016 — Finite Capacity Configuration
-- Max 8 statements per file. Run after v015 SQL.

-- 1. Fourth painting cabin is a configured capacity resource; it has no Excel source column in the current Main Planning snapshot.
INSERT INTO config_items (category, code, label, sort_order, data)
VALUES ('RESOURCE','CAB4','CAB4',125,'{"sourceColumn":null,"virtualForCapacity":true,"seedVersion":"v016","sourceBasis":"approved four-cabin planning architecture"}'::jsonb)
ON CONFLICT (category, code) DO UPDATE SET label=EXCLUDED.label,sort_order=EXCLUDED.sort_order,data=config_items.data || EXCLUDED.data,updated_at=now();

-- 2. Make CAB4 available to paint Main Operations without changing the source scheduling columns.
INSERT INTO config_links (link_type,from_category,from_code,to_category,to_code,sort_order,data)
VALUES
('MAIN_TO_RESOURCE','MAIN_OPERATION','PRIMER','RESOURCE','CAB4',4,'{"seedVersion":"v016","sourceBasis":"four-cabin capacity model"}'::jsonb),
('MAIN_TO_RESOURCE','MAIN_OPERATION','PRIMER2','RESOURCE','CAB4',4,'{"seedVersion":"v016","sourceBasis":"four-cabin capacity model"}'::jsonb),
('MAIN_TO_RESOURCE','MAIN_OPERATION','PRIMER3','RESOURCE','CAB4',4,'{"seedVersion":"v016","sourceBasis":"four-cabin capacity model"}'::jsonb),
('MAIN_TO_RESOURCE','MAIN_OPERATION','TOPCOAT1','RESOURCE','CAB4',4,'{"seedVersion":"v016","sourceBasis":"four-cabin capacity model"}'::jsonb),
('MAIN_TO_RESOURCE','MAIN_OPERATION','TOPCOAT2','RESOURCE','CAB4',4,'{"seedVersion":"v016","sourceBasis":"four-cabin capacity model"}'::jsonb),
('MAIN_TO_RESOURCE','MAIN_OPERATION','ANTI_ABRASION','RESOURCE','CAB4',4,'{"seedVersion":"v016","sourceBasis":"four-cabin capacity model"}'::jsonb),
('MAIN_TO_RESOURCE','MAIN_OPERATION','PAINT_MARKING','RESOURCE','CAB4',4,'{"seedVersion":"v016","sourceBasis":"four-cabin capacity model"}'::jsonb),
('MAIN_TO_RESOURCE','MAIN_OPERATION','VARNISH','RESOURCE','CAB4',4,'{"seedVersion":"v016","sourceBasis":"four-cabin capacity model"}'::jsonb)
ON CONFLICT (link_type,from_category,from_code,to_category,to_code) DO UPDATE SET enabled=true,sort_order=EXCLUDED.sort_order,data=config_links.data || EXCLUDED.data,updated_at=now();

-- 3. Capacity resource definitions. FLYBAR = 6 physical carriers with max 3 concurrent process segments.
INSERT INTO config_items (category,code,label,sort_order,data)
VALUES
('CAPACITY_RESOURCE','SPX_CLEAN','SPX Clean',10,'{"baseResourceCode":"SPX_CLEAN","instanceCount":1,"instancePrefix":"SPX","maxConcurrent":1,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v016"}'::jsonb),
('CAPACITY_RESOURCE','MANUAL_DBL','Manual DBL',20,'{"baseResourceCode":"MANUAL_DBL","instanceCount":1,"instancePrefix":"MDBL","maxConcurrent":1,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v016"}'::jsonb),
('CAPACITY_RESOURCE','AUTO_DBL','Auto DBL',30,'{"baseResourceCode":"AUTO_DBL","instanceCount":1,"instancePrefix":"ADBL","maxConcurrent":1,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v016"}'::jsonb),
('CAPACITY_RESOURCE','PLATING','Plating',40,'{"baseResourceCode":"PLATING","instanceCount":1,"instancePrefix":"PLT","maxConcurrent":1,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v016"}'::jsonb),
('CAPACITY_RESOURCE','HE_BAKE','He-Bake',50,'{"baseResourceCode":"HE_BAKE","instanceCount":1,"instancePrefix":"OVN","maxConcurrent":1,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v016"}'::jsonb),
('CAPACITY_RESOURCE','PASSIVATION','Passivation / Brightening',60,'{"baseResourceCode":"PASSIVATION","instanceCount":1,"instancePrefix":"PASS","maxConcurrent":1,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v016"}'::jsonb),
('CAPACITY_RESOURCE','MANUAL_SP','Manual Shot Peening',70,'{"baseResourceCode":"MANUAL_SP","instanceCount":1,"instancePrefix":"MSP","maxConcurrent":1,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v016"}'::jsonb),
('CAPACITY_RESOURCE','AUTO_SHP','Auto Shot Peening',80,'{"baseResourceCode":"AUTO_SHP","instanceCount":1,"instancePrefix":"ASP","maxConcurrent":1,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v016"}'::jsonb),
('CAPACITY_RESOURCE','FLYBAR','Chemical Line Flybar',90,'{"baseResourceCode":"FLYBAR","instanceCount":6,"instancePrefix":"FB","maxConcurrent":3,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v016","sourceBasis":"6 flybars / maximum 3 concurrent process segments"}'::jsonb),
('CAPACITY_RESOURCE','CAB1','Painting CAB1',100,'{"baseResourceCode":"CAB1","instanceCount":1,"instancePrefix":"CAB1","maxConcurrent":1,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v016"}'::jsonb),
('CAPACITY_RESOURCE','CAB2','Painting CAB2',110,'{"baseResourceCode":"CAB2","instanceCount":1,"instancePrefix":"CAB2","maxConcurrent":1,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v016"}'::jsonb),
('CAPACITY_RESOURCE','CAB3','Painting CAB3',120,'{"baseResourceCode":"CAB3","instanceCount":1,"instancePrefix":"CAB3","maxConcurrent":1,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v016"}'::jsonb),
('CAPACITY_RESOURCE','CAB4','Painting CAB4',125,'{"baseResourceCode":"CAB4","instanceCount":1,"instancePrefix":"CAB4","maxConcurrent":1,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v016"}'::jsonb),
('CAPACITY_RESOURCE','PAINT_POWDER','Paint Powder',130,'{"baseResourceCode":"PAINT_POWDER","instanceCount":1,"instancePrefix":"PWD","maxConcurrent":1,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v016"}'::jsonb)
ON CONFLICT (category,code) DO UPDATE SET label=EXCLUDED.label,sort_order=EXCLUDED.sort_order,data=EXCLUDED.data,enabled=true,updated_at=now();

-- 4. Finite-capacity engine settings.
INSERT INTO config_settings (setting_key,category,label,data_type,value_json,description)
VALUES
('capacity.scenarioStartTime','CAPACITY_MODEL','Scenario start time','string','"06:00"'::jsonb,'Start clock used on the configured lookback day. The engine never starts before the latest route snapshot.'),
('capacity.lookbackDays','CAPACITY_MODEL','Target lookback days','number','1'::jsonb,'How many days before the target date the trial scheduler may start work.'),
('capacity.spillHours','CAPACITY_MODEL','Spill horizon hours','number','24'::jsonb,'Extra hours after the FINSST cutoff used to show where late work would land.'),
('capacity.candidateSurfaceMultiplier','CAPACITY_MODEL','Reserve candidate multiplier','number','1.5'::jsonb,'Adds reserve NEED_PLAN surface when finite capacity causes the first recommendation set to miss the target.'),
('capacity.maxCandidateJobs','CAPACITY_MODEL','Maximum candidate jobs','number','250'::jsonb,'Safety limit for target-driven finite-capacity simulation.'),
('capacity.includeExistingSchedule','CAPACITY_MODEL','Respect imported schedule occupancy','boolean','true'::jsonb,'Existing Main Planning schedule blocks reserve their resource/time before trial batches are placed.'),
('capacity.proposedBatchPrefix','CAPACITY_MODEL','Proposed batch prefix','string','"PROP"'::jsonb,'Prefix used only for trial batches; it does not reserve a production batch sequence.'),
('capacity.unmappedResourcePolicy','CAPACITY_MODEL','Unmapped resource policy','string','"REVIEW_UNCONSTRAINED"'::jsonb,'REVIEW_UNCONSTRAINED keeps the process-time lag but marks target feasibility PROVISIONAL. BLOCK rejects the job until resource capacity is configured.'),
('capacity.groupBySourceOperation','CAPACITY_MODEL','Keep source operation in proposed-batch grouping','boolean','true'::jsonb,'Conservative batching safeguard for repeated/different source operation codes that map to the same Main Operation.')
ON CONFLICT (setting_key) DO NOTHING;

-- 5. Expose the capacity resource category in Configuration Center.
INSERT INTO config_items (category,code,label,sort_order,data)
VALUES ('CONFIG_CATEGORY','CAPACITY_RESOURCE','Capacity Resources',90,'{"purpose":"Finite-capacity resource pool / physical slot master","seedVersion":"v016"}'::jsonb)
ON CONFLICT (category,code) DO NOTHING;
