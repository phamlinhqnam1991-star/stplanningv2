-- ST Planning v013 Process Time Profiles
-- 1 statement.

INSERT INTO config_items (category, code, label, sort_order, data)
VALUES
('PROCESS_TIME_PROFILE','RECIPE_DEFAULT_FIXED','Recipe Default Fixed Time',10,'{"mode":"RECIPE_DEFAULT_MINUTES","unit":"MINUTE","source":"STRecipe.Duration","enabledByDefault":true}'::jsonb),
('PROCESS_TIME_PROFILE','BLASTING_SOURCE_MINUTES','Blasting Source Time',20,'{"mode":"SOURCE_COLUMN","unit":"MINUTE","timeColumn":"DW","batchSizeColumn":"DX","source":"Blasting.Blasting time (minute)"}'::jsonb),
('PROCESS_TIME_PROFILE','SIRIUS_QTY_BREAKPOINTS','Sirius Cleaning Qty Breakpoints',30,'{"mode":"SOURCE_QTY_BREAKPOINTS","unit":"MINUTE","operators":2,"breakpoints":[{"qty":10,"column":"CQ"},{"qty":20,"column":"CR"},{"qty":50,"column":"CS"}],"batchSizeColumn":"CT","source":"Sirius_cleaning"}'::jsonb),
('PROCESS_TIME_PROFILE','MASKING_SOURCE_VALUES','Masking / Marking Source Process Time',40,'{"mode":"SOURCE_COLUMN_BY_OPERATION","unit":"SOURCE_UNCONFIRMED","sourceColumns":["CU","CV","CW","CX","CY","CZ","DA","DB","DC","DD","DE","DF","DG","DH","DI","DJ","DK","DL","DM","DN"],"needsReview":true}'::jsonb)
ON CONFLICT (category, code) DO NOTHING;
