# ST Planning Clean Rebuild v020.2 — Main Batch Prerequisite Gate

This incremental version keeps v020.1 route-aware Masking/Unmasking and adds an explicit gate for every downstream Main Operation batch.

## Locked logic

For a Main Operation batch, **all Jobs in the batch must be route-ready before the batch can start**. If only some Jobs require Masking/Unmasking before the Main Operation, the engine walks the consecutive route-required manual chain for each Job (for example `UNMSKG → MSKG-AND → BSAUNSLD`). Those manual steps are prerequisites for the whole downstream batch.

Example: a BSAUNSLD batch contains 10 Jobs. Three Jobs have `MSKG-AND` immediately before BSAUNSLD and their aggregated Masking load is 60 minutes. The BSAUNSLD batch cannot start until all three Masking Jobs are complete (and all other member Jobs are route-ready). The BSAUNSLD process duration remains separate from the Masking load; the gate controls the earliest start.

The finite-capacity result now exposes:
- Batch Ready Gate
- Mask/Unmask prerequisite batch count
- affected prerequisite Job count
- total Mask/Unmask prerequisite load minutes
- prerequisite completion time
- prerequisite batch / operation / Job details

If prerequisite manual batches run in parallel, the engine does **not** blindly add their elapsed clocks together. `Total Mask/Unmask load` is reported as workload, while the downstream batch start gate uses the **latest actual prerequisite completion** across its member Jobs.

## SQL
Run only after v020.1:
1. `db/35_main_batch_prerequisite_gate_v020_2.sql` (2 statements)
2. Optional: `db/verify_v020_2_batch_gate.sql` (6 read-only queries)

No table/schema migration is required.
