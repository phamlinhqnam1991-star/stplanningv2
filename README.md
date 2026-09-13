# ST Planning v026.8a — ERP Hardening

Current production baseline: **v026.8a**.

Architecture: ERP State Kernel + Commitment Ledger + Transactional Scheduling + Actual Execution / Inspection + Canonical Output Ledger + Proposal Acceptance + Predictive ETA P50/P80.

Release lineage:
- ERP State Kernel / occurrence-aware route: v026.1
- Commitment Ledger / lifecycle / audit: v026.2
- Transactional Scheduling / Resource Reservation Ledger: v026.3
- Actual Execution / Intermediate Inspection actual: v026.4
- Canonical Output Ledger: v026.5
- ERP Control Tower / Exception Center: v026.6
- Proposed Plan → Revalidate → Accept: v026.7
- Predictive ETA P50/P80: v026.8
- Production hardening / plant-time / imported-schedule collision protection: v026.8a

## v026.8a hardening scope

This checkpoint does **not** change the approved Planning Chain, READY/WAIT, Batch Key, Recipe, Chemical/Flybar/NDT/Cabin finite-capacity, or ST Output accounting rules. It hardens the existing ERP flow for production use:

- ERP Scheduling also reserves against the current imported production schedule, not only ERP-created reservations.
- Schedule date and Batch numbering use configured plant wall-clock time instead of UTC date boundaries.
- Manual scheduling validates live Capacity Resource instance/base mapping and calendar windows.
- Proposed Plan revalidation checks imported + ERP reservations and the live Capacity Model before Accept.
- Proposed finite-capacity batches preserve exact Job route-occurrence identity through Accept, including repeated/rework operations.
- Proposed Plan Accept uses the canonical finite-resource identity and plant-date Batch numbering.
- Manual Batch status changes cannot bypass Scheduling or Execution ledgers; cancellation/completion closes reservations consistently, and traceable Batch history cannot be deleted after actual execution exists.
- Execution history is terminal-safe: completed/cancelled actuals cannot be silently reopened, HOLD/RESET require valid running state, and actual timestamps are validated.
- ERP Control Tower counts unscheduled batches exactly, normalizes duplicate Job detection, respects configured Output scan limits, and shows newest same-severity exceptions first.

No new database migration is required for **v026.8a**. Keep migrations 42–45 from v026.8.
