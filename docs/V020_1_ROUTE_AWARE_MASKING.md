# v020.1 — Route-aware Masking / Unmasking

Masking and Unmasking are **never inserted automatically around a Main Operation**.
They exist only when the actual Job full route contains the corresponding source operation.

For every Job the scheduler keeps the exact order from `job_operation_sequence` / `Op.1..Op.36`:

`NextOperation -> remaining route step 1 -> step 2 -> ... -> FINSST`

Examples that are both valid because the Job route decides the order:

- `MSKG-SP -> MANUALSP -> UNMSKG-S -> PRIMER -> FINSST`
- `PRIMER -> UNMSKG -> MSKG-TC -> TOPCOAT1 -> FINSST`

A manual route step gets its own predecessor/successor dependency. If a Job contains the same masking operation more than once, those occurrences cannot collapse into the same proposed batch node.

## Proposed batch grouping

v020.1 adds `capacity.manualRouteAwareGrouping=true` and defaults `capacity.manualRouteContextMode=PREV_NEXT_MAIN`.

Example grouping context:

`PRIMER > UNMSKG > TOPCOAT1`

is not mixed with:

`MANUALSP > UNMSKG > PRIMER`

unless the configuration is intentionally changed.

## Existing real batches

New batches save `routePosition` in `candidate_snapshot`. When ST Output replays existing batches it matches:

1. exact route position,
2. exact source operation,
3. Main Operation fallback for legacy batches created before v020.1.

This keeps older data compatible while making new batches route-safe.
