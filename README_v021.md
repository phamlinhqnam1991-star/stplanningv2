# ST Planning Clean Rebuild v021

## Full Route Dependency Graph + Smart Batch Split

v021 keeps all v020.2 logic and adds two target-planning capabilities.

1. **Full Route Dependency Graph** — every finite-capacity Main Operation batch is linked to its Job-level predecessor batch from the real Job route. The downstream batch gate remains `MAX(all member Job ready times)`, but the UI now shows exactly which Job/batch/operation is blocking it.
2. **Smart Batch Split** — when the unsplit finite-capacity forecast misses the ST Output target, the simulator may trial-split a **proposed** batch when ready Jobs are being held by a late subset. It re-runs the complete finite-capacity scenario and keeps the split only when output before FINSST cutoff improves.

No existing production batch is auto-split. All thresholds are Configuration-first under CFG-95.

### SQL from v020.2

Run only:

```text
db/36_dependency_graph_smart_split_v021.sql
```

Then optionally verify:

```text
db/verify_v021_dependency_split.sql
```

`36_dependency_graph_smart_split_v021.sql` contains 2 statements and respects the Aiven maximum-8-statements rule.
