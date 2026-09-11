# ST Planning Clean Rebuild v011 — Config-Driven Planning Model

v011 continues v010's Configuration-First Architecture.

## New

- `CFG-91 Planning Model Workbench` at `/configuration/planning-model`.
- Operation → Main Operation mapping matrix for auto-discovered `OPERATION_CODE` and `ST_OPERATION` values.
- Main Operation master with configurable Planning Order, Planning/Scheduling/Batch flags, short code and display color.
- Reusable hierarchy: Main Operation → ST Group → Physical Area → Schedule Area → Planner.
- Planning/Router runtime now distinguishes `Next Main Operation` from `Next Planning Operation`.
- Unmapped remaining ST operations stay visible instead of being silently discarded.
- Remaining Planning Route is produced from configuration, not hard-coded code lists.

## No old business logic reintroduced

v011 does not seed any old Main Operation list, ST mapping, Candidate logic, Batch logic, Recipe logic or Auto Plan logic.

## Database migration

If v010 is already installed, run only:

```text
db/10_planning_model_config.sql  # 7 statements
```

Do not rerun 01-09.

## Important behavior

The authoritative route still comes from All Open Jobs. ST scope still comes from the imported Planning source. v011 only adds a configurable classification layer over the already-approved route analysis.
