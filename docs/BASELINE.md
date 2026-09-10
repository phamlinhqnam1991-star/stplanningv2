# Clean Rebuild v001 — Source Baseline

This project intentionally starts from zero. No previous ST Planning code, schema, UI, Candidate logic, Batch logic, Recipe rules, Planning Chain, or Auto Planning logic is reused.

## Approved source sheets

1. `SirusClean_Painting_MasterList`
   - baseline used range: `A1:ER4782`
   - baseline columns: 148
   - header row: 3
   - RAW import keeps every source row and every column in the current used range.

2. `Main Planning`
   - baseline used range: `A1:AL1274`
   - baseline columns: 38
   - header row: 2
   - RAW import keeps every source row and every column in the current used range.

Future files may contain more rows. The importer uses the current worksheet used range. It refuses files with fewer columns than the approved baseline, because that would make the approved normalization mapping incomplete.

## Data layers

- Bronze / RAW: exact source structure, headers and cell values/formulas/types.
- Silver / Operational: only approved core Planning and Scheduling fields.
- Gold / Business Logic: intentionally absent in v001.

## No business logic in v001

The following are not implemented:

- Candidate Jobs
- Batch creation
- Recipe suggestion/rules
- Planning Chain
- Auto Planning
- Scheduling constraints
- Operation mapping beyond the 36 source operation columns M:AV

They will be added only after explicit approval.
