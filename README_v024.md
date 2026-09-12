# ST Planning Clean Rebuild v024

## What-if / Target Optimizer

v024 keeps all approved v023 logic and adds a non-destructive what-if scenario layer to `/st-output`.

The new `OUT-44 / WHAT-IF OPTIMIZER` can re-simulate the full chain with temporary assumptions such as:

```text
CAB2 DOWN
FB3 DOWN
Chemical Process concurrency = 4
Masking Operators = 5
Unmasking Operators = 4
Existing Schedule = KEEP / IGNORE
```

Resource outages are modeled as full-horizon occupied capacity. The simulation still respects:

- Full Job Route / OprSeq
- NextOperation position
- Recipe and Process Time rules
- Batch Key and Batch Capacity
- all-member Batch Ready gates
- route-aware Masking / Unmasking prerequisites
- Smart Batch Split
- six Chemical Flybars
- Chemical Process concurrency
- NDT start spacing
- Painting cabin eligibility / segmented time
- Masking / Unmasking workstation and labor pools
- Critical Path / Bottleneck / Recovery
- Backward Target Batch deadlines

### Auto optimizer

By default the optimizer can trial:

```text
FINSST cutoff +60 min
FINSST cutoff +120 min
Chemical Process concurrency +1
Masking operators +1
Unmasking operators +1
```

All values are Configuration-first under `CAPACITY_MODEL` and can be changed without source-code edits.

The best scenario is ranked by smallest target gap, then highest finite forecast, then fewer unscheduled / late batches.

### SQL from v023

Run only:

```text
db/39_what_if_optimizer_v024.sql
```

Then optionally:

```text
db/verify_v024_what_if.sql
```

`39_what_if_optimizer_v024.sql` contains 2 statements and respects the Aiven maximum-8-statements rule.

### Safety boundary

What-if and optimizer trials are simulation-only. They do not create, split, reschedule or approve real production batches.
