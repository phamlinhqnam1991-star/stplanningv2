# ST Planning v025.4 — Checkpoint package

Đây là gói **changed/additive files** chốt tại mốc v025.4. Gói này không phải full source ZIP và không thay thế baseline production hiện tại.

## Phạm vi đã chốt trong package

1. Production State Snapshot cho toàn bộ Job đã plan nhưng chưa qua Final Inspection.
2. Final Gate resolver hỗ trợ `FINSST`, `CFINM-VN`, duplicate/rework occurrence và physical anchor fallback.
3. Remaining Route resolver giữ `PLANNED-UNSCHEDULED` là existing commitment và chặn `NON_CONTIGUOUS_EXISTING_PLAN`.
4. Output Ledger tính dm² **một lần ở cấp Job / Final Gate occurrence**, không cộng theo Batch/Operation.
5. Forecast tách:
   - Already Reached Final
   - Existing Scheduled Forecast
   - Existing Unscheduled Recovery
   - Proposed Additional
6. Combined Timeline model + React renderer cho Existing / Proposed / Outage / Final Gate trên cùng timeline.
7. Chemical Line hỗ trợ Loading → Process → NDT → Unloading và tách Flybar occupancy / Chemical Process concurrency.
8. Persistence tables cho Production Snapshot + Proposed Plan + Proposed Batch.

## Chưa nằm trong checkpoint này

- Accept Selected / Accept All.
- Revalidate transaction.
- Conflict-to-real-Batch conversion.
- Auto-reschedule (không được phép theo logic đã chốt).

Những phần trên là bước kế tiếp, chưa tự ý thêm vào checkpoint này.

## File mới

```text
src/lib/st-output-v025/types.ts
src/lib/st-output-v025/final-gate-resolver.ts
src/lib/st-output-v025/production-state-snapshot.ts
src/lib/st-output-v025/output-ledger.ts
src/lib/st-output-v025/what-if-forecast.ts
src/lib/st-output-v025/combined-timeline.ts
src/lib/st-output-v025/proposal-persistence.ts
src/components/st-output/combined-production-timeline.tsx
db/40_production_snapshot_proposed_plan_v025.sql
```

## Nguyên tắc tích hợp

Gói này được viết theo hướng **adapter**, không tạo planning engine thứ hai.

```text
REAL STATE
→ Current route/planning/batch/schedule services
→ Production State Snapshot
→ Existing reservations
→ Existing v024 What-if scheduler
→ Final projection
→ Output Ledger
→ Combined Timeline
→ Proposed Plan persistence
```

### Không được thay đổi

- READY / WAIT resolver hiện tại.
- Planning Chain creation/rebuild hiện tại.
- Batch Key / Recipe resolver hiện tại.
- Process Time resolver hiện tại.
- Existing Batch/Schedule records.
- Scheduling Board production hiện tại.

## Database

Nếu baseline đã ở v024 và migration trước đó là `39_what_if_optimizer_v024.sql`, chỉ chạy:

```text
db/40_production_snapshot_proposed_plan_v025.sql
```

Migration này chỉ thêm bảng mới. Không rerun migration cũ.

> Lưu ý: tên cột/FK của baseline thực tế phải được đối chiếu khi merge vào ZIP source mới nhất. Checkpoint này dùng các table source-of-truth đã chốt: `planning_job_operation`, `planning_batch`, `planning_batch_job`, `planning_schedule`.

## Final Gate

Default:

```ts
["FINSST", "CFINM-VN"]
```

Khi merge vào baseline chính thức nên đưa danh sách này về config runtime (`capacity.finalInspectionOperationCodes`) thay vì hard-code ở UI.

## Output dm²

Không dùng `sum(batch.surface_dm2)` làm Target Output.

Output key:

```text
jobNum | routeSignature | finalGate#occurrence
```

Một Job đi qua nhiều Batch vẫn chỉ đóng góp output một lần cho current Final Gate occurrence.

## Existing Unscheduled

Nếu Main đã có Batch nhưng chưa Schedule:

```text
sourceMode = EXISTING_UNSCHEDULED
```

Optimizer chỉ đề xuất resource/time cho Batch đó. Khi triển khai Accept ở bước sau, case này chỉ được tạo `planning_schedule`; không được tạo `planning_batch` trùng.

## Combined Timeline

Renderer hỗ trợ các state:

```text
DONE
IN_PROGRESS
EXISTING_SCHEDULED
EXISTING_UNSCHEDULED
PROPOSED_EXISTING_BATCH
PROPOSED_NEW_BATCH
OUTAGE
FINAL_GATE
CONFLICT
```

Production day vẫn có thể mở từ 06:00 → 06:00 nhưng model tự extend `horizonEnd` để không cắt block kéo dài qua ngày.

## Merge vào source thật

Do source ZIP mới nhất không có trong phiên hiện tại, checkpoint này **chưa patch trực tiếp các file production đang có**. Khi có ZIP baseline mới nhất, merge theo nguyên tắc:

- thêm các module trên;
- map adapter input vào service hiện có;
- gọi v024 scheduler hiện tại;
- thay OUT-44 renderer cũ bằng Combined Timeline tại đúng section;
- thêm OUT-45 read/review layer;
- không sửa unrelated tabs/files.

## SQL statement limit

Migration `db/40_production_snapshot_proposed_plan_v025.sql` has been consolidated to **7 top-level SQL statements** (maximum allowed: 10). Secondary indexes are grouped in one PostgreSQL `DO $$ ... $$` block. Business logic and schema semantics are unchanged.
