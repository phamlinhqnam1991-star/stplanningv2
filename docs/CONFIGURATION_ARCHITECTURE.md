# Configuration-First Architecture — v010

v010 makes extensible behavior data-driven without changing the approved RAW/Silver data model.

## Principle

- Source evidence remains immutable.
- Configuration controls mappings, source parsing, UI defaults and future rules.
- Imports snapshot the configuration used at import start so a configuration edit cannot change an import already in progress.
- Fallback constants remain only as safe bootstrap defaults if the configuration tables are unavailable.

## Configuration tables

| Table | Purpose |
| --- | --- |
| `config_items` | Generic master data: Main Operations, ST Operations, resources, statuses, areas, planners, recipe groups and future categories. |
| `config_links` | Generic relationships such as Operation → Main Operation → Area → Planner. |
| `config_rules` | Future rule definitions for priority, process time, batch, recipe, candidate, auto plan and route policies. |
| `config_settings` | Runtime switches and limits. |
| `config_source_profiles` | Sheet name, header rows, source column mappings, critical headers and routing prefixes. |
| `config_view_profiles` | Shared default Planning/Scheduling/Routing view profiles. |

## Active configuration already consumed by runtime

- Planning/Scheduling/Routing source sheet names and header rows.
- Critical source headers and baseline column counts.
- Planning core column mapping and ST-operation column range.
- Scheduling core column mapping and resource-lane source mapping.
- Routing core column mapping, operation slots and header prefixes.
- Import chunk limits.
- Route position policy (`NextOperation`, first-incomplete fallback, include-current behavior).
- Resource labels/order.
- Schedule status labels/visual colors.
- Default/max UI page size.
- Shared default view profiles when the browser has no saved local view.
- Operation → Main Operation mapping for `Next Main Operation` and `Remaining Main Route`.

## Auto-discovery

During import the application adds source-discovered codes to configuration masters without overwriting user enable/disable decisions:

- Planning ST operation headers → `ST_OPERATION`.
- Full routing operation codes → `OPERATION_CODE`.

## Configuration snapshots

`import_runs.config_snapshot` and `route_import_runs.config_snapshot` store the effective source profile/settings at the start of an import. Chunk and finish APIs use this snapshot instead of live configuration.

## Intentionally not activated yet

`config_rules` provides the storage/management layer for Candidate, Batch, Recipe, Process Time, Priority and Auto Plan rules, but v010 does not execute those business rules. They remain inactive until explicitly approved.
