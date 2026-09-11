# v009 Route Analysis

See `README_v009.md` and `docs/ROUTING_ANALYSIS.md`. No SQL migration is required from v008.

# ST Planning — Clean Rebuild v008

Clean Next.js + Aiven PostgreSQL rebuild with three controlled source datasets.

## Controlled sources

1. `SirusClean_Painting_MasterList` — ST Planning attributes
2. `Main Planning` — Scheduling source
3. All Open Jobs — authoritative full Job operation route

## Current application scope

- Complete RAW retention for the two ST workbook sheets
- Independent RAW retention for All Open Jobs routing
- Planning normalized operational view
- Scheduling normalized operational view + resource timeline
- Full Job routing normalization through 36 operation slots
- Job Routing Explorer
- English ERP UI
- Sequential import designed for Aiven/Vercel connection limits

No legacy Candidate/Batch/Recipe/Planning Chain/Auto Planning logic is included.

## Database setup

Aiven Query Editor is limited to a maximum of 8 SQL statements per run.
Run one file at a time, in order:

```text
db/01_core_raw.sql           # 7 statements
db/02_planning.sql           # 8 statements
db/03_scheduling.sql         # 7 statements
db/04_views.sql              # 3 statements
db/05_routing_core.sql       # 8 statements
db/06_routing_operations.sql # 7 statements
db/07_config_core.sql         # 8 statements
db/08_config_defaults.sql     # 7 statements
db/09_config_links_seed.sql   # 4 statements
```

Upgrade paths:

```text
Existing v009: run 07 -> 08 -> 09 only
Existing v007: run 05 -> 06 -> 07 -> 08 -> 09
```

Verification is also split to stay below the same limit:

```text
db/verify_st.sql      # 6 statements
db/verify_routing.sql # 5 statements
```

## Environment

Copy `.env.example` to `.env.local` and configure:

```env
DATABASE_URL=postgresql://avnadmin:PASSWORD@HOST:PORT/defaultdb
AIVEN_CA_CERT=-----BEGIN CERTIFICATE-----...-----END CERTIFICATE-----
```

## Local run

```bash
npm install
npm run build
npm run dev
```

Open:

```text
http://localhost:3000
```

## Import order

Open `/import`.

The two import sections are independent:

### ST Planning Workbook

Required worksheets:

- `SirusClean_Painting_MasterList`
- `Main Planning`

### All Open Jobs Routing

Select the All Open Jobs workbook containing:

- JobNum
- NextOperation
- Op.1..Op.36
- OpC.1..OpC.36
- OpenNonConfOp.1..OpenNonConfOp.36
- OprSeq.1..OprSeq.36

The current approved file has 6,499 Jobs and 248 source columns.

## Pages

```text
/            Operations Overview
/import      Data Import
/routing     Full Job Routing
/planning    Phase 2 Planning
/scheduling  Phase 3 Scheduling
/configuration Configuration Center
```

## Design rule

RAW source evidence is immutable. Future business rules are added only to operational/business layers after explicit approval.

See `README_v010.md`, `docs/CONFIGURATION_ARCHITECTURE.md`, and `docs/ROUTING_SOURCE.md`.


## v010 Configuration-First Extension

Configuration is now the extension layer for source mappings, Main Operations, operation mappings, resources, statuses, areas, planners, recipe groups, runtime settings, shared views and future rule definitions. Existing v009 databases only need SQL 07 → 08 → 09. See `README_v010.md` and `docs/CONFIGURATION_ARCHITECTURE.md`.

## v011 — Planning Model

After v010, run `db/10_planning_model_config.sql`, then open `/configuration/planning-model` to create Main Operations and map imported operations. See `README_v011.md` and `docs/PLANNING_MODEL_CONFIG.md`.


## v012 — Seeded Configuration Baseline

Run after v011:
1. `db/11_seed_hierarchy_masters.sql`
2. `db/12_seed_hierarchy_links.sql`
3. `db/13_seed_operation_masters.sql`
4. `db/14_seed_operation_mappings.sql`
5. Optional: `db/verify_v012_seed.sql`

Review workbook: `docs/ST_Planning_v012_Configuration_Review.xlsx`.
