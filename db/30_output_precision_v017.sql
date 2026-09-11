-- ST Planning v017 — Output Precision Baseline
-- All mapped Main Operations now have process-time fallbacks, so unknowns should be exceptional.

UPDATE config_settings
SET value_json='"BLOCK"'::jsonb, description='v017: block target confirmation if a route step still has no usable time after source, recipe and configured fallback rules.', updated_at=now()
WHERE setting_key='stOutput.unknownStepPolicy';

UPDATE config_settings
SET value_json='30'::jsonb, description='Emergency display fallback only; BLOCK policy prevents it from confirming target feasibility.', updated_at=now()
WHERE setting_key='stOutput.defaultUnknownMinutes';

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('stOutput.timeModelVersion','ST_OUTPUT_MODEL','Time Model Version','string','"V017_FULL_BASELINE"'::jsonb,true,'NextOperation → every remaining route step → FINSST uses source/recipe/assumed process times and v016 finite resource waiting.'),
('stOutput.assumptionDisclosure','ST_OUTPUT_MODEL','Assumption Disclosure','string','"ESTIMATED_VALUES_ACTIVE"'::jsonb,true,'v017 estimated times/capacities are active by user authorization and remain editable in Configuration.')
ON CONFLICT (setting_key) DO UPDATE SET value_json=EXCLUDED.value_json,description=EXCLUDED.description,enabled=true,updated_at=now();
