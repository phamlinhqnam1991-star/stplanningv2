# ST Planning v026.8 — ERP Deep Control

Baseline: **v026.2 Commitment Ledger**. This release completes the agreed ERP roadmap from **v026.3 → v026.8** without rewriting READY/WAIT, Batch Key, Recipe, Chemical/Flybar/NDT/Cabin finite-capacity logic.

## v026.3 — Transactional Scheduling + Resource Reservation Ledger
- `erp_schedule_reservations` is the canonical writable ERP schedule reservation ledger.
- Save/cancel uses PostgreSQL transactions, Batch version checks, advisory locks and exact-resource overlap revalidation.
- Legacy imported schedule remains read-only and is still visible as baseline evidence.
- SCH-20 includes a transactional reservation panel.

## v026.4 — Actual Execution + Intermediate Inspection Actual
- Job/Main actual execution is recorded by physical route occurrence.
- Intermediate and Final Inspection actual status is occurrence-aware.
- Batch starts/completes from Job execution rollup; completed Batch closes active reservation and commitment state.
- OUT-40 consumes actual execution / inspection before planned forecast.

## v026.5 — Canonical Output Ledger
- One OutputKey = Job + route signature + applicable Final Gate occurrence.
- OUT-40, finite-capacity and What-if all use the same canonical ledger types and unique Job accounting.
- Capacity results preserve the original OutputKey / Final Gate occurrence instead of creating a second capacity-only identity.

## v026.6 — ERP Control Tower + Exception Center
- SYS-00 is exception-first: unscheduled commitments, HOLD, failed inspection, duplicate active source rows, late/blocked/time-unknown output and P80 cutoff risk.
- KPI reconciliation comes from canonical Output Ledger.

## v026.7 — Proposed Plan → Revalidate → Accept
- OUT-45 persists the optimizer scenario as a frozen Proposed Plan.
- Revalidation checks live Batch version/status, existing reservation changes, Job commitment, route occurrence, Main dependency, Recipe, execution and exact resource/time overlap.
- Supports **Accept Selected** and **Accept All**.
- Acceptance is atomic for the selected scope and never silently reschedules.
- New proposal Batch creation and scheduling use existing Commitment + Reservation services.

## v026.8 — Predictive ETA P50/P80
- Uses actual Job execution and Inspection history.
- Historical P50 can be blended with configured Process Time; P80 is retained as risk ETA.
- OUT-40 shows P50/P80, sample count, confidence and P80 cutoff risk.
- Actual completion and accepted exact schedule remain stronger evidence than statistical ETA.
- Control Tower surfaces `PREDICTIVE_P80_CUTOFF_RISK`.

## Database upgrade order
Run only after v026.2 schema is already applied:

1. `db/42_transactional_scheduling_v026_3.sql`
2. `db/43_execution_inspection_v026_4.sql`
3. Ensure stabilized proposal base `db/40_production_snapshot_proposed_plan_v025.sql` exists if proposal tables were never created.
4. `db/44_proposed_plan_accept_v026_7.sql`
5. `db/45_predictive_eta_v026_8.sql`
6. Optional read-only verification: `db/verify_v026_8_erp.sql`

Every new migration file contains **10 or fewer SQL statements**.

## Canonical ERP flow
`Current Job Read Model → ERP State Kernel → Commitment Ledger → Resource Reservation Ledger → Execution/Inspection Actual → Remaining Physical Route → Final Gate Projection → Canonical Output Ledger → Control Tower / What-if / Proposed Plan → Predictive ETA`

## Important invariants
- No dm² double count per Job/Final Gate occurrence.
- Intermediate Inspection affects dependency/ETA, never adds output dm².
- Existing accepted reservations are not silently moved.
- Proposal acceptance revalidates live state and fails on conflict.
- Actual facts override forecast facts.
- Predictive ETA never overwrites actual start/end or an accepted exact reservation.
