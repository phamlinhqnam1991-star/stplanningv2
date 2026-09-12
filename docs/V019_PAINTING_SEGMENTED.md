# v019 — Detailed Painting / Cabin Finite Scheduler

v019 changes only wet-paint finite-capacity placement. Chemical Line v018 and all earlier Recipe / Process Time / Batch / ST Output logic remain intact.

## Painting timeline

A simulated wet-paint Batch is split into:

`Setup → Application → Flash / Wait → Cure → Release`

The elapsed total is based on the existing resolved Batch Process Time. Stage defaults and Recipe Master stages partition this elapsed duration; they do not automatically add extra time on top of the already resolved Process Time.

Default estimated stage settings:
- Setup = 30 min
- Flash / Wait = 30 min
- Cure = 60 min
- Release = 15 min

Recipe Master stage values override Flash/Cure where available, unless a higher-priority `PAINT_CAPACITY` rule explicitly overrides them.

## Cabin eligibility

Wet-paint Main Operations initially use CAB1–CAB4. `PAINT_CAPACITY` rules may restrict or override resources by:
- `mainOperation`
- `mainOperationIn`
- `recipeNo`
- `recipeNoIn`

Action fields support:
- `allowedResources`
- `disallowedResources`
- `setupMinutes`
- `flashMinutes`
- `cureMinutes`
- `releaseMinutes`
- `flashOccupiesCabin`
- `cureOccupiesCabin`
- `releaseOccupiesCabin`

The first matching rule by priority is used.

## Capacity occupancy

Setup and Application always occupy the selected Cabin. By default, Flash, Cure and Release also occupy it so the initial model is conservative. If actual production releases the Cabin during Flash or Cure, switch the corresponding CFG-95 setting or rule override to `false`.

Non-capacity stages still remain in Job elapsed time and therefore still delay the downstream operation / FINSST ETA.

## Existing Main Planning rows

Existing CAB1–CAB4 schedule blocks remain fixed full occupancy because the imported Scheduling source does not contain stage timestamps. v019 does not fabricate historical Setup / Application / Cure times.

## Configuration

Settings are stored under `CAPACITY_MODEL` and rules under `PAINT_CAPACITY`. All v019 seeds are editable assumptions, not source facts.

No production Batch or Schedule rows are written by simulation.
