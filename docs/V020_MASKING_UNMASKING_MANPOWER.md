# v020 — Masking / Unmasking Manpower + Workstation Scheduler

v020 refines the finite-capacity target simulation for `MASKING`, `FMSKG_CM` and `UNMASKING` without changing the previously approved Chemical Line or Painting logic.

## Time model

Work content comes from the existing Process Time engine. For masking/unmasking rules with `minutesPerPiece`, v020 reconstructs manual labor content as:

`Labor minutes = standard minutes/pc × Qty`

For grouped batches the labor minutes of all member jobs are added. Setup is configurable (`MAX_MEMBER`, `SUM_MEMBER`, or `FIXED`). The default is `MAX_MEMBER`, so a compatible batch pays one governing setup instead of blindly summing every member setup.

When more than one operator is assigned:

`Effective operators = 1 + (operators - 1) × parallelEfficiency`

`Manual work elapsed = labor minutes / effective operators`

Default parallel efficiency is 0.85. This avoids assuming perfect 2× productivity from two people.

## Finite capacity

A manual batch must simultaneously obtain:

- one physical workstation (`MSK1..MSK4` or `UMS1..UMS3`), and
- enough units from the shared operator pool (`MASKING_LABOR` or `UNMASKING_LABOR`).

The detailed sequence is:

`Manual Setup → Manual Work → Manual Release`

The workstation stays occupied through all three phases. Setup and Release consume one operator; Manual Work consumes the automatically selected operator count.

Baseline operator allocation is editable. v020 defaults to at most two operators per batch. A second operator is considered when one-operator work content exceeds the configured threshold (240 labor-minutes for normal masking, 180 for unmasking and selected complex masking operations).

## Baseline capacities

- Masking: 4 workstations, 4-operator shared pool.
- Unmasking: 3 workstations, 3-operator shared pool.
- Existing v017 Batch limits remain authoritative: `MASK_BATCH_CAP` and `UNMASK_BATCH_CAP`.

All values are configuration data, not hard-coded production facts. They are marked as estimated/user-authorized baseline assumptions and can be revised from CFG-95.

## Target impact

A job can no longer pass a masking step merely because a workstation is free. The simulator also verifies operator availability. If four masking stations are free but all four masking operators are already allocated, another masking batch waits. The resulting delay flows through the remaining route and can move FINSST beyond the target cutoff.
