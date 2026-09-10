# ST Planning Clean Rebuild v004 — Worker Import Fix

This release fixes browser freezes during XLSX decoding.

## Root cause

`XLSX.read()` is synchronous. v003 yielded while extracting cells, but the initial workbook decode still ran on the browser UI thread. Large/complex workbooks could therefore trigger Chrome's "Page Unresponsive" dialog before cell parsing began.

## Fix

- Move `XLSX.read()` and all worksheet parsing to a dedicated Web Worker.
- Transfer the ArrayBuffer to the worker (no 6+ MB buffer copy).
- Keep sparse RAW cells and exact row/column positions.
- Keep the same validation rules and same Aiven import API.
- Add a `DECODING` progress stage.

## No changes

- Database schema
- SQL8 split files
- Aiven connection behavior
- RAW retention policy
- Planning/Scheduling normalization model
- Business logic

## Changed files

- `lib/excel-parser.ts`
- `lib/excel-parser.worker.ts` (new)
- `components/ImportConsole.tsx`
