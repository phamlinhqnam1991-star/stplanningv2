# ST Planning Clean Rebuild v017 — Full Timing / Recipe / Batch / Capacity Baseline

v017 activates a user-approved editable baseline so ST Output can calculate total remaining time from `NextOperation` to `FINSST` with fewer REVIEW/unknown gaps.

### New behavior
- Operation-aware Process Time resolver.
- Masking / Unmasking source standards interpreted as minutes per piece.
- Sirius Cleaning 10/20/50-pcs source-time rule enabled.
- Blasting source minutes scale by source Batch Size.
- Paint Qty/Surface tiers activated.
- Chemical Line total-time estimate = Loading + Recipe Process + optional 5h NDT + Unloading.
- Conservative fallback time seeded for every Main Operation family.
- Source-only Recipe No. values accepted for simulation without inventing new recipe numbers.
- Operation-specific Batch capacities seeded.
- Masking / Unmasking / NDT / Inspection / Rework finite resources added.
- Resource changeover baselines seeded.
- Unknown route time policy changed to BLOCK after all configured fallbacks are attempted.

### Upgrade from v016
Run separately in Aiven Query Editor:
1. `db/26_process_time_engine_v017.sql` — 6 statements
2. `db/27_process_time_baseline_v017.sql` — 1 statement
3. `db/28_batch_capacity_baseline_v017.sql` — 3 statements
4. `db/29_capacity_baseline_v017.sql` — 4 statements
5. `db/30_output_precision_v017.sql` — 3 statements
6. optional `db/verify_v017_parameters.sql` — 6 queries

No SQL file exceeds the requested maximum of 8 statements/queries.

All values marked `seedVersion=v017`, `assumption=true` or `assumptionBaseline=true` are editable configuration seeds, not source facts.
