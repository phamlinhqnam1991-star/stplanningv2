# ST Planning v026.8a — ERP Production Hardening

Baseline: **v026.8 ERP FULL**. This is a stabilization checkpoint only; no approved business rule is replaced.

## Hardening applied

1. **Plant wall-clock authority**
   - Added shared plant-time helpers.
   - Batch numbering and transactional schedule dates no longer depend on UTC date boundaries.
   - SCH-20 `datetime-local` inputs are interpreted in configured plant wall time rather than the browser machine timezone.
   - Uses `stOutput.timezoneOffsetMinutes` as the plant offset source.

2. **Scheduling collision protection**
   - ERP reservations now check both `erp_schedule_reservations` and the current imported schedule views.
   - Manual scheduling validates resource instance, base resource and configured resource calendar window before opening the write transaction.

3. **Proposed Plan acceptance safety**
   - Revalidation checks the live Capacity Model and both imported/ERP occupancy.
   - Final-output revalidation reconstructs cutoff in plant wall time.
   - Accepted resources use `resourceType=FINITE_RESOURCE`; base resource is derived from the live Capacity Model.
   - Capacity proposals now carry exact Job route-occurrence identity so repeated/rework Main Operations are accepted against the correct occurrence.
   - Proposal/snapshot daily numbering advances from the highest existing suffix, avoiding duplicate numbers when rows have gaps.
   - Accept continues to revalidate under transaction and never silently moves a conflicting slot.

4. **Batch lifecycle integrity**
   - `SCHEDULED` must come through SCH-20 reservation.
   - `STARTED` must come through EXEC-25 actual execution.
   - `COMPLETED` requires all Job occurrences DONE.
   - Cancellation/completion closes active ERP reservations in the same transaction.
   - Batch deletion is rejected while an ACTIVE reservation or actual execution history exists, preserving ERP traceability.

5. **Execution actual integrity**
   - Invalid actual timestamps are rejected before SQL casting.
   - CANCELLED/COMPLETED history is terminal-safe.
   - HOLD requires an IN_PROGRESS occurrence.
   - RESET only allows IN_PROGRESS/HOLD and never reopens DONE actual history.

6. **ERP Control Tower correctness**
   - Exact unscheduled Batch KPI independent of the 200-row exception display limit.
   - Duplicate source Jobs normalized by trimmed uppercase Job number.
   - Output scan uses configured `maxScanJobs` instead of a hard-coded 3000 cap.
   - Within the same severity, newest dated exceptions appear first.

## Database

No new SQL migration for v026.8a. Continue using the v026.8 schema/migrations through `45_predictive_eta_v026_8.sql`.

## Verification

- Core `lib/**/*.ts` strict TypeScript verification: PASS in the packaging environment.
- TS/TSX syntax transpile verification is run before packaging.
- Full Next.js production build still requires the project dependencies to be installed in the target environment.
