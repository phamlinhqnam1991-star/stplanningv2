# ST Planning Clean Rebuild v003 — Import Performance Fix

This revision changes only client-side workbook parsing and import feedback.

## Problem fixed
The 148-column Planning source could create a long synchronous browser task. The old parser traversed every row × every column, encoded an A1 address for every cell, and materialized blank cells as JavaScript objects. On a large workbook Chrome could show **Page Unresponsive** immediately after file selection.

## Changes
- Parse only the 2 controlled worksheets instead of the entire workbook.
- Iterate only cells that actually exist in each worksheet.
- Keep every source row and every source column, while blank cells are represented implicitly.
- Preserve actual cell values, formula text and cell type when present.
- Yield control back to the browser every 5,000 source cells.
- Show visible parsing progress before the Aiven upload starts.
- Avoid an unnecessary ArrayBuffer copy during SHA-256 calculation.

## Data fidelity
No source row or source column is dropped. `source_columns` retains the complete column structure and `raw_sheet_rows` retains all source row numbers. Missing keys inside one RAW row mean an Excel blank cell at that source position.

## Not changed
- Database schema.
- SQL8 files.
- Controlled sheet names.
- Normalized Planning and Scheduling mappings.
- Chunk API / Aiven behavior.
- Candidate / Batch / Recipe / Auto Planning logic (still not present).
