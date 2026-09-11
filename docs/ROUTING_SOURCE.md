# ROUTE-05 — Job Routing Source

## Source authority

For full Job operation order, use the All Open Jobs source by `JobNum`.
Do not infer the complete route from ST Planning operation columns.

## Source fields retained in the normalized route header

- Program
- EpicorPart
- RevisionNum
- JobNum
- ProdQty
- LastLaborOp
- LastLaborOprSeq
- NextOperation
- LastCompleteOprSeq
- JobComplete

## Full operation sequence

For each slot `n = 1..36`:

```text
Op.n
OpC.n
OpenNonConfOp.n
OprSeq.n
```

The importer resolves these by source header name rather than assuming one contiguous physical column block.
This is required because the report groups the route columns into several Excel column regions.

## Source preservation

The complete source row is also stored in `raw_route_rows.row_data` keyed by Excel column address.
Normalization never replaces the RAW evidence.

## Not implemented yet

The routing source is not yet used to decide:

- which operations are ST
- Next Main Planning Operation
- Candidate eligibility
- Planning Chain
- Batch creation
- recipe selection
- Auto Planning

Those rules require explicit approval before implementation.
