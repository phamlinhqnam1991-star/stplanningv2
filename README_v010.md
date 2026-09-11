# ST Planning Clean Rebuild v010 — Configuration First

v010 extends v009 without changing the approved RAW/Silver model or introducing unapproved Candidate/Batch/Recipe/Auto Plan logic.

## New module

`/configuration` — **CFG-90 Configuration Center**

Manage:

- Master Data
- Mappings
- Rules
- System Settings
- Data Sources
- View Profiles

The master category, link type and rule type lists are themselves configuration-driven.

## Database migration

If v009 is already installed, run only these files in Aiven Query Editor, in order:

```text
db/07_config_core.sql       # 8 statements
db/08_config_defaults.sql   # 7 statements
db/09_config_links_seed.sql # 4 statements
```

Each file stays within the user's maximum of 8 SQL statements per run.

Do not rerun 01–06 on an existing v009 database.

## Important configuration behavior

- Source profiles are used by the browser parser and server normalizer.
- An import stores a configuration snapshot before accepting chunks.
- Routing behavior is configurable.
- Resource/status presentation is configurable.
- Default/max page size and shared default views are configurable.
- ST Operation and routing Operation Code masters auto-discover from imported source data.
- Main Operations are intentionally not pre-invented. Add them in Configuration and map operations using `OPERATION_TO_MAIN`.

Example mapping:

```text
Master Data:
Category = MAIN_OPERATION
Code     = CHEMICAL_LINE
Label    = Chemical Line

Mapping:
Link Type     = OPERATION_TO_MAIN
From Category = OPERATION_CODE (or ST_OPERATION)
From Code     = BSAUNSLD
To Category   = MAIN_OPERATION
To Code       = CHEMICAL_LINE
```

Planning and Routing will then expose the mapped `Next Main Operation` and `Remaining Main Route`.

## Runtime safety

Fallback constants are retained only to keep the app diagnosable if configuration tables are temporarily unavailable. Once 07–09 are installed, database configuration is authoritative for the supported configurable fields.

See `docs/CONFIGURATION_ARCHITECTURE.md`.
