# STPlanningV2 v025.4 build fix

Baseline: user supplied `STPlanningV2.zip`.

Only changed files:
- `src/components/st-output/combined-production-timeline.tsx`
- `src/lib/st-output-v025/proposal-persistence.ts`

Fixes:
1. Resolve v025 type import inside `src/` instead of root alias `@/lib/...`.
2. Explicitly type timeline `lane` under strict TypeScript.
3. Replace non-existent `@/lib/supabase-admin` dependency with existing `@/lib/db` PostgreSQL transaction helper.
4. Keep proposal persistence transactional using parameterized PostgreSQL queries.

No changes to READY/WAIT, Planning Chain, Batch, Schedule, Recipe, What-if logic, or next.config.ts.
