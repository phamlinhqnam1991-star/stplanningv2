# v021 — Full Route Dependency Graph + Smart Batch Split

## Purpose

v021 upgrades finite-capacity target planning from direct predecessor gating to a visible Job-level dependency graph between every finite-capacity batch from current WIP through FINSST.

A downstream batch can start only after every member Job is route-ready. The engine records which predecessor batch and Job sets the gate.

## Smart Batch Split

Only `PROPOSED_BATCH` nodes may be trial-split. Existing or production batches are never changed automatically.

Baseline policy:

- Full route dependency graph: ON
- Split only when the unsplit forecast misses target: ON
- Route-ready gap threshold: 60 min
- Minimum early ready Jobs: 2
- Minimum early ready surface: 500 dm²
- Maximum parts: 3
- Conservative split penalty: 10 min per generated part

The scheduler first runs the original unsplit scenario. When target is short, it detects proposed batches where one late subset delays an otherwise ready subset. It then creates a trial split, re-runs all route precedence and finite resource constraints, and keeps the split only if confirmed finite-capacity output improves.

Example:

```text
BSAUNSLD proposed batch = 10 Jobs
9 Jobs ready 05:30
1 Job route-ready 08:00

Unsplit:
BSA starts >= 08:00

Trial split:
Part 1 = 9 ready Jobs
Part 2 = 1 late Job

The split is accepted only when the complete downstream re-simulation increases output reaching FINSST before cutoff.
```

## Dependency output

OUT-41 exposes:

- From Batch / From Operation
- Job
- To Batch / To Operation
- Route lag between finite-capacity operations
- Ready timestamp
- BLOCKING marker when the edge sets the downstream batch-ready gate

This is the basis for the next Critical Path / Bottleneck / Recovery engine.
