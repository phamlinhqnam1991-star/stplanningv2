-- ST Planning v024 verification — 6 read-only queries.
SELECT setting_key,label,value_json FROM config_settings WHERE setting_key='capacity.whatIfEnabled';
SELECT setting_key,label,value_json FROM config_settings WHERE setting_key='capacity.whatIfMaxAutoTrials';
SELECT setting_key,label,value_json FROM config_settings WHERE setting_key='capacity.whatIfCutoffExtensionsMinutes';
SELECT setting_key,label,value_json FROM config_settings WHERE setting_key IN ('capacity.whatIfChemicalConcurrencyBoost','capacity.whatIfLaborBoost') ORDER BY setting_key;
SELECT setting_key,label,value_json FROM config_settings WHERE setting_key IN ('capacity.whatIfTryCutoffExtension','capacity.whatIfTryChemicalConcurrency','capacity.whatIfTryMaskingLabor','capacity.whatIfTryUnmaskingLabor') ORDER BY setting_key;
SELECT setting_key,label,value_json FROM config_settings WHERE setting_key='stOutput.timeModelVersion';
