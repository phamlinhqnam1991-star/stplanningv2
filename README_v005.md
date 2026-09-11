# v005 — Native ZIP/XML Excel Import

Fixes the import stall at 10% caused by `XLSX.read()` spending a long time decoding the full workbook package.

## What changed

Only the browser-side Excel parser was changed:

- `lib/excel-parser.worker.ts`
  - no longer uses `XLSX.read()`;
  - reads the XLSX ZIP directory directly;
  - uses the browser's native `DecompressionStream` to unpack only:
    - workbook metadata,
    - relationships,
    - shared strings,
    - `SirusClean_Painting_MasterList`,
    - `Main Planning`;
  - parses sparse worksheet XML directly;
  - preserves complete used-range row/column positions;
  - skips unrelated worksheets, styles, drawings, formulas from unrelated sheets, etc.
- `lib/excel-parser.ts`
  - richer progress stages;
  - 120-second watchdog so an actual parser failure does not remain stuck forever.
- `components/ImportConsole.tsx`
  - clearer progress labels.

## Not changed

- PostgreSQL/Aiven schema
- SQL split files
- RAW retention design
- Planning normalization
- Scheduling normalization
- import API/chunk size
- Candidate/Batch/Recipe/Auto Planning logic (still not implemented)
