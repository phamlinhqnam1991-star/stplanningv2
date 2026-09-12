# ST Planning v026.8 — Predictive ERP Control

Current production baseline: **v026.8**.

Core release chain:
- ERP State Kernel: v026.1
- Commitment Ledger + Batch Lifecycle + Audit: v026.2
- Transactional Scheduling + Resource Reservation Ledger: v026.3
- Actual Execution + Intermediate/Final Inspection Actual: v026.4
- Canonical Output Ledger: v026.5
- ERP Control Tower + Exception Center: v026.6
- Proposed Plan → Revalidate → Accept: v026.7
- Predictive ETA P50/P80: v026.8

See `README_V0268_ERP_FULL.md` for architecture, migration order and invariants.

This release deliberately preserves the existing Planning Chain, READY/WAIT, Batch Key, Recipe, Process Time, Chemical Line, Flybar, NDT, Painting Cabin and finite-capacity rules. The new ERP layers wrap those engines with stronger state, transaction, actual, audit and forecast control instead of replacing them.
