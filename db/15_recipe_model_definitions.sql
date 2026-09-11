-- ST Planning v013 Recipe / Process Time Configuration
-- Max 8 statements. Safe to run after v012 (01-14).
-- Adds configuration definitions only; source/raw data remains unchanged.

INSERT INTO config_items (category, code, label, sort_order, data)
VALUES
('CONFIG_CATEGORY','RECIPE','Recipe Master',90,'{"purpose":"Recipe No, Recipe Name and recipe attributes"}'::jsonb),
('CONFIG_CATEGORY','RECIPE_SOURCE_FIELD','Recipe Source Fields',95,'{"purpose":"Configurable Planning RAW fields used by Recipe Rules"}'::jsonb),
('CONFIG_CATEGORY','PROCESS_TIME_PROFILE','Process Time Profiles',100,'{"purpose":"Reusable process-time calculation modes"}'::jsonb),
('CONFIG_CATEGORY','PROCESS_TIME_SOURCE_FIELD','Process Time Source Fields',105,'{"purpose":"Configurable RAW fields used by Process Time Rules"}'::jsonb)
ON CONFLICT (category, code) DO NOTHING;

INSERT INTO config_items (category, code, label, sort_order, data)
VALUES
('LINK_TYPE','RECIPE_TO_PROCESS_TIME_PROFILE','Recipe → Process Time Profile',70,'{"multi":false}'::jsonb),
('LINK_TYPE','MAIN_TO_DEFAULT_RECIPE','Main Operation → Default Recipe',75,'{"multi":false}'::jsonb)
ON CONFLICT (category, code) DO NOTHING;

INSERT INTO config_settings (setting_key, category, label, data_type, value_json, description)
VALUES
('recipeModel.unmatchedBehavior','RECIPE_MODEL','Unmatched recipe behavior','text','"VISIBLE_REVIEW"'::jsonb,'Keep missing/ambiguous recipe suggestions visible instead of silently dropping them.'),
('recipeModel.allowSourceOnlyRecipe','RECIPE_MODEL','Allow source-only recipe identifiers','boolean','true'::jsonb,'Allow source recipe numbers/identifiers not yet present in STRecipe; they remain flagged for review.'),
('recipeModel.nameMatchCaseInsensitive','RECIPE_MODEL','Case-insensitive Recipe Name matching','boolean','true'::jsonb,'Recipe aliases and names are compared case-insensitively with whitespace normalization.'),
('processTime.roundingMinutes','PROCESS_TIME','Process time rounding minutes','number','1'::jsonb,'Round calculated process time to this minute increment when a calculation rule is enabled.'),
('processTime.allowManualOverride','PROCESS_TIME','Allow manual duration override','boolean','true'::jsonb,'Future scheduling/batch override guard. Source/default values remain visible.')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO config_view_profiles (view_key, profile_code, name, is_default, config_json)
VALUES
('RECIPE_MODEL','STANDARD','Standard Recipe & Process Time',true,'{"tab":"recipes","showReview":true}'::jsonb)
ON CONFLICT (view_key, profile_code) DO NOTHING;
