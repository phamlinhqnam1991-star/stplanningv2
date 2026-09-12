# ST Planning v026.1 — ERP State Kernel + Stabilization

Baseline: `STPlanningV2_v0255_OutputTarget_FULL.zip`

## Scope implemented

This release implements the agreed v026.0 + v026.1 foundation only. It does not rewrite finite-capacity scheduling, Batch, Recipe, READY/WAIT, or What-if.

### 1. Canonical Current Job Read Model

Added `lib/current-job-read-model.ts`.

All upgraded ERP readers now use one deterministic rule:

- one current Planning row per Job Number;
- one current Routing row per Job Number;
- newest `source_row_no`, then newest `id` wins;
- duplicate active rows are counted and can be surfaced as a data-quality warning.

Integrated into:

- Planning API;
- Routing API;
- Batch Candidate loader;
- ST Output Target source loader.

### 2. Occurrence-aware physical route resolver

`lib/route-analysis.ts` now resolves current physical position using this precedence:

1. `LastOperation + NextOperation` pair when available;
2. `LastLaborOp + NextOperation` pair;
3. `LastLaborSequence` + NextOperation;
4. NextOperation occurrence;
5. first incomplete operation fallback.

Repeated/rework operations receive occurrence identity, for example:

- `PRIMER#1`
- `TOPCOAT#1`
- `PRIMER#2`
- `TOPCOAT#2`

Route result now includes:

- `currentOccurrence`
- `currentOccurrenceKey`
- `anchorConfidence`
- `anchorWarnings`
- richer `positionSource`

### 3. ERP State Kernel

Added `lib/erp-state-kernel.ts`.

The kernel centralizes:

`Job -> Physical Position -> Current Occurrence -> Remaining Route -> Final Gate -> Explainability`

Default Final Gates remain:

- `FINSST`
- `CFINM-VN`

It is now used by:

- Planning;
- Routing;
- Batch Candidate loading;
- ST Output Target forecast.

### 4. Explainability in UI

Planning Route Position now exposes:

- occurrence key;
- anchor source;
- confidence;
- warnings in tooltip.

Routing now shows:

- ERP State Kernel v026.1;
- occurrence identity;
- anchor confidence;
- Final Gate state and occurrence;
- source duplicate warning when the canonical read model suppresses duplicate route rows.

### 5. Stabilization fixes

- Removed nested `AppShell` from CFG-90 / CFG-91 / CFG-92 because Root Layout already owns the shell.
- Centralized displayed product version in `lib/product-meta.ts`.
- Sidebar no longer says `Clean Rebuild v024`; current label is `v026.1 · ERP State Kernel`.

### 6. DB40 clean-install correction

`db/40_production_snapshot_proposed_plan_v025.sql` is corrected to reference the actual runtime schema:

- `planning_batches` — UUID Batch IDs
- `schedule_blocks` — bigint Schedule IDs
- `planning_job_operations` — bigint Operation IDs

The file contains exactly **10 SQL statements**, with no hidden `DO/EXECUTE` block.

**Existing database note:** v026.1 itself requires no new DB objects. If your database already has the v025 proposal tables from an earlier manual/compat migration, do not rerun DB40 only for v026.1. DB40 is corrected mainly for clean installs or environments where the earlier migration failed before those proposal tables were created.

## Preserved behavior

No intentional change to:

- READY / WAIT logic;
- Main Operation mapping;
- Recipe resolution;
- Batch Key rules;
- Batch capacity rules;
- Chemical Loading / Process / NDT / Unloading;
- Flybar occupancy;
- CAB1–CAB4 logic;
- Masking / Unmasking manpower;
- finite-capacity engine;
- What-if optimizer;
- ST Output dm² unique accounting.

## Verification completed

- TypeScript/TSX syntax transpile check: PASS for every changed TS/TSX file.
- ERP occurrence smoke test: PASS.
- Rework test route:
  `BSAUNSLD -> PRIMER -> TOPCOAT -> FINSST -> RWK -> PRIMER -> TOPCOAT -> CFINM-VN`
  with `LastLaborOp=RWK`, `NextOperation=PRIMER` resolves to `PRIMER#2`, HIGH confidence, and next Final Gate `CFINM-VN`.
- DB40 statement count: exactly 10.

Full `npm run build` was not completed in the packaging container because dependency installation timed out. Run `npm run build` after replacing the files in your normal project environment.
