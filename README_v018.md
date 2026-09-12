# ST Planning Clean Rebuild v018 — Chemical Line Segmented Scheduler

v018 upgrades the v017 finite-capacity Target Engine by replacing the single Chemical Line block with detailed `Loading → Process → NDT → Unloading` scheduling.

## What changed
- 6 Flybars are scheduled as physical carriers.
- Maximum 3 Chemical `Process` segments can run concurrently.
- Preclean Recipe No. `001`, `009`, `016`, `025` receive fixed 5h NDT.
- NDT starts are kept at least 1h30 apart.
- When NDT cannot start immediately, the Flybar is held in `Wait NDT` and the delay is included in FINSST ETA.
- Loading/Unloading duration is recalculated using total proposed Batch Qty/Surface.
- ST Output finite-capacity timeline now shows Chemical Line segments separately.
- Resource Load now separates physical Flybar utilization from shared Process utilization.
- Existing imported Flybar schedule remains fixed; because source rows have no segment timestamps, the default policy conservatively counts each existing Flybar block as Process occupancy.

## Upgrade from v017
Run only:
1. `db/31_chemical_line_segmented_v018.sql` — 3 SQL statements.
2. Optional: `db/verify_v018_chemical.sql` — 6 read-only queries.

No schema migration is required. No previous SQL files need to be rerun.

## Files intentionally changed
- `lib/capacity-model.ts`
- `lib/finite-capacity-scheduler.ts`
- `components/FiniteCapacityPanel.tsx`
- `components/CapacityModelConsole.tsx`
- `app/globals.css`
- `db/31_chemical_line_segmented_v018.sql`
- `db/verify_v018_chemical.sql`
- `docs/V018_CHEMICAL_LINE_SEGMENTED.md`
- `README.md`
- `README_v018.md`

All other v017 logic remains unchanged.
