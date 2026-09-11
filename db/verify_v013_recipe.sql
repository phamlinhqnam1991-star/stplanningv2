-- ST Planning v013 Recipe / Process Time verification
-- 6 queries.
SELECT category, count(*) FROM config_items WHERE category IN ('RECIPE','RECIPE_SOURCE_FIELD','PROCESS_TIME_PROFILE','PROCESS_TIME_SOURCE_FIELD') GROUP BY category ORDER BY category;
SELECT count(*) AS recipe_rules FROM config_rules WHERE rule_type='RECIPE';
SELECT enabled, count(*) AS process_time_rules FROM config_rules WHERE rule_type='PROCESS_TIME' GROUP BY enabled ORDER BY enabled DESC;
SELECT code, label, data->>'recipeGroup' AS recipe_group, data->>'defaultProcessTimeMinutes' AS default_minutes, data->>'needsReview' AS needs_review FROM config_items WHERE category='RECIPE' ORDER BY sort_order, code LIMIT 50;
SELECT code, name, priority, condition_json, action_json FROM config_rules WHERE rule_type='RECIPE' ORDER BY priority, code;
SELECT code, name, enabled, priority, condition_json, action_json FROM config_rules WHERE rule_type='PROCESS_TIME' ORDER BY priority, code;
