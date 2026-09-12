-- ST Planning v020.2 — Main Operation batch prerequisite gate
-- Run after v020.1. This file contains 2 statements (Aiven-safe: <= 8).

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('capacity.mainBatchGateMode','CAPACITY_MODEL','Main Batch Start Gate','string','"ALL_MEMBER_ROUTE_READY"'::jsonb,true,'A Main Operation batch may start only when every Job assigned to that batch is route-ready. The gate is the latest ready time across all member Jobs.'),
('capacity.manualPrerequisiteGateMode','CAPACITY_MODEL','Mask/Unmask Prerequisite Gate','string','"CONSECUTIVE_ROUTE_MANUAL_CHAIN"'::jsonb,true,'All consecutive route-required Masking/Unmasking steps immediately upstream of a Main Operation are prerequisites to that downstream batch. Their workload is aggregated for visibility, and every prerequisite manual batch must finish before the Main Operation batch can start.')
ON CONFLICT (setting_key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,data_type=EXCLUDED.data_type,value_json=EXCLUDED.value_json,enabled=true,description=EXCLUDED.description,updated_at=now();

INSERT INTO config_settings (setting_key,category,label,data_type,value_json,enabled,description) VALUES
('stOutput.timeModelVersion','ST_OUTPUT_MODEL','Time Model Version','string','"V020_2_MAIN_BATCH_PREREQUISITE_GATE"'::jsonb,true,'Main Operation batches are gated by all assigned Jobs route readiness. Route-required Masking/Unmasking workload is aggregated and must complete before the downstream batch start.')
ON CONFLICT (setting_key) DO UPDATE SET value_json=EXCLUDED.value_json,description=EXCLUDED.description,enabled=true,updated_at=now();
