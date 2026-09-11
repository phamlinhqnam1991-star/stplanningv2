# ST Planning Clean Rebuild v012 — Seeded Configuration Baseline

This version pre-populates the Planning Model from the supplied workbooks so the user does not have to create hundreds of records manually.

## Source-derived inputs
- `SirusClean_Painting_MasterList`: 36 main-operation columns M:AV and ST scope (`AllOperation`).
- `Main Planning`: resource lanes used to infer schedule areas/resources.
- `VN_AllOpenJobs_SpiritSunshine_ALL(1).xlsx`: 352 full-route operation codes and route frequency.

## Important inference boundary
The source workbooks do **not** contain actual planner/person names. v012 therefore seeds role placeholders such as `Chemical Line Planner (Review)` and marks them as `needsReview=true`. Physical/Schedule area assignments are also proposed from source/resource structure and are intended for user review.

## Run after v011
Run these Aiven SQL files in order. Each file has <= 8 statements:
1. `db/11_seed_hierarchy_masters.sql`
2. `db/12_seed_hierarchy_links.sql`
3. `db/13_seed_operation_masters.sql`
4. `db/14_seed_operation_mappings.sql`
5. Optional audit: `db/verify_v012_seed.sql`

## Seed coverage
- All 36 ST Planning source headers are created/mapped.
- All 352 operation codes found in the full All Open Jobs route file are created and assigned to a Main Operation.
- Known ST/support operations are mapped to source-derived or support Main Operations.
- Remaining route operations are assigned to `NON_ST` instead of being left unmapped.
- Every Main Operation receives a complete hierarchy path: Main Operation → ST Group → Physical Area → Schedule Area → Planner.
- Planner assignments are placeholders because the attached workbooks do not contain planner identities.

## Additional source fix
`AllOperation` contains bracketed values such as `[CPBILP]`. `lib/route-analysis.ts` now canonicalizes these tokens so they match the route operation code `CPBILP`.

## Safety
Seed inserts use conflict-safe behavior. User edits made after seeding are not intentionally overwritten by normal app imports.
