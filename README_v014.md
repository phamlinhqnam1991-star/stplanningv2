# ST Planning Clean Rebuild v014 — Candidate + Batch Model

v014 is the next step after Operation Mapping, Recipe and Process Time. It adds a configuration-driven Candidate / Batch engine without changing the source import or route architecture.

## New modules

- `/batches` — **BAT-30 Batch Planning**
- `/configuration/batch-model` — **CFG-93 Batch Model**

## Candidate Jobs

Candidates are derived at runtime from the current active Planning + Routing + Configuration snapshot:

`Full Route → Remaining ST Route → Next Planning Operation → Recipe → Process Time → Batch Rule → Batch Key`

A row is batch-eligible only when its configured Next Planning Operation has `batchEnabled=true` and its applicable Batch Rule passes.

Existing jobs in an open batch are blocked according to configurable `BATCH_STATUS.data.blocksCandidate` rather than a hard-coded status list.

## Batch Key

Batch Keys are configuration data. Seeded dimensions include:

- Main Operation
- Recipe No. / Recipe Name
- Program
- Part / Revision / Part Cluster
- Next Operation / Next ST Operation
- ST Group / Physical Area / Schedule Area / Planner
- Process Time Minutes

New `RAW_COLUMN` key fields can be added later in CFG-93 without code changes.

Default fallback key:

`MAIN_OPERATION | RECIPE_NO`

This is only a default config seed; create lower-priority Batch Rules per Main Operation to override it.

## Batch Rules

`config_rules.rule_type='BATCH'` supports configurable actions such as:

- `keyFields`
- `delimiter`
- `requireRecipe`
- `blockReviewCandidates`
- `maxJobs`
- `maxQty`
- `maxSurfaceDm2`
- `processTimeAggregation` (`MAX`, `SUM`, `MIN`, `FIRST`)

Rules are priority ordered; lower priority number is evaluated first. Empty condition is the fallback rule.

## Batch lifecycle

Seeded statuses:

- DRAFT
- READY
- SCHEDULED
- STARTED
- COMPLETED
- CANCELLED

Status behavior is configuration data (`blocksCandidate`, `allowDelete`, display color).

## Batch number

Config setting:

`batchModel.batchNumberPattern`

Default seed:

`{SHORT}_{YYYYMMDD}_{SEQ3}`

Supported placeholders:

- `{SHORT}`
- `{MAIN}`
- `{YYYYMMDD}`
- `{DDMMM}`
- `{SEQ3}`
- `{SEQ4}`

The default can be edited later without changing code.

## Database upgrade from v013

Run separately in Aiven Query Editor:

1. `db/21_batch_core.sql` — 6 statements
2. `db/22_batch_config_seed.sql` — 4 statements

Then verify with:

`db/verify_v014_batch.sql` — 6 queries

No SQL file exceeds the requested maximum of 8 statements/queries per execution.

## Important boundary

v014 creates Planning batches only. It does **not** yet place those batches on the Scheduling timeline/resource lanes. Scheduling assignment is the next architecture step after Candidate/Batch validation is confirmed.
