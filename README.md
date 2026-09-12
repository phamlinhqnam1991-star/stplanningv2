# ST Planning Clean Rebuild v020.2 — Main Batch Prerequisite Gate

This incremental version keeps v020.1 route-aware Masking/Unmasking and adds an explicit gate for every downstream Main Operation batch.

## Locked logic

For a Main Operation batch, **all Jobs in the batch must be route-ready before the batch can start**. If only some Jobs require Masking/Unmasking before the Main Operation, the engine walks the consecutive route-required manual chain for each Job (for example `UNMSKG → MSKG-AND → BSAUNSLD`). Those manual steps are prerequisites for the whole downstream batch.

Example: a BSAUNSLD batch contains 10 Jobs. Three Jobs have `MSKG-AND` immediately before BSAUNSLD and their aggregated Masking load is 60 minutes. The BSAUNSLD batch cannot start until all three Masking Jobs are complete (and all other member Jobs are route-ready). The BSAUNSLD process duration remains separate from the Masking load; the gate controls the earliest start.

The finite-capacity result now exposes:
- Batch Ready Gate
- Mask/Unmask prerequisite batch count
- affected prerequisite Job count
- total Mask/Unmask prerequisite load minutes
- prerequisite completion time
- prerequisite batch / operation / Job details

If prerequisite manual batches run in parallel, the engine does **not** blindly add their elapsed clocks together. `Total Mask/Unmask load` is reported as workload, while the downstream batch start gate uses the **latest actual prerequisite completion** across its member Jobs.

## SQL
Run only after v020.1:
1. `db/35_main_batch_prerequisite_gate_v020_2.sql` (2 statements)
2. Optional: `db/verify_v020_2_batch_gate.sql` (6 read-only queries)

No table/schema migration is required.

---

# ST Planning Clean Rebuild — v020

Current baseline: v020 Masking / Unmasking manpower + workstation finite-capacity scheduling. See `README_v020.md` and `docs/V020_MASKING_UNMASKING_MANPOWER.md`.

# ST Planning Clean Rebuild v015 — ST Output Target Engine

v015 adds target-driven planning at Final ST (`FINSST` by default).

## New modules

- `/st-output` — **OUT-40 ST Output Target**
- `/configuration/output-model` — **CFG-94 ST Output Model**

## Core logic

`NextOperation → Remaining Route → Operation/Main/Recipe/Process Time → FINSST ETA`

and backward:

`FINSST cutoff → Latest Start per remaining step → Critical Action`

The default cutoff seed is `15:00`. Both FINSST and cutoff are Configuration settings.

## Target summary

The dashboard separates:

- Actual Output
- Committed
- Already Planned
- Need Plan
- At Risk
- Review
- Recommended additional Surface dm²
- Forecast and remaining target gap

Recommendation expands selected Jobs into Area / Main Operation / Recipe action groups and shows `Must Start By` times.

## Database upgrade from v014

Run separately in Aiven Query Editor:

1. `db/23_st_output_target.sql` — 3 statements
2. `db/24_st_output_config_seed.sql` — 4 statements
3. optional verification: `db/verify_v015_st_output.sql` — 6 queries

No SQL file exceeds the requested maximum of 8 statements/queries.

## Build fix included

v014 `candidate-service.ts` referenced an undefined `model` variable when checking blocking Batch statuses. v015 changes only that reference to the already-loaded `batchModel`, because it is a build/runtime blocker for Candidate Jobs.

## Capacity boundary

v015 uses known schedule blocks when available. Unscheduled work is calculated as process-time feasibility. Finite-resource automatic scheduling is intentionally left for the next stage so the target engine does not falsely claim a resource slot that has not been assigned.


---

# ST Planning Clean Rebuild v016 — Finite Capacity Target Scheduler

Adds finite-capacity validation to OUT-40 ST Output Target and CFG-95 Finite Capacity Model.

Run only `db/25_finite_capacity_config.sql` after v015. Optional validation: `db/verify_v016_capacity.sql`.

New engine: `lib/finite-capacity-scheduler.ts`. New API: `/api/st-output/capacity`. It creates trial Proposed Batches in memory only; it does not write production batches or alter Scheduling data.

Existing imported Scheduling blocks are treated as fixed occupancy. Proposed work respects Job precedence, Batch Rules, Recipe, Process Time, resource alternatives, physical slot counts and shared concurrency. Target result is CONFIRMED / PROVISIONAL / NOT_FEASIBLE.
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

---

# ST Planning Clean Rebuild v018 — Chemical Line Segmented Finite Scheduler

v018 replaces the Chemical Line one-block capacity approximation with `Loading → Process → Wait NDT → NDT → Unloading` simulation on 6 Flybars. It enforces maximum 3 concurrent Process segments, 5h NDT for Recipe `001/009/016/025`, and 1h30 minimum NDT-start spacing. Loading/Unloading tiers and all Chemical Line constraints are configuration-driven.

Upgrade from v017: run only `db/31_chemical_line_segmented_v018.sql` (3 statements). Optional verification: `db/verify_v018_chemical.sql` (6 queries).

---

# ST Planning Clean Rebuild v019 — Detailed Painting / Cabin Scheduler

v019 replaces wet-paint one-block capacity approximation with `Setup → Application → Flash/Wait → Cure → Release` simulation across CAB1–CAB4. Cabin eligibility can be configured by Main Operation and Recipe No.; Recipe Master stage times are reused where available while the resolved total Process Time remains authoritative.

Upgrade from v018: run only `db/32_painting_segmented_v019.sql` (4 statements). Optional verification: `db/verify_v019_painting.sql` (6 queries).
