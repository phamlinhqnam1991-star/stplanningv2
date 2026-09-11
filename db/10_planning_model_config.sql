-- ST Planning v011 Planning Model Configuration
-- Max 8 statements. Safe to run after v010 (07-09).
-- No Main Operation business values are seeded here.

INSERT INTO config_items (category, code, label, sort_order, data)
VALUES
('CONFIG_CATEGORY','ST_GROUP','ST Groups',35,'{"purpose":"Reusable grouping between Main Operation and Physical Area"}'::jsonb)
ON CONFLICT (category, code) DO NOTHING;

INSERT INTO config_items (category, code, label, sort_order, data)
VALUES
('LINK_TYPE','MAIN_TO_ST_GROUP','Main Operation → ST Group',15,'{}'::jsonb),
('LINK_TYPE','ST_GROUP_TO_PHYSICAL_AREA','ST Group → Physical Area',18,'{}'::jsonb),
('LINK_TYPE','MAIN_TO_RESOURCE','Main Operation → Resource',55,'{"multi":true}'::jsonb),
('LINK_TYPE','MAIN_TO_RECIPE_GROUP','Main Operation → Recipe Group',65,'{"multi":true}'::jsonb)
ON CONFLICT (category, code) DO NOTHING;

INSERT INTO config_settings (setting_key, category, label, data_type, value_json, description)
VALUES
('planningModel.operationMappingPrecedence','PLANNING_MODEL','Operation mapping precedence','json','["OPERATION_CODE","ST_OPERATION"]'::jsonb,'When the same operation exists in multiple source masters, resolve the first configured category.'),
('planningModel.collapseConsecutiveMainOperations','PLANNING_MODEL','Collapse consecutive Main Operations','boolean','true'::jsonb,'Collapse only adjacent route operations mapped to the same Main Operation.'),
('planningModel.showUnmappedOperations','PLANNING_MODEL','Show unmapped operations','boolean','true'::jsonb,'Keep unmapped ST operations visible for configuration review.'),
('planningModel.requireHierarchyForPlanning','PLANNING_MODEL','Require hierarchy for Planning','boolean','false'::jsonb,'Future guard: require Main → ST Group → Area mapping before Planning eligibility.'),
('planningModel.defaultPlanningEnabled','PLANNING_MODEL','Default Planning enabled','boolean','true'::jsonb,'Default behavior when a Main Operation does not explicitly store planningEnabled.')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO config_view_profiles (view_key, profile_code, name, is_default, config_json)
VALUES
('PLANNING_MODEL','STANDARD','Standard Planning Model',true,'{"mapped":"all","sort":"operation","direction":"asc"}'::jsonb)
ON CONFLICT (view_key, profile_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS ix_config_links_from
ON config_links (link_type, from_category, upper(from_code), enabled, sort_order);

CREATE INDEX IF NOT EXISTS ix_config_links_to
ON config_links (link_type, to_category, upper(to_code), enabled, sort_order);

INSERT INTO config_items (category, code, label, sort_order, data)
VALUES
('RULE_TYPE','PLANNING_ELIGIBILITY','Planning Eligibility Rules',45,'{"future":true}'::jsonb)
ON CONFLICT (category, code) DO NOTHING;
