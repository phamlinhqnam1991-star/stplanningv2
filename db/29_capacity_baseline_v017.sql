-- ST Planning v017 — Full Finite Capacity Baseline
INSERT INTO config_items (category,code,label,sort_order,data) VALUES
(E'CAPACITY_RESOURCE',E'SPX_CLEAN',E'SPX Clean',10,E'{"baseResourceCode":"SPX_CLEAN","instanceCount":1,"instancePrefix":"SPX","maxConcurrent":1,"changeoverMinutes":10,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true}'::jsonb),
(E'CAPACITY_RESOURCE',E'MANUAL_DBL',E'Manual DBL',20,E'{"baseResourceCode":"MANUAL_DBL","instanceCount":1,"instancePrefix":"MDBL","maxConcurrent":1,"changeoverMinutes":10,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true}'::jsonb),
(E'CAPACITY_RESOURCE',E'AUTO_DBL',E'Auto DBL',30,E'{"baseResourceCode":"AUTO_DBL","instanceCount":1,"instancePrefix":"ADBL","maxConcurrent":1,"changeoverMinutes":10,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true}'::jsonb),
(E'CAPACITY_RESOURCE',E'PLATING',E'Plating',40,E'{"baseResourceCode":"PLATING","instanceCount":1,"instancePrefix":"PLT","maxConcurrent":1,"changeoverMinutes":20,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true}'::jsonb),
(E'CAPACITY_RESOURCE',E'HE_BAKE',E'He-Bake',50,E'{"baseResourceCode":"HE_BAKE","instanceCount":1,"instancePrefix":"OVN","maxConcurrent":1,"changeoverMinutes":15,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true}'::jsonb),
(E'CAPACITY_RESOURCE',E'PASSIVATION',E'Passivation / Brightening',60,E'{"baseResourceCode":"PASSIVATION","instanceCount":1,"instancePrefix":"PASS","maxConcurrent":1,"changeoverMinutes":10,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true}'::jsonb),
(E'CAPACITY_RESOURCE',E'MANUAL_SP',E'Manual Shot Peening',70,E'{"baseResourceCode":"MANUAL_SP","instanceCount":1,"instancePrefix":"MSP","maxConcurrent":1,"changeoverMinutes":10,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true}'::jsonb),
(E'CAPACITY_RESOURCE',E'AUTO_SHP',E'Auto Shot Peening',80,E'{"baseResourceCode":"AUTO_SHP","instanceCount":1,"instancePrefix":"ASP","maxConcurrent":1,"changeoverMinutes":15,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true}'::jsonb),
(E'CAPACITY_RESOURCE',E'FLYBAR',E'Chemical Line Flybar',90,E'{"baseResourceCode":"FLYBAR","instanceCount":6,"instancePrefix":"FB","maxConcurrent":3,"changeoverMinutes":15,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true,"sourceBasis":"approved 6 flybars / max 3 concurrent process segments"}'::jsonb),
(E'CAPACITY_RESOURCE',E'CAB1',E'Painting CAB1',100,E'{"baseResourceCode":"CAB1","instanceCount":1,"instancePrefix":"CAB1","maxConcurrent":1,"changeoverMinutes":30,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true,"sourceBasis":"approved four-cabin painting architecture"}'::jsonb),
(E'CAPACITY_RESOURCE',E'CAB2',E'Painting CAB2',110,E'{"baseResourceCode":"CAB2","instanceCount":1,"instancePrefix":"CAB2","maxConcurrent":1,"changeoverMinutes":30,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true,"sourceBasis":"approved four-cabin painting architecture"}'::jsonb),
(E'CAPACITY_RESOURCE',E'CAB3',E'Painting CAB3',120,E'{"baseResourceCode":"CAB3","instanceCount":1,"instancePrefix":"CAB3","maxConcurrent":1,"changeoverMinutes":30,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true,"sourceBasis":"approved four-cabin painting architecture"}'::jsonb),
(E'CAPACITY_RESOURCE',E'CAB4',E'Painting CAB4',125,E'{"baseResourceCode":"CAB4","instanceCount":1,"instancePrefix":"CAB4","maxConcurrent":1,"changeoverMinutes":30,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true,"sourceBasis":"approved four-cabin painting architecture"}'::jsonb),
(E'CAPACITY_RESOURCE',E'PAINT_POWDER',E'Paint Powder',130,E'{"baseResourceCode":"PAINT_POWDER","instanceCount":1,"instancePrefix":"PWD","maxConcurrent":1,"changeoverMinutes":30,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true}'::jsonb),
(E'CAPACITY_RESOURCE',E'MASKING',E'Masking Workstation',140,E'{"baseResourceCode":"MASKING","instanceCount":4,"instancePrefix":"MSK","maxConcurrent":4,"changeoverMinutes":10,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true}'::jsonb),
(E'CAPACITY_RESOURCE',E'UNMASKING',E'Unmasking Workstation',150,E'{"baseResourceCode":"UNMASKING","instanceCount":3,"instancePrefix":"UMS","maxConcurrent":3,"changeoverMinutes":5,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true}'::jsonb),
(E'CAPACITY_RESOURCE',E'NDT',E'NDT Station',160,E'{"baseResourceCode":"NDT","instanceCount":2,"instancePrefix":"NDT","maxConcurrent":2,"changeoverMinutes":5,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true}'::jsonb),
(E'CAPACITY_RESOURCE',E'INSPECTION',E'ST Inspection',170,E'{"baseResourceCode":"INSPECTION","instanceCount":3,"instancePrefix":"INS","maxConcurrent":3,"changeoverMinutes":0,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true}'::jsonb),
(E'CAPACITY_RESOURCE',E'REWORK',E'ST Rework Bench',180,E'{"baseResourceCode":"REWORK","instanceCount":2,"instancePrefix":"RWK","maxConcurrent":2,"changeoverMinutes":10,"calendarMode":"CONTINUOUS_24H","seedVersion":"v017","assumptionBaseline":true}'::jsonb)
ON CONFLICT (category,code) DO UPDATE SET label=EXCLUDED.label,sort_order=EXCLUDED.sort_order,data=EXCLUDED.data,enabled=true,updated_at=now();

INSERT INTO config_items (category,code,label,sort_order,data) VALUES
('RESOURCE','MASKING','Masking Workstation',140,'{"virtualForCapacity":true,"seedVersion":"v017"}'::jsonb),
('RESOURCE','UNMASKING','Unmasking Workstation',150,'{"virtualForCapacity":true,"seedVersion":"v017"}'::jsonb),
('RESOURCE','NDT','NDT Station',160,'{"virtualForCapacity":true,"seedVersion":"v017"}'::jsonb),
('RESOURCE','INSPECTION','ST Inspection',170,'{"virtualForCapacity":true,"seedVersion":"v017"}'::jsonb),
('RESOURCE','REWORK','ST Rework Bench',180,'{"virtualForCapacity":true,"seedVersion":"v017"}'::jsonb)
ON CONFLICT (category,code) DO UPDATE SET label=EXCLUDED.label,sort_order=EXCLUDED.sort_order,data=config_items.data || EXCLUDED.data,enabled=true,updated_at=now();

INSERT INTO config_links (link_type,from_category,from_code,to_category,to_code,sort_order,data) VALUES
(E'MAIN_TO_RESOURCE',E'MAIN_OPERATION',E'FMSKG_CM',E'RESOURCE',E'MASKING',1,E'{"seedVersion":"v017","sourceBasis":"user-authorized finite-capacity baseline","needsReview":false}'::jsonb),
(E'MAIN_TO_RESOURCE',E'MAIN_OPERATION',E'MASKING',E'RESOURCE',E'MASKING',1,E'{"seedVersion":"v017","sourceBasis":"user-authorized finite-capacity baseline","needsReview":false}'::jsonb),
(E'MAIN_TO_RESOURCE',E'MAIN_OPERATION',E'UNMASKING',E'RESOURCE',E'UNMASKING',1,E'{"seedVersion":"v017","sourceBasis":"user-authorized finite-capacity baseline","needsReview":false}'::jsonb),
(E'MAIN_TO_RESOURCE',E'MAIN_OPERATION',E'NDT',E'RESOURCE',E'NDT',1,E'{"seedVersion":"v017","sourceBasis":"user-authorized finite-capacity baseline","needsReview":false}'::jsonb),
(E'MAIN_TO_RESOURCE',E'MAIN_OPERATION',E'ST_INSPECTION',E'RESOURCE',E'INSPECTION',1,E'{"seedVersion":"v017","sourceBasis":"user-authorized finite-capacity baseline","needsReview":false}'::jsonb),
(E'MAIN_TO_RESOURCE',E'MAIN_OPERATION',E'ST_FINAL',E'RESOURCE',E'INSPECTION',1,E'{"seedVersion":"v017","sourceBasis":"user-authorized finite-capacity baseline","needsReview":false}'::jsonb),
(E'MAIN_TO_RESOURCE',E'MAIN_OPERATION',E'REWORK',E'RESOURCE',E'REWORK',1,E'{"seedVersion":"v017","sourceBasis":"user-authorized finite-capacity baseline","needsReview":false}'::jsonb)
ON CONFLICT (link_type,from_category,from_code,to_category,to_code) DO UPDATE SET enabled=true,sort_order=EXCLUDED.sort_order,data=config_links.data || EXCLUDED.data,updated_at=now();

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('capacity.baselineProfile','CAPACITY_MODEL','Capacity Baseline Profile','string','"V017_ESTIMATED_FULL_CAPACITY"'::jsonb,true,'Resource counts and changeovers are user-authorized baseline assumptions until corrected with actual shop data.'),
('capacity.maskingStations','CAPACITY_MODEL','Masking Stations','number','4'::jsonb,true,'Default v017 masking parallel workstations.'),
('capacity.unmaskingStations','CAPACITY_MODEL','Unmasking Stations','number','3'::jsonb,true,'Default v017 unmasking parallel workstations.'),
('capacity.ndtStations','CAPACITY_MODEL','NDT Stations','number','2'::jsonb,true,'Default v017 NDT parallel stations.'),
('capacity.inspectionStations','CAPACITY_MODEL','Inspection Stations','number','3'::jsonb,true,'Default v017 inspection parallel stations.')
ON CONFLICT (setting_key) DO UPDATE SET value_json=EXCLUDED.value_json,description=EXCLUDED.description,enabled=true,updated_at=now();
