-- ST Planning v020.1 — Route-aware Masking / Unmasking sequencing and grouping
-- Run after v020. This file contains 2 statements (Aiven-safe: <= 8).

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('capacity.manualRouteAwareGrouping','CAPACITY_MODEL','Manual Work Route-Aware Grouping','boolean','true'::jsonb,true,'When enabled, Masking/Unmasking proposed batches are grouped by their actual position/context in each Job route. The scheduler never inserts Masking/Unmasking around a Main Operation by assumption.'),
('capacity.manualRouteContextMode','CAPACITY_MODEL','Manual Work Route Context Mode','string','"PREV_NEXT_MAIN"'::jsonb,true,'PREV_NEXT_MAIN keeps the actual source operation plus nearest previous/next non-manual route context. NEXT_MAIN uses source operation + next route context. SOURCE_OPERATION_ONLY groups only by source operation code.')
ON CONFLICT (setting_key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,enabled=true,description=EXCLUDED.description,updated_at=now();

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('stOutput.timeModelVersion','ST_OUTPUT_MODEL','Time Model Version','string','"V020_1_ROUTE_AWARE_MANUAL_WORK"'::jsonb,true,'Masking and Unmasking are consumed strictly from each Job full route, retain route precedence, and use route-context-aware proposed batch grouping.')
ON CONFLICT (setting_key) DO UPDATE SET value_json=EXCLUDED.value_json,description=EXCLUDED.description,enabled=true,updated_at=now();
