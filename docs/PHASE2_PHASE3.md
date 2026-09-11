# ST Planning Clean Rebuild — Phase 2 + Phase 3

This release extends the clean RAW + Silver baseline only. It does not add Candidate Jobs, Batch creation, Recipe Rules, Planning Chain, Auto Planning, drag/drop scheduling, or any legacy business rule.

## Phase 2 — Planning UI

Implemented:

- Server-side search across Job, Part, Program, Description, Next Operation and priority source values.
- Server-side filters for Program, Next Operation, ST Operation Present, and source Priority values.
- Server-side sorting with ascending/descending control.
- Configurable page size: 50 / 100 / 200 / 500.
- Column chooser for the operational Planning view.
- Browser-local Saved Views. A saved view stores search, filters, sort, column visibility and page size.
- Priority visibility from the preserved RAW source columns:
  - `CM` — `CAT&Sales.Priority type`
  - `CN` — `CAT&Sales.CAT3/5 transit`
  - `CO` — `CAT&Sales.Impact sale value`
- Part reference visibility from RAW source:
  - `CD` Alloy
  - `CE` Temper
  - `CG` RevisionNum
- ST operation visibility from `planning_job_operations`, displayed as operation/value chips.
- Filtered KPI cards: jobs, production qty, surface, programs and priority-tagged rows.

Saved Views are intentionally local to the browser in this phase. No user/account configuration table is added yet.

## Phase 3 — Scheduling UI

Implemented:

- Search across Batch, Recipe, Recipe Description, Status and resource batch references.
- Filters for Date From, Date To, Resource and Status.
- Server-side sorting and configurable page size.
- Table column chooser and browser-local Saved Views.
- Resource assignment chips for the 13 normalized resource lanes.
- Batch, recipe, jobs, pcs, surface, Start, End, Duration, Status and Comments visibility.
- Filtered KPI cards for schedule blocks, jobs, pcs, surface and active resources.
- Table / Timeline mode switch.
- Timeline is grouped by imported resource assignments and positioned only from imported Start / End / Duration values.
- Timeline time window auto-scales to filtered data. No 06:00 boundary or other legacy scheduling rule is assumed.
- Cross-midnight imported Start/End values are visualized by treating an End earlier than Start as the next day for display only.
- Blocks without imported Start are shown as untimed entries, not automatically scheduled.

## No database migration required

Phase 2 and Phase 3 use the existing v002 clean schema:

- `raw_sheet_rows`
- `planning_jobs`
- `planning_job_operations`
- `schedule_blocks`
- `schedule_resource_assignments`
- active views

The Aiven SQL scripts remain unchanged and are still split to a maximum of 8 statements per file.

## API additions

- `GET /api/planning/meta`
- enhanced `GET /api/planning`
- `GET /api/scheduling/meta`
- enhanced `GET /api/scheduling`

All filtering and sorting columns are server-side whitelisted. Free text is passed only through PostgreSQL parameters.
