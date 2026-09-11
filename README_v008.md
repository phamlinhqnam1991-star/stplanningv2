# v008 — Authoritative Job Routing Source

This version adds the third controlled source approved for ST Planning:

- ST Planning workbook
  - `SirusClean_Painting_MasterList`
  - `Main Planning`
- All Open Jobs routing workbook
  - current source example: `VN_AllOpenJobs_SpiritSunshine_ALL(1).xlsx`
  - source worksheet: `Sheet1`
  - baseline used range observed: `A1:IN6500`
  - 6,499 Job rows
  - 248 source columns
  - complete route structure through `Op.1` … `Op.36`
  - paired `OpC.1` … `OpC.36`
  - paired `OpenNonConfOp.1` … `OpenNonConfOp.36`
  - paired `OprSeq.1` … `OprSeq.36`

## Architectural decision

All Open Jobs is now the authoritative source for the full operation sequence of each `JobNum`.

`SirusClean_Painting_MasterList` remains the ST Planning attribute source.
`Main Planning` remains the Scheduling source.

No Candidate, Batch creation, Recipe Rule, Planning Chain, ST-operation classification, or Auto Planning logic was added in v008.

## New database objects

Run these two migration files after the existing v007 schema:

```text
db/05_routing_core.sql       # 8 statements
db/06_routing_operations.sql # 7 statements
```

Do not run more than one file at a time in Aiven Query Editor.

New objects:

```text
route_import_runs
route_source_columns
raw_route_rows
job_routes
job_operation_sequence
v_active_job_routes
v_active_job_operation_sequence
```

## Import behavior

The All Open Jobs workbook is imported independently from the ST Planning workbook.
A new routing snapshot becomes active only after validation succeeds.
The previous active routing snapshot remains active until that point.

Strict validation includes:

- RAW source row count
- source column count
- one normalized Job route per source Job row
- nonblank and unique JobNum
- at least one operation per Job
- exactly one Op/OpC/OpenNonConfOp/OprSeq column for each slot 1..36

`NextOperation` coverage is measured and reported but not used to rewrite the source route.

## Normalized route grain

`job_routes`

```text
1 row = 1 source JobNum
```

`job_operation_sequence`

```text
1 row = 1 Job + 1 route position
```

Each operation record preserves:

- route position 1..36
- operation code
- OprSeq
- OpC completion state
- OpenNonConfOp value
- original Op.n source text
- original source column addresses

Completed source values such as:

```text
[HOTFORM] » 28» 2026-05-04
```

are normalized to operation code `HOTFORM` while the complete source text is retained.

## UI

New page:

```text
/routing
```

The route explorer shows the full route for each Job with direct source states:

- completed operations
- NextOperation
- remaining operations
- open nonconformance marker
- OprSeq

Planning Job numbers link directly to the matching Job Routing view.
