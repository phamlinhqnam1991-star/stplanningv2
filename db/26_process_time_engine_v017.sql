-- ST Planning v017 — Process Time Engine / Assumption Profiles
-- User-approved baseline assumptions. Every value remains editable in CFG-92. Max 8 statements.

INSERT INTO config_items (category,code,label,enabled,sort_order,data) VALUES
('PROCESS_TIME_PROFILE','SOURCE_BATCH_MINUTES_BY_QTY','Source batch minutes × required cycles',true,50,'{"mode":"SOURCE_BATCH_MINUTES","unit":"MINUTE","seedVersion":"v017","assumption":"source time is per batch and batch-size field is maximum pieces per cycle"}'::jsonb),
('PROCESS_TIME_PROFILE','SOURCE_MIN_PER_PIECE','Source standard minutes per piece',true,60,'{"mode":"SOURCE_MINUTES_PER_PIECE","unit":"MINUTE_PER_PIECE","seedVersion":"v017","assumption":"MASKING / MARKING PROCESS TIME values are standard minutes per piece"}'::jsonb),
('PROCESS_TIME_PROFILE','QTY_SURFACE_TIERS','Qty / Surface tier duration',true,70,'{"mode":"QTY_SURFACE_TIERS","unit":"MINUTE","seedVersion":"v017"}'::jsonb),
('PROCESS_TIME_PROFILE','RECIPE_PLUS_OVERHEAD','Recipe duration + loading/unloading/NDT',true,75,'{"mode":"RECIPE_PLUS_OVERHEAD","unit":"MINUTE","seedVersion":"v017","sourceBasis":"STRecipe.Duration + configured Chemical Line handling/NDT overhead"}'::jsonb),
('PROCESS_TIME_PROFILE','MAIN_FIXED_FALLBACK','Main Operation fixed fallback',true,80,'{"mode":"FIXED_MINUTES","unit":"MINUTE","seedVersion":"v017","assumption":"conservative baseline used only after source and recipe duration cannot resolve"}'::jsonb),
('PROCESS_TIME_PROFILE','FIXED_MIN_PER_PIECE','Fixed minutes per piece fallback',true,90,'{"mode":"FIXED_MINUTES_PER_PIECE","unit":"MINUTE_PER_PIECE","seedVersion":"v017"}'::jsonb)
ON CONFLICT (category,code) DO UPDATE SET label=EXCLUDED.label,enabled=true,sort_order=EXCLUDED.sort_order,data=config_items.data || EXCLUDED.data,updated_at=now();

UPDATE config_rules
SET enabled=true,
    action_json = action_json || '{"mode":"SOURCE_BATCH_MINUTES","profile":"SOURCE_BATCH_MINUTES_BY_QTY","needsReview":false,"assumption":true,"sourceBasis":"Blasting source header states minutes; v017 assumes Blasting.Batch size is pieces per cycle"}'::jsonb,
    notes='v017: source blasting minutes multiplied by ceil(Job Qty / source Batch size).',
    updated_at=now()
WHERE rule_type='PROCESS_TIME' AND code='BLASTING_SOURCE_TIME';

UPDATE config_rules
SET enabled=true,
    action_json = action_json || '{"mode":"SOURCE_QTY_BREAKPOINTS","profile":"SIRIUS_QTY_BREAKPOINTS","needsReview":false,"assumption":true,"sourceBasis":"source explicitly supplies 10/20/50-pcs minutes for 2 operators and batch size; v017 uses step-up breakpoint by cycle"}'::jsonb,
    notes='v017: use source 10/20/50-pcs values by batch cycles; choose the smallest available breakpoint >= cycle qty, extrapolate only above the largest available point.',
    updated_at=now()
WHERE rule_type='PROCESS_TIME' AND code='SIRIUS_QTY_TIME';

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('processTime.assumptionProfile','PROCESS_TIME','Active Assumption Profile','string','"V017_CONSERVATIVE_BASELINE"'::jsonb,true,'User-authorized baseline for missing standard times. Source and Recipe Master values still take priority.'),
('processTime.maskingSourceInterpretation','PROCESS_TIME','Masking Source Interpretation','string','"MINUTES_PER_PIECE"'::jsonb,true,'v017 treats numeric MASKING / MARKING PROCESS TIME cells as standard minutes per piece.'),
('processTime.baselineEditable','PROCESS_TIME','Baseline Is Editable','boolean','true'::jsonb,true,'All v017 assumed values are configuration seeds and may be corrected later without code changes.')
ON CONFLICT (setting_key) DO UPDATE SET value_json=EXCLUDED.value_json,description=EXCLUDED.description,enabled=true,updated_at=now();

-- 5. Accept discovered source Recipe No. identifiers as operationally usable until the user corrects names/metadata.
UPDATE config_items
SET data = data || '{"needsReview":false,"acceptedBaselineV017":true,"seedVersion":"v017"}'::jsonb, updated_at=now()
WHERE category='RECIPE' AND COALESCE((data->>'sourceOnly')::boolean,false)=true;

-- 6. Deterministic recipe handling for source gaps/duplicate names. No Recipe No. is invented.
INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('recipeModel.acceptSourceOnlyRecipeCodes','RECIPE_MODEL','Accept Source-Only Recipe Codes','boolean','true'::jsonb,true,'Use a Recipe No. observed in the source even when Recipe Master name/duration is incomplete. Process-time fallback remains operation driven.'),
('recipeModel.ambiguousNamePolicy','RECIPE_MODEL','Ambiguous Recipe Name Policy','string','"LOWEST_RECIPE_NO"'::jsonb,true,'When a source recipe name maps to multiple Recipe No. values, v017 selects the lowest Recipe No. deterministically and keeps all candidates visible for later correction.')
ON CONFLICT (setting_key) DO UPDATE SET value_json=EXCLUDED.value_json,description=EXCLUDED.description,enabled=true,updated_at=now();
