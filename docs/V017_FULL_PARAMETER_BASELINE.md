# v017 — Full Parameter Baseline

## Purpose
v017 makes the ST Output / finite-capacity simulation usable end-to-end even when some source rows do not contain a complete Recipe duration or operation standard. The user explicitly approved seeding all missing timing/capacity assumptions so the model can calculate total remaining time from `NextOperation` to `FINSST`.

## Resolution order
For every remaining route operation before FINSST:

1. Operation-specific source standard, when available.
2. Recipe Master duration, when the selected Recipe has a source duration.
3. Configured operation/Main Operation baseline.
4. If none resolves, the ST Output model blocks target confirmation instead of silently using zero.

All v017 assumptions are configuration seeds and can be corrected later without code changes.

## Masking / Unmasking
The workbook section headed `MASKING / MARKING PROCESS TIME` contains numeric standards without an explicit unit. v017 interprets those values as **minutes per piece**, based on the observed part-level standards and the user's approval to set a working baseline. Job duration is:

`setup minutes + standard minutes/pc × Job Qty / operators`

The default operator count is 1. Masking has 4 parallel workstations; Unmasking has 3. Operation-specific source values take priority; uncommon masking route codes receive editable conservative fallback standards.

## Sirius Cleaning
The source explicitly supplies process time in minutes for 10 / 20 / 50 pcs per 2 operators plus Batch Size. v017 enables this rule and schedules multiple cycles when Job Qty exceeds the configured source batch size.

## Blasting
The source explicitly supplies `Blasting time (minute)` and `Batch size`. v017 multiplies source minutes by `ceil(Job Qty / Batch Size)`.

## Paint
Primer / Topcoat / Anti-Abrasion / Varnish / Powder use configurable Qty/Surface tiers. The seed preserves the previously agreed examples, including 7h for heavy surface and 8h for very high Primer/Anti-Abrasion Qty. Recipe metadata remains available for batch grouping.

## Chemical Line total time
When Recipe Master duration exists, v017 models one conservative Flybar occupancy block as:

`Loading + Recipe Process + optional NDT + Unloading`

Seed handling time is 30 min Loading + 30 min Unloading, or 45 min each for high Qty / high Surface. Preclean recipes `001, 009, 016, 025` add the approved 5h NDT duration.

This is a total-time approximation for target simulation. It does not yet split the finite-capacity block into independent Loading / Process / NDT / Unloading sub-segments.

## Batch capacity
Operation-specific Batch Rules now define Max Jobs / Qty / Surface and process-time aggregation. Manual Masking / Unmasking / Inspection-style work uses `SUM`; most process-batch equipment uses `MAX`.

## Capacity
v017 keeps the approved 6 Flybars with max 3 concurrent process blocks and 4 paint cabins, and adds editable baseline finite resources for Masking, Unmasking, NDT, ST Inspection and Rework. Changeover times are also seeded.

## Recipe gaps
No fake Recipe No. is invented. Recipe identifiers observed in source are accepted as operationally usable even if Recipe Master name/duration is incomplete. Duplicate Recipe Name lookup is resolved deterministically to the lowest Recipe No. for simulation, while candidates remain visible for later correction.

## Target effect
The ST Output engine can now calculate a non-zero duration for essentially every mapped route step from current `NextOperation` to `FINSST`, and the finite-capacity scheduler can account for the newly configured manual/support resources.
