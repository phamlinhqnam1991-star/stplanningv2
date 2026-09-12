# ST Planning Clean Rebuild v019 — Detailed Painting / Cabin Scheduler

v019 upgrades the v018 finite-capacity Target Engine by replacing wet-paint one-block Cabin scheduling with detailed `Setup → Application → Flash/Wait → Cure → Release` scheduling.

## What changed
- PRIMER / PRIMER2 / PRIMER3 / TOPCOAT1 / TOPCOAT2 / ANTI_ABRASION / PAINT_MARKING / VARNISH use the detailed Painting scheduler.
- CAB1 / CAB2 / CAB3 / CAB4 eligibility is resolved from configuration, with support for Main Operation and Recipe No. overrides.
- Recipe Master stage times are used for Flash/Degas and Cure when available.
- The configured total Process Time remains authoritative: painting stages partition that total instead of blindly adding extra hours.
- Cabin changeover still uses the resource `changeoverMinutes` baseline.
- Each stage records whether it consumes Cabin capacity. Defaults are conservative: Flash, Cure and Release all occupy the selected cabin.
- Existing imported CAB schedules remain fixed full blocks because source Scheduling rows do not contain stage timestamps.
- CFG-95 now exposes editable `PAINT_CAPACITY` rules.
- OUT-41 timeline shows Painting stages and distinguishes elapsed-only stages if Cabin occupancy is disabled later.

## Upgrade from v018
Run only:
1. `db/32_painting_segmented_v019.sql` — 4 SQL statements.
2. Optional: `db/verify_v019_painting.sql` — 6 read-only queries.

No schema migration is required. No previous SQL files need to be rerun.

## Files intentionally changed
- `lib/capacity-model.ts`
- `lib/finite-capacity-scheduler.ts`
- `components/FiniteCapacityPanel.tsx`
- `components/CapacityModelConsole.tsx`
- `app/globals.css`
- `db/32_painting_segmented_v019.sql`
- `db/verify_v019_painting.sql`
- `docs/V019_PAINTING_SEGMENTED.md`
- `README.md`
- `README_v019.md`

All other v018 logic remains unchanged.
