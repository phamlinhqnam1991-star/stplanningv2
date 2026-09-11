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
