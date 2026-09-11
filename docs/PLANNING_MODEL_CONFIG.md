# Planning Model Configuration — v011

v011 adds a guided, config-driven planning taxonomy without changing RAW evidence or introducing Candidate/Batch/Recipe business rules.

## Purpose

Convert source operation codes into a reusable planning hierarchy:

```text
Operation Code
  -> Main Operation
  -> ST Group
  -> Physical Area
  -> Schedule Area
  -> Planner
```

Main Operations can also be linked to one or more Resources and Recipe Groups using generic configuration links.

## Main Operation data

Each `MAIN_OPERATION` uses `config_items.data` for extensible attributes:

```json
{
  "planningOrder": 100,
  "planningEnabled": true,
  "scheduleEnabled": true,
  "batchEnabled": true,
  "shortCode": "CHM",
  "color": "#145F82"
}
```

No Main Operation values are seeded by v011. They must be defined by the user.

## New guided workbench

`/configuration/planning-model`

- Create/edit Main Operations.
- Assign Planning Order.
- Enable/disable Planning, Scheduling and future Batch behavior.
- Map auto-discovered Route/ST operation codes to Main Operations.
- Create reusable ST Group / Physical Area / Schedule Area / Planner masters.
- Configure the hierarchy without editing JSON manually.
- See mapped/unmapped coverage immediately.

The generic `/configuration` module remains available for advanced links, resource mappings, recipe groups, rules, source profiles and system settings.

## Runtime classification

Planning and Routing APIs now return:

- `nextMainOperation`
- `nextPlanningOperation`
- `remainingMainOperations`
- `remainingPlanningOperations`
- `unmappedStOperations`
- `planningClassification`

`nextPlanningOperation` is the first remaining mapped Main Operation with `planningEnabled=true`.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `planningModel.operationMappingPrecedence` | `["OPERATION_CODE","ST_OPERATION"]` | Resolve duplicate source master mappings predictably. |
| `planningModel.collapseConsecutiveMainOperations` | `true` | Collapse only adjacent operations mapped to the same Main Operation. |
| `planningModel.showUnmappedOperations` | `true` | Keep gaps visible for mapping review. |
| `planningModel.requireHierarchyForPlanning` | `false` | Optional future guard requiring hierarchy before planning eligibility. |
| `planningModel.defaultPlanningEnabled` | `true` | Default if the Main Operation does not explicitly store the flag. |

## SQL migration

Upgrade from v010 by running only:

```text
db/10_planning_model_config.sql
```

The file contains 7 statements, within the maximum of 8 statements per Aiven Query Editor run.
