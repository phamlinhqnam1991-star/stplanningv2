# v016 — Finite Capacity Target Scheduler

## Purpose
Validate the ST Output recommendation against real resource occupancy instead of process-time arithmetic only.

## Flow
ST Output Target → NEED_PLAN selection → configured Batch Rule / Batch Key → Proposed Batch → precedence graph → finite-capacity resource placement → FINSST cutoff validation.

## Capacity behavior
- Existing `Main Planning` schedule blocks reserve time first.
- Existing Planning Batches without a schedule are placed before new proposed batches when deadlines are equal.
- New work is grouped by configurable Batch Key and split by Max Jobs / Qty / Surface limits.
- Resource alternatives come from `MAIN_TO_RESOURCE` configuration.
- Flybar is modeled as 6 physical slots (`FB1..FB6`) with maximum 3 simultaneous process blocks.
- Painting uses CAB1..CAB4 as alternative resources after v016 configuration is applied.
- Other configured resource lanes currently use one physical slot unless changed in CFG-95.
- Missing finite-resource mapping is not silently treated as confirmed capacity. Default policy keeps process-time lag but marks the target `PROVISIONAL`; change to `BLOCK` to reject those jobs.

## Scheduler
The trial scheduler honors Job route precedence. A batch cannot start until every member Job has completed its preceding simulated/fixed work plus any unconstrained process-time lag. It searches the earliest available configured resource slot while respecting existing schedule occupancy, physical instances and shared concurrency.

## Result
`CONFIRMED`: target is reached and contributing paths have finite capacity configured.
`PROVISIONAL`: numeric target is reached but one or more contributing paths cross an area without finite resource capacity configured.
`NOT_FEASIBLE`: finite-capacity forecast remains below target before FINSST cutoff.

## Deliberate boundary
v016 schedules each Main Operation as one batch-duration capacity block. The detailed Chemical Line Loading → Process → NDT → Unloading sub-timeline remains a separate refinement; v016 does not silently invent loading/unloading or NDT durations where the clean model has not yet encoded them.
