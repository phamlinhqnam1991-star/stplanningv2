# ST Output Target Engine — v015

## Purpose

The daily ST Output target is measured at the configured Final ST operation. The v015 seed is `FINSST` with a default cutoff of `15:00`.

A Job contributes to the target when the engine can establish that the Job reached FINSST before the cutoff. The calculation starts at the source `NextOperation`; completed route operations before it are not re-counted.

## Forward calculation

For every active Job:

`NextOperation → remaining full route → FINSST`

For each remaining operation before FINSST the engine resolves:

- Operation Code and OprSeq
- Main Operation / ST Group / Area / Planner
- Recipe No. / Recipe Name
- Process Time
- existing Planning Batch
- existing Scheduling block when the Batch No. is found on the active Scheduling source
- READY / WAIT / BATCHED / SCHEDULED state

The earliest FINSST arrival is calculated by walking forward from the active route snapshot. A configured schedule is honored when it is compatible with predecessor completion. Without a schedule the calculation is an optimistic process-time forecast and is not classified as COMMITTED.

## Backward calculation

The same route is calculated backward from the cutoff:

`FINSST cutoff → latest predecessor finish → latest predecessor start → ... → current operation`

Each step therefore exposes `Latest Start`, `Latest Finish` and Slack. The first unplanned Planning-enabled step becomes the Critical Action.

## Statuses

- `OUTPUT` — already reached FINSST before cutoff using source evidence.
- `COMMITTED` — remaining Planning steps are scheduled and ETA reaches FINSST before cutoff.
- `PLANNED` — all remaining Planning steps are batched; schedule is incomplete, but process-time ETA is before cutoff.
- `NEED_PLAN` — process-time ETA can still reach FINSST before cutoff and at least one Planning step is not batched.
- `AT_RISK` — calculated earliest FINSST arrival is after cutoff.
- `REVIEW` — route/time evidence is insufficient for a safe feasibility conclusion.
- `OUTPUT_OTHER_DAY` — FINSST evidence belongs to another target date.
- `NOT_APPLICABLE` — configured Final ST operation is not present in the Job route.

## Target recommendation

The target gap is calculated as:

`Target - Actual Output - Committed - Planned`

Review-free `NEED_PLAN` Jobs are selected until the gap is covered. Default order is:

1. earliest projected FINSST arrival
2. shortest remaining process time
3. larger Surface dm²

The selected Jobs are then expanded backward into action groups by:

`Schedule Area + Main Operation + Recipe`

Each action group shows required Job count, Surface dm², process load and the earliest `Must Start By` time among those Jobs.

## Important boundary

v015 is the target feasibility / backward-requirement engine. Resource finite-capacity optimization and automatic placement of proposed batches into lanes is not yet performed. Existing schedule blocks are honored; unscheduled steps use process-time feasibility and remain PLANNED/NEED_PLAN rather than COMMITTED.
