# ST Planning v026.2 — Commitment Ledger + Lifecycle + Audit

Baseline: `STPlanningV2_v0261_ERP_State_Kernel_FULL.zip`.

This release implements the next agreed ERP-deep layer without rewriting finite-capacity scheduling, Recipe, Chemical/Flybar/NDT/Cabin logic, ST Output accounting or What-if.

## What changed

### 1. Canonical active commitment ledger

New table `erp_job_commitments` records the actual Batch commitment of one Job to one Main Operation. The record also stores the physical route occurrence used when the Batch was created.

New Batch creation now runs inside the existing PostgreSQL transaction and:

1. locks every selected `Job + Main Operation` with `pg_advisory_xact_lock`;
2. rechecks active commitments after obtaining the lock;
3. creates Batch + Batch Jobs;
4. creates commitment rows;
5. writes the audit event;
6. commits everything together.

This closes the race where two planners select the same Candidate at nearly the same time.

### 2. Occurrence trace on Batch Job

`planning_batch_jobs` now keeps:

- `route_occurrence_key`;
- `route_position`;
- `main_operation_code`.

Example: `PRIMER#2` is distinguishable from `PRIMER#1` in a rework route.

### 3. Batch lifecycle graph

Seeded status transitions are now explicit:

- DRAFT → READY / CANCELLED
- READY → DRAFT / SCHEDULED / CANCELLED
- SCHEDULED → READY / STARTED / CANCELLED
- STARTED → SCHEDULED / COMPLETED / CANCELLED
- COMPLETED → terminal
- CANCELLED → terminal

CFG-93 Status editor can configure:

- Allowed To;
- Blocks Candidate / Active Commitment;
- Allow Delete;
- Terminal Status;
- Color.

Custom legacy statuses without `allowedTo` remain backward-compatible.

### 4. Optimistic concurrency

`planning_batches.version` is incremented on lifecycle changes. The Batch UI sends `expectedVersion` on status/delete actions.

If another planner already changed the Batch, the server returns HTTP 409 with `STALE_BATCH_VERSION`. The UI refreshes instead of silently overwriting the newer state.

### 5. Append-only ERP audit

New table `erp_audit_events` records Batch creation, lifecycle transitions and Draft deletion. Because the app intentionally has no login, actor defaults to `PUBLIC_UI`; an integration can later supply `x-erp-actor` without changing the ledger design.

BAT-30 now shows:

- Batch version;
- active/total commitments;
- allowed lifecycle transitions only;
- latest audit event per Batch;
- recent append-only Batch audit events.

### 6. Candidate blocking is Main-aware

Candidate conflict checking is now `Job + Main Operation` instead of blocking the Job merely because it appears in any open Batch. This keeps active commitments precise and is compatible with a Job progressing to a later Main after its physical route advances.

The legacy `planning_batch_jobs + planning_batches` check remains in the read path during upgrade so pre-v026.2 Batches still block correctly.

## Database migration

Run only:

`db/41_commitment_lifecycle_audit_v026_2.sql`

The migration contains **exactly 10 SQL statements**. It also backfills commitments from existing Batches.

Do not rerun migrations 01–40 just for v026.2.

## Preserved logic

Unchanged:

- ERP State Kernel v026.1 physical anchor logic;
- READY/WAIT route semantics outside Batch commitment validation;
- Batch Key / Recipe / Process Time rules;
- finite capacity scheduler;
- Chemical Line Loading/Process/NDT/Unloading;
- Flybar occupancy and Chemical concurrency;
- CAB1–CAB4 painting rules;
- masking/unmasking manpower;
- ST Output Target / Final Gate / Inspection logic;
- v024 What-if optimizer.
