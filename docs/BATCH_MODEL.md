# Batch Model v014

## Engine chain

Full Job Route → Remaining ST Route → Next Planning Operation → Recipe Rule → Process Time Rule → Batch Rule → Batch Key → Draft Batch.

## Configuration-first principle

Batch dimensions, grouping, limits, numbering and lifecycle are configuration data. Do not hard-code operation-specific batch behavior in UI/API code when it can be represented as a `BATCH` rule or `BATCH_KEY_FIELD`.

## Current persistence

- `planning_batches`
- `planning_batch_jobs`
- `batch_number_sequences`

Batch job rows contain snapshots of the candidate state so later source imports do not erase the reason a historical batch was created.

## Future extension points

- Same Previous Batch grouping
- Main-operation-specific max jobs / qty / surface
- Part / Program / Primer / Topcoat key dimensions
- Batch split rules
- Plan-ahead eligibility
- Auto Plan
- Resource assignment / Scheduling handoff

All should be layered on the existing configuration model rather than hard-coded into the Candidate API.
