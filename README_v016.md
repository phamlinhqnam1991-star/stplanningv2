# ST Planning Clean Rebuild v016 — Finite Capacity Target Scheduler

Adds finite-capacity validation to OUT-40 ST Output Target and CFG-95 Finite Capacity Model.

Run only `db/25_finite_capacity_config.sql` after v015. Optional validation: `db/verify_v016_capacity.sql`.

New engine: `lib/finite-capacity-scheduler.ts`. New API: `/api/st-output/capacity`. It creates trial Proposed Batches in memory only; it does not write production batches or alter Scheduling data.

Existing imported Scheduling blocks are treated as fixed occupancy. Proposed work respects Job precedence, Batch Rules, Recipe, Process Time, resource alternatives, physical slot counts and shared concurrency. Target result is CONFIRMED / PROVISIONAL / NOT_FEASIBLE.
