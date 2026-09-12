# ST Planning Clean Rebuild — v020

v020 adds the Masking / Unmasking manpower + workstation finite-capacity scheduler on top of v019.

## What changed

- Detailed `MASKING`, `FMSKG_CM`, and `UNMASKING` scheduling.
- Uses existing Process Time `minutesPerPiece × Qty` as manual labor content.
- Configurable grouped-batch setup aggregation.
- Shared operator pools separate from physical workstation counts.
- Configurable automatic operator allocation and parallel efficiency.
- New timeline segments: Manual Setup, Manual Work, Manual Release.
- Operator-pool utilization is included in finite-capacity resource load.
- CFG-95 now edits `MANUAL_CAPACITY` rules.
- No changes to Chemical Line v018 or Painting v019 scheduling logic.

## Database upgrade from v019

Run only:

1. `db/33_masking_unmasking_segmented_v020.sql`
2. Optional verification: `db/verify_v020_manual_capacity.sql`

The migration is Aiven-safe and stays under the agreed maximum of 8 SQL statements per file.

## Baseline assumptions

The user authorized estimated operational defaults so target simulation can proceed before all shop standards are known. Defaults remain configuration data and are intended to be reviewed later. In particular, v020 seeds 4 masking stations / 4 masking operators and 3 unmasking stations / 3 unmasking operators, with a maximum of 2 operators assigned to one batch.
