-- ST Planning v010 Extensibility Link/Rule Types
-- Max 8 statements per file. No business mapping is assumed here.

INSERT INTO config_items (category, code, label, sort_order, data)
VALUES
('LINK_TYPE','OPERATION_TO_MAIN','Operation → Main Operation',10,'{}'::jsonb),
('LINK_TYPE','MAIN_TO_PHYSICAL_AREA','Main Operation → Physical Area',20,'{}'::jsonb),
('LINK_TYPE','PHYSICAL_TO_SCHEDULE_AREA','Physical Area → Schedule Area',30,'{}'::jsonb),
('LINK_TYPE','SCHEDULE_AREA_TO_PLANNER','Schedule Area → Planner',40,'{}'::jsonb),
('LINK_TYPE','OPERATION_TO_RESOURCE','Operation → Resource',50,'{}'::jsonb),
('LINK_TYPE','OPERATION_TO_RECIPE_GROUP','Operation → Recipe Group',60,'{}'::jsonb)
ON CONFLICT (category, code) DO NOTHING;

INSERT INTO config_items (category, code, label, sort_order, data)
VALUES
('RULE_TYPE','PRIORITY','Priority Rules',10,'{}'::jsonb),
('RULE_TYPE','PROCESS_TIME','Process Time Rules',20,'{}'::jsonb),
('RULE_TYPE','BATCH','Batch Rules',30,'{}'::jsonb),
('RULE_TYPE','RECIPE','Recipe Rules',40,'{}'::jsonb),
('RULE_TYPE','CANDIDATE','Candidate Rules',50,'{}'::jsonb),
('RULE_TYPE','AUTO_PLAN','Auto Plan Rules',60,'{}'::jsonb),
('RULE_TYPE','ROUTE','Route Analysis Rules',70,'{}'::jsonb)
ON CONFLICT (category, code) DO NOTHING;

ALTER TABLE import_runs
ADD COLUMN IF NOT EXISTS config_snapshot jsonb;

ALTER TABLE route_import_runs
ADD COLUMN IF NOT EXISTS config_snapshot jsonb;
