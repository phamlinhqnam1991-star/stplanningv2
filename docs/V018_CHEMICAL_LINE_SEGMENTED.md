# v018 — Detailed Chemical Line Segmented Finite Scheduler

v018 changes only the Chemical Line finite-capacity simulation. Other v017 process-time, recipe, batch, masking, painting and resource logic remains unchanged.

## Chemical Line timeline

Every simulated Chemical Line batch is split into:

`Loading → Process → optional Wait NDT → optional NDT → Unloading`

Rules:
- 6 physical Flybars (`FB1` … `FB6`).
- Maximum 3 `Process` segments may run concurrently across all Flybars.
- NDT applies to Recipe No. `001`, `009`, `016`, `025` by default.
- NDT duration = 300 minutes by default.
- NDT start times are separated by at least 90 minutes.
- Loading/Unloading use batch Qty + Surface thresholds and remain editable configuration.
- A Flybar remains physically occupied through Loading, Process, Wait NDT, NDT and Unloading.

The scheduler chooses the earliest feasible Flybar while respecting Job precedence, existing schedule occupancy, Flybar occupancy, shared Process concurrency, NDT-start spacing and changeover.

## Existing Main Planning rows

The source Scheduling sheet does not contain detailed Loading/NDT/Unloading timestamps. Existing Flybar schedule rows are therefore preserved as fixed blocks. Default policy `CONSERVATIVE_PROCESS_BLOCK` also counts those blocks against shared Chemical Process concurrency. This policy is configurable.

## Configuration

Settings are stored under `CAPACITY_MODEL`:
- `capacity.chemicalLineSegmented`
- `capacity.chemicalLineResourceCode`
- `capacity.chemicalLineProcessMaxConcurrent`
- `capacity.chemicalLineNdtRecipeNos`
- `capacity.chemicalLineNdtMinutes`
- `capacity.chemicalLineNdtStartSpacingMinutes`
- Loading / Unloading default, heavy and Qty/Surface threshold settings
- `capacity.chemicalLineExistingSchedulePolicy`

No production Batch/Schedule data is written by simulation.
