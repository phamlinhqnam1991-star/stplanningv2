-- ST Planning v013 configurable source field catalog
-- 2 statements.

INSERT INTO config_items (category, code, label, sort_order, data)
VALUES
('RECIPE_SOURCE_FIELD','AUTO_SHP_RECIPE_PVT','Auto Shot Peening Recipe PVT',10,'{"sourceColumn":"BC","valueKind":"RECIPE_CODE","sourceHeader":"AutoSP.1.RECIPE PVT","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','MANUAL_SP_EXECUTION_FILE','Manual Shot Peening Execution File',20,'{"sourceColumn":"CH","valueKind":"SOURCE_IDENTIFIER","sourceHeader":"ManualSP.1.New Execution file Name","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','FLUID_MASKING_NAME','Fluid Masking Material Name',30,'{"sourceColumn":"BE","valueKind":"RECIPE_NAME","sourceHeader":"FluidMasking","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','PRIMER1_NAME','Primer 1 Material Name',40,'{"sourceColumn":"BF","valueKind":"RECIPE_NAME","sourceHeader":"Part_Masterlist.PRIMER1","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','PRIMER2_NAME','Primer 2 Material Name',50,'{"sourceColumn":"BG","valueKind":"RECIPE_NAME","sourceHeader":"Part_Masterlist.PRIMER2","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','PRIMER3_NAME','Primer 3 Material Name',60,'{"sourceColumn":"BH","valueKind":"RECIPE_NAME","sourceHeader":"Part_Masterlist.PRIMER3","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','TOPCOAT1_NAME','Topcoat 1 Material Name',70,'{"sourceColumn":"BI","valueKind":"RECIPE_NAME","sourceHeader":"Part_Masterlist.TOPCOAT1","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','TOPCOAT2_NAME','Topcoat 2 Material Name',80,'{"sourceColumn":"BJ","valueKind":"RECIPE_NAME","sourceHeader":"Part_Masterlist.TOPCOAT2","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','ANTIABRASION_NAME','Anti-Abrasion Material Name',90,'{"sourceColumn":"BK","valueKind":"RECIPE_NAME","sourceHeader":"Part_Masterlist.ANTIABRATION","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','VARNISH_NAME','Varnish Material Name',100,'{"sourceColumn":"BL","valueKind":"RECIPE_NAME","sourceHeader":"Part_Masterlist.VarinishName","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','SIRIUS_RECIPE_NO','Sirius Cleaning Recipe',110,'{"sourceColumn":"CI","valueKind":"RECIPE_CODE","sourceHeader":"Sirius_cleaning.Recipe","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','PLATING_RECIPE_NO','Plating Recipe',120,'{"sourceColumn":"CP","valueKind":"RECIPE_CODE","sourceHeader":"Plating_recipe","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','HE_AFTER_STRIP','He-Bake Recipe after Strip',130,'{"sourceColumn":"DY","valueKind":"RECIPE_CODE","sourceHeader":"Hebake Recipe after Strip","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','HE_AFTER_PLATING','He-Bake Recipe after Plating',140,'{"sourceColumn":"DZ","valueKind":"RECIPE_CODE","sourceHeader":"HE-BAKE RECIPE after Plating","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','HE_BEFORE_BLASTING','He-Bake Before Blasting',150,'{"sourceColumn":"EA","valueKind":"RECIPE_CODE_LIST","sourceHeader":"Before Blasting","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','HE_AFTER_PLATING_PARAM','He-Bake After Plating Parameter',160,'{"sourceColumn":"EB","valueKind":"RECIPE_CODE","sourceHeader":"After Plating","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','HE_AFTER_STRIP_PARAM','He-Bake After Strip Parameter',170,'{"sourceColumn":"EC","valueKind":"RECIPE_CODE","sourceHeader":"After striping","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','HE_AFTER_CC','He-Bake After CC',180,'{"sourceColumn":"ED","valueKind":"RECIPE_CODE","sourceHeader":"After CC","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','PLATING_CLEAN_NDT','Plating Clean Prior NDT',190,'{"sourceColumn":"EE","valueKind":"RECIPE_CODE","sourceHeader":"PlatingLine.Clean prior NDT","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','PLATING_LINE_RECIPE','Plating Line Recipe',200,'{"sourceColumn":"EF","valueKind":"RECIPE_CODE","sourceHeader":"PlatingLine.Plating","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','CHROMATE_RECIPE','Chromate Coating Recipe',210,'{"sourceColumn":"EG","valueKind":"RECIPE_CODE","sourceHeader":"PlatingLine.Chromate Coating","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','ADD_PRE_SURFACE','Pre-cleaning / Surface Recipe',220,'{"sourceColumn":"EH","valueKind":"RECIPE_CODE","sourceHeader":"AddInfo_Pre&Surface","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','ADD_ANODIZING','Anodizing Aluminium Recipe',230,'{"sourceColumn":"EI","valueKind":"RECIPE_CODE","sourceHeader":"AddInfo_.Anodizing Aluminium","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','ADD_PRIMER1','Primer 1 Recipe No.',240,'{"sourceColumn":"EJ","valueKind":"RECIPE_CODE","sourceHeader":"AddInfo_Primer 1","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','ADD_TOPCOAT','Topcoat Recipe No.',250,'{"sourceColumn":"EK","valueKind":"RECIPE_CODE","sourceHeader":"AddInfo_Top Coat","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','ADD_ANTIABRASION','Anti-Abrasion Recipe No.',260,'{"sourceColumn":"EL","valueKind":"RECIPE_CODE","sourceHeader":"AddInfo_Anti Abrasion Paint","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb),
('RECIPE_SOURCE_FIELD','ADD_CLEARCOAT','Clear Coat Recipe No.',270,'{"sourceColumn":"EM","valueKind":"RECIPE_CODE","sourceHeader":"AddInfo_Clear Coat","sourceSheet":"SirusClean_Painting_MasterList"}'::jsonb)
ON CONFLICT (category, code) DO NOTHING;

INSERT INTO config_items (category, code, label, sort_order, data)
VALUES
('PROCESS_TIME_SOURCE_FIELD','SIRIUS_TIME_10','Sirius Cleaning Time 10 pcs / 2 operators',10,'{"sourceColumn":"CQ","unit":"MINUTE","sourceHeader":"Sirius_cleaning.Time 10pcs (minute)/2 operator","sourceSheet":"SirusClean_Painting_MasterList","needsReview":false}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','SIRIUS_TIME_20','Sirius Cleaning Time 20 pcs / 2 operators',20,'{"sourceColumn":"CR","unit":"MINUTE","sourceHeader":"Sirius_cleaning.Time 20 pcs (minute)/2 operator","sourceSheet":"SirusClean_Painting_MasterList","needsReview":false}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','SIRIUS_TIME_50','Sirius Cleaning Time 50 pcs / 2 operators',30,'{"sourceColumn":"CS","unit":"MINUTE","sourceHeader":"Sirius_cleaning.Time 50 pcs (minute)/2 operator","sourceSheet":"SirusClean_Painting_MasterList","needsReview":false}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','SIRIUS_BATCH_SIZE','Sirius Cleaning Batch Size',40,'{"sourceColumn":"CT","unit":"PCS","sourceHeader":"Sirius_cleaning.Batch size (pcs)","sourceSheet":"SirusClean_Painting_MasterList","needsReview":false}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_CU','V_MRK-DP',50,'{"sourceColumn":"CU","unit":"SOURCE_UNCONFIRMED","sourceHeader":"V_MRK-DP","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_CV','MRKG-LA',60,'{"sourceColumn":"CV","unit":"SOURCE_UNCONFIRMED","sourceHeader":"MRKG-LA","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_CW','MSKG-PC',70,'{"sourceColumn":"CW","unit":"SOURCE_UNCONFIRMED","sourceHeader":"MSKG-PC","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_CX','UNMSKG after Precleaning',80,'{"sourceColumn":"CX","unit":"SOURCE_UNCONFIRMED","sourceHeader":"UNMSKG after Precleaning","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_CY','MSKG-DBL',90,'{"sourceColumn":"CY","unit":"SOURCE_UNCONFIRMED","sourceHeader":"MSKG-DBL","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_CZ','MSKG-SP',100,'{"sourceColumn":"CZ","unit":"SOURCE_UNCONFIRMED","sourceHeader":"MSKG-SP","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_DA','UNMSKG-S',110,'{"sourceColumn":"DA","unit":"SOURCE_UNCONFIRMED","sourceHeader":"UNMSKG-S","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_DB','MSKG-MEC',120,'{"sourceColumn":"DB","unit":"SOURCE_UNCONFIRMED","sourceHeader":"MSKG-MEC","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_DC','MSKAFSHP',130,'{"sourceColumn":"DC","unit":"SOURCE_UNCONFIRMED","sourceHeader":"MSKAFSHP","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_DD','UNMSKG',140,'{"sourceColumn":"DD","unit":"SOURCE_UNCONFIRMED","sourceHeader":"UNMSKG","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_DE','MSKG-AND',150,'{"sourceColumn":"DE","unit":"SOURCE_UNCONFIRMED","sourceHeader":"MSKG-AND","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_DF','V_MSKBCC',160,'{"sourceColumn":"DF","unit":"SOURCE_UNCONFIRMED","sourceHeader":"V_MSKBCC","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_DG','MSKG-TC (before primer)',170,'{"sourceColumn":"DG","unit":"SOURCE_UNCONFIRMED","sourceHeader":"MSKG-TC (before primer)","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_DH','UNMSKG after Primer1',180,'{"sourceColumn":"DH","unit":"SOURCE_UNCONFIRMED","sourceHeader":"UNMSKG after Primer1","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_DI','MSKG-TC (before primer2)',190,'{"sourceColumn":"DI","unit":"SOURCE_UNCONFIRMED","sourceHeader":"MSKG-TC (before primer2)","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_DJ','MSKG-TC (before topcoat1)',200,'{"sourceColumn":"DJ","unit":"SOURCE_UNCONFIRMED","sourceHeader":"MSKG-TC (before topcoat1)","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_DK','MSKGABP',210,'{"sourceColumn":"DK","unit":"SOURCE_UNCONFIRMED","sourceHeader":"MSKGABP","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_DL','UNMSKG _1',220,'{"sourceColumn":"DL","unit":"SOURCE_UNCONFIRMED","sourceHeader":"UNMSKG _1","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_DM','V_MSKBCC _2',230,'{"sourceColumn":"DM","unit":"SOURCE_UNCONFIRMED","sourceHeader":"V_MSKBCC _2","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','MASK_DN','UNMSKG _3',240,'{"sourceColumn":"DN","unit":"SOURCE_UNCONFIRMED","sourceHeader":"UNMSKG _3","sourceSheet":"SirusClean_Painting_MasterList","needsReview":true}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','BLASTING_TIME','Blasting Time',250,'{"sourceColumn":"DW","unit":"MINUTE","sourceHeader":"Blasting.Blasting time (minute)","sourceSheet":"SirusClean_Painting_MasterList","needsReview":false}'::jsonb),
('PROCESS_TIME_SOURCE_FIELD','BLASTING_BATCH_SIZE','Blasting Batch Size',260,'{"sourceColumn":"DX","unit":"PCS","sourceHeader":"Blasting.Batch size","sourceSheet":"SirusClean_Painting_MasterList","needsReview":false}'::jsonb)
ON CONFLICT (category, code) DO NOTHING;
