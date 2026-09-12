# ST Planning Clean Rebuild v020.1 — Route-aware Masking / Unmasking fix

This patch corrects Masking/Unmasking scheduling so it follows the actual Job full route.

Changed only where required:
- `lib/capacity-model.ts`
- `lib/finite-capacity-scheduler.ts`
- `lib/st-output-engine.ts`
- `app/api/batches/route.ts`
- new SQL `db/34_masking_route_awareness_v020_1.sql`
- new verify SQL `db/verify_v020_1_route_manual.sql`
- documentation `docs/V020_1_ROUTE_AWARE_MASKING.md`

No Recipe, Chemical Line, Painting, ST Output target, or other capacity logic was otherwise changed.

## New behavior

Masking/Unmasking are not assumed to be before/after any Main Operation. They are taken only from the Job route and scheduled in exact route order from the current NextOperation to FINSST.

For new real batches, the saved candidate snapshot now includes `routePosition`. Existing-batch replay matches route position first, then source operation, then falls back to Main Operation for older batches.

## Database

If v020 is already installed, run only:

1. `db/34_masking_route_awareness_v020_1.sql`
2. optionally `db/verify_v020_1_route_manual.sql`

The migration file contains 2 SQL statements, within the Aiven maximum-8 rule used by this project.
