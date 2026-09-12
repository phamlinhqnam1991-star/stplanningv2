# v025.4a - ST Output Target / Intermediate Inspection

Baseline: `STPlanningV2.zip` supplied on 2026-09-12.

## Business behavior
- Intermediate inspection is identified from the existing config-driven Operation -> Main mapping when `Main Operation = ST_INSPECTION`.
- Inspection stays in the physical route only. This patch does not turn inspection into a Planning Main, does not create a Batch, and does not change READY/WAIT/Recipe/Scheduling rules.
- ST Output Target now returns and shows: Next Inspection, Inspection Status, Inspection ETA, Inspection Finish, remaining inspection count, Final Gate, Final ETA and Output Status.
- Inspection duration continues to use the existing Process Time resolver. Missing time follows the current ST Output unknown-step policy; the UI does not invent a duration.
- Inspection contributes dependency/time only. It does not add dm2 output; the Job is still credited only at Final ST.

## Included build compatibility fix from the same baseline
The baseline itself contained the v025.4 checkpoint build errors previously reported. This package also keeps the already-approved minimal fixes:
- `src/components/st-output/combined-production-timeline.tsx`: correct relative import to `src/lib/st-output-v025/types` and explicit lane typing.
- `src/lib/st-output-v025/proposal-persistence.ts`: use the project's existing `lib/db.ts` / `pg` transaction helper instead of a non-existent Supabase Admin module.

## Changed files
- `lib/st-output-engine.ts`
- `components/StOutputWorkbench.tsx`
- `app/globals.css`
- `src/components/st-output/combined-production-timeline.tsx`
- `src/lib/st-output-v025/proposal-persistence.ts`
- `README_V0254_CHECKPOINT.md`
- `README_V0254A_INSPECTION.md`

No SQL migration was added or changed in v025.4a.
