# v024 — What-if / Target Optimizer

v024 adds a simulation-only scenario layer above the complete v023 target engine.

The optimizer does not change real batches, real scheduling blocks, resource master data, saved targets, or configuration values.

## Manual what-if inputs

The ST Output page can trial:

- resource outage by instance, e.g. `CAB2`, `FB3`, `MSK2`
- complete base-resource outage, e.g. `FLYBAR`
- Chemical Line shared Process concurrency override
- Masking operator-pool override
- Unmasking operator-pool override
- include / ignore existing production schedule for analysis

Target value and FINSST cutoff remain driven by the ST Output command panel.

A disabled resource is represented as a full-horizon finite-capacity outage block. This means all existing routing, recipe, batch, predecessor, Mask/Unmask gate, Flybar, NDT and Cabin constraints remain active around the outage.

## Automatic optimizer trials

From the current manual what-if scenario, v024 can additionally trial configured alternatives such as:

- extend FINSST cutoff by configured minute values
- increase Chemical Process concurrency
- add Masking operator capacity
- add Unmasking operator capacity

Every trial re-runs the full finite-capacity target calculation. Results are ranked by:

1. smallest remaining target gap
2. highest finite-capacity ST Output forecast
3. fewer unscheduled batches
4. fewer late batches

## Important

The optimizer is advisory only. It does not automatically apply the best scenario to production.
