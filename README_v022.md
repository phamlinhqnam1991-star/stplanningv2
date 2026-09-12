# ST Planning Clean Rebuild v022

## Critical Path + Bottleneck + Recovery Engine

v022 keeps all v021 routing, batch, Smart Split and finite-capacity logic unchanged, then adds analysis on top of the final simulation.

### Added

1. **Critical Path by Job**
   - Tracks every finite-capacity batch from current WIP to FINSST.
   - Separates Batch Gate Wait from Resource Wait.
   - Shows late minutes / cutoff slack and the critical batch for each at-risk Job.

2. **Bottleneck Ranking**
   - Ranks `BATCH_GATE`, `RESOURCE_WAIT`, `NDT_SPACING`, `LATE_START`, and `UNSCHEDULED` causes.
   - Score is based on delay and affected/lost ST Output dm².
   - Keeps blocking Jobs, affected batches and current resource utilization visible.

3. **Recovery Re-Simulation**
   - Non-destructive only: never writes to real Planning/Scheduling.
   - Trials can prioritize one blocking batch or the complete schedulable chain of an at-risk Job.
   - Every proposed recovery is evaluated by running the complete finite-capacity route again through FINSST.
   - Smart Batch Split recovery remains visible as a verified recovery when v021 retained the split.

4. **OUT-42 sections inside ST Output**
   - Verified Recovery Options
   - Bottleneck Ranking
   - Critical Path / At-Risk Job Routes

5. **Configuration-first controls in CFG-95**
   - Critical path enable / near-cutoff window
   - Bottleneck top-N / minimum delay
   - Recovery enable / only-when-gap
   - Maximum recovery trials
   - Minimum recovered dm²
   - Optional no-gain trial visibility

### Important behavior

Recovery trials change only simulation scheduling priority. They do **not** bypass route prerequisites, Batch Ready Gate, Recipe/Batch rules, Flybar concurrency, NDT spacing, Cabin eligibility, Masking/Unmasking manpower, or any other finite-capacity constraint.

### SQL from v021

Run only:

```text
db/37_critical_path_bottleneck_recovery_v022.sql
```

Then optionally verify:

```text
db/verify_v022_critical_recovery.sql
```

`37_critical_path_bottleneck_recovery_v022.sql` contains 2 statements and respects the Aiven maximum-8-statements rule.
