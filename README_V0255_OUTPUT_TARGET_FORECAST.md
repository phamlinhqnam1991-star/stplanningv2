# ST Planning v025.5 — Real ST Output Target Forecast

Baseline: `STPlanningV2_v0254a_Inspection_OutputTarget_FULL.zip`.

## Scope approved

This release stays focused on **OUT-40 · ST Output Target**.

### 1. Real source loader

New file: `lib/st-output-target-data.ts`.

It reads the existing Clean Rebuild schema only:

- `v_active_planning_jobs`
- `raw_sheet_rows`
- `v_active_job_routes`
- `v_active_job_operation_sequence`
- `planning_batches`
- `planning_batch_jobs`
- `v_active_schedule_blocks`

No second Planning engine and no new database tables are introduced.

### 2. Unique Job output accounting

ST Output is credited once per current Job / route / Final-Gate occurrence.

Runtime output key:

```text
JobNum | RouteSignature | FinalGate#Occurrence
```

If the active Planning source accidentally contains the same Job more than once, the loader keeps one deterministic current row and emits:

```text
DUPLICATE_JOB_ROWS_SUPPRESSED:<count>
```

This prevents dm2 from being multiplied by duplicate source rows or by multiple Batch operations.

### 3. Final Gate resolver

Default Final Inspection gates:

```text
FINSST
CFINM-VN
```

`stOutput.endpointOperationCode` remains supported for backward compatibility.

Optional runtime setting supported without a migration:

```text
stOutput.finalInspectionOperationCodes
```

The resolver selects the first applicable Final Gate in the **current physical route suffix**, so a previous Final Gate in an earlier/rework suffix is not counted again.

### 4. Intermediate Inspection

The v025.4a behavior remains unchanged:

- Inspection is visible in the physical route.
- It is a dependency/time step for Final ETA.
- It does not create a Batch or Recipe.
- It does not add dm2.
- Missing inspection/process time remains `TIME UNKNOWN`; no duration is invented.

### 5. Output buckets

Each Job is classified as one of:

```text
ALREADY_REACHED_FINAL
EXISTING_PLAN_FORECAST
PROPOSED_ADDITIONAL
LATE
BLOCKED
TIME_UNKNOWN
NOT_APPLICABLE
```

Target summary:

```text
Already Reached Final
+ Existing Plan Forecast
+ Proposed Additional selected to close target
= Total Forecast
```

`PROPOSED_ADDITIONAL` rows are candidates requiring at least one new Planning Batch. Only Jobs actually selected by the existing recommendation logic are credited to Proposed Additional in the target total.

### 6. OUT-40 UI

OUT-40 now shows:

- Final Gates (`FINSST / CFINM-VN`)
- Already Reached Final
- Existing Plan Forecast
- Proposed Additional
- Total Forecast
- Late / Blocked
- Time Unknown
- per-Job Output Bucket
- Final Gate per Job
- Intermediate Inspection information from v025.4a

### 7. Compatibility

Not changed:

- READY / WAIT
- Planning Chain
- Batch Key / Recipe
- Process Time rules
- Scheduling Board
- v024 finite-capacity scheduler
- v024 What-if Optimizer
- Accept / Revalidate flow (still not implemented)

## SQL

**No SQL migration in v025.5.**

## Changed files

```text
app/st-output/page.tsx
components/StOutputWorkbench.tsx
lib/st-output-engine.ts
lib/st-output-model.ts
lib/st-output-target-data.ts   # new
README_V0255_OUTPUT_TARGET_FORECAST.md
```

## Verification performed

The changed TypeScript/TSX files were parsed/transpiled with TypeScript in isolated-module mode with no syntax diagnostics.

A full `next build` could not be completed in the packaging environment because dependency installation timed out. The package therefore does not claim a full Next.js production build pass.
