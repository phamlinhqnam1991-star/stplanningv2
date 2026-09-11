-- ST Planning v012 seeded configuration verification (6 queries)

SELECT category,count(*) FROM config_items WHERE category IN ('MAIN_OPERATION','ST_GROUP','PHYSICAL_AREA','SCHEDULE_AREA','PLANNER','OPERATION_CODE','ST_OPERATION') GROUP BY category ORDER BY category;

SELECT link_type,count(*) FROM config_links WHERE link_type IN ('OPERATION_TO_MAIN','MAIN_TO_ST_GROUP','ST_GROUP_TO_PHYSICAL_AREA','PHYSICAL_TO_SCHEDULE_AREA','SCHEDULE_AREA_TO_PLANNER','MAIN_TO_RESOURCE') GROUP BY link_type ORDER BY link_type;

SELECT count(*) AS operation_code_total, count(*) FILTER (WHERE l.id IS NULL) AS operation_code_unmapped FROM config_items o LEFT JOIN config_links l ON l.link_type='OPERATION_TO_MAIN' AND l.from_category='OPERATION_CODE' AND upper(l.from_code)=upper(o.code) AND l.enabled=true WHERE o.category='OPERATION_CODE' AND o.enabled=true;

SELECT count(*) AS main_total, count(*) FILTER (WHERE g.id IS NULL) AS mains_without_group FROM config_items m LEFT JOIN config_links g ON g.link_type='MAIN_TO_ST_GROUP' AND g.from_category='MAIN_OPERATION' AND g.from_code=m.code AND g.enabled=true WHERE m.category='MAIN_OPERATION' AND m.enabled=true;

SELECT m.code,m.label,g.to_code AS st_group,p.to_code AS physical_area,s.to_code AS schedule_area,pl.to_code AS planner FROM config_items m LEFT JOIN config_links g ON g.link_type='MAIN_TO_ST_GROUP' AND g.from_category='MAIN_OPERATION' AND g.from_code=m.code AND g.enabled=true LEFT JOIN config_links p ON p.link_type='ST_GROUP_TO_PHYSICAL_AREA' AND p.from_category='ST_GROUP' AND p.from_code=g.to_code AND p.enabled=true LEFT JOIN config_links s ON s.link_type='PHYSICAL_TO_SCHEDULE_AREA' AND s.from_category='PHYSICAL_AREA' AND s.from_code=p.to_code AND s.enabled=true LEFT JOIN config_links pl ON pl.link_type='SCHEDULE_AREA_TO_PLANNER' AND pl.from_category='SCHEDULE_AREA' AND pl.from_code=s.to_code AND pl.enabled=true WHERE m.category='MAIN_OPERATION' AND m.enabled=true ORDER BY COALESCE((m.data->>'planningOrder')::int,m.sort_order),m.code;

SELECT o.code,o.data->>'occurrenceCount' AS route_count,o.data->>'inStScopeSource' AS in_st_scope,l.to_code AS proposed_main,l.data->>'confidence' AS confidence,l.data->>'needsReview' AS needs_review FROM config_items o LEFT JOIN config_links l ON l.link_type='OPERATION_TO_MAIN' AND l.from_category='OPERATION_CODE' AND l.from_code=o.code AND l.enabled=true WHERE o.category='OPERATION_CODE' AND o.enabled=true ORDER BY CASE WHEN (o.data->>'inStScopeSource')='true' THEN 0 ELSE 1 END, upper(o.code);
