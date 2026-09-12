# ST Planning Clean Rebuild v023

## Target Backward Batch Generator

v023 keeps the full v022 finite-capacity simulation unchanged and adds a non-destructive **target-backward requirement plan**.

Starting from:

```text
FINSST cutoff
+ ST Output target
- Actual Output
- Committed Output
```

it selects the minimum Job portfolio needed to close the remaining dm² gap. Jobs that already finish before cutoff are preferred; if they are insufficient, AT_RISK / UNSCHEDULED selected Jobs can enter the backward portfolio so the engine exposes exactly which upstream batches must be recovered. It then walks each selected Job route backward through every required Main Operation batch.

For every required batch v023 calculates:

- Schedule Area / Planner
- Main Operation
- Recipe No / Recipe Name
- Target Jobs inside the batch
- Target dm² and full Batch dm²
- Batch duration
- `Must Start By`
- `Must Finish By`
- simulated Start / End
- resource placement
- predecessor batches
- schedule slack
- ON_TIME / AT_RISK / UNSCHEDULED

Shared batches use the **tightest backward deadline** among all selected target Jobs that depend on that batch.

### OUT-43

`/st-output` now includes:

1. Target Backward Plan summary
2. Schedule Area / Planner demand rollup
3. Required Batch / Recipe / Deadline sequence

The area rollup distinguishes:

- `Unique Target dm²`: unique selected output Jobs touching the area
- `Flow Load dm²`: route workload through all required batches in that area; the same output Job can contribute more than once when it has multiple required operations in the same area

### Portfolio selection

Default configuration:

```text
Planned Jobs first
then earliest finite FINSST finish
Reserve = 0%
Max portfolio = 500 Jobs
```

These are configuration values, not hard-coded business rules.

### Important

v023 is still simulation-only. It does not create or modify real Production batches or Scheduling records.

### SQL from v022

Run only:

```text
db/38_target_backward_batch_v023.sql
```

Then optionally:

```text
db/verify_v023_backward_target.sql
```

`38_target_backward_batch_v023.sql` contains 2 statements and respects the Aiven maximum-8-statements rule.
