# ST Planning — Clean Rebuild v007 (Phase 2 + Phase 3)

A clean Next.js + Aiven PostgreSQL rebuild based only on two approved Excel source sheets.

## Scope implemented

- Aiven PostgreSQL clean schema
- Full RAW import of both source sheets
- Source structure/header preservation
- Browser-side Excel parsing
- Sequential chunk transfer for Vercel/Aiven safety
- Import validation before snapshot activation
- Planning normalization
- Main Scheduling normalization
- Resource-lane normalization
- English ERP-style validation UI
- Phase 2 optimized Planning operational view
- Phase 3 Scheduling table + resource timeline
- Server-side filters/sort, column chooser and browser-local Saved Views

No legacy ST Planning business logic is included.

## 1. Create a fresh database

Create a new Aiven PostgreSQL service/database, then run:

```sql
-- db/schema.sql

### Aiven SQL execution order (max 8 statements per run)

Run the database scripts **one file at a time** in this exact order:

```text
db/01_core_raw.sql      # 7 statements
db/02_planning.sql      # 8 statements
db/03_scheduling.sql    # 7 statements
db/04_views.sql         # 3 statements
db/verify.sql           # 6 SELECT statements, optional after import
```

`db/schema.sql` is now only a pointer/instruction file and should not be executed as the full schema.

```

You can use Aiven Query Editor, psql, DBeaver, pgAdmin, or another PostgreSQL client.

## 2. Configure environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Set:

```env
DATABASE_URL=postgresql://avnadmin:PASSWORD@HOST:PORT/defaultdb
AIVEN_CA_CERT=-----BEGIN CERTIFICATE-----...-----END CERTIFICATE-----
```

`AIVEN_CA_CERT` is recommended. If it is omitted, the app still uses TLS but does not verify the certificate chain.

Do not append conflicting Node/PostgreSQL SSL query parameters to `DATABASE_URL` when `AIVEN_CA_CERT` is used.

## 3. Install and build

```bash
npm install
npm run build
npm run dev
```

## 4. Import workbook

Open:

```text
/data import page: /import
```

Select the workbook containing exactly these required sheet names:

- `SirusClean_Painting_MasterList`
- `Main Planning`

The browser reads the current used range. RAW data is sent sequentially in chunks capped by row count and approximate JSON size.

## 5. Validation/activation

The import is activated only when these checks all pass:

- Planning RAW row count = source used-range row count
- Scheduling RAW row count = source used-range row count
- source column counts match the parsed workbook
- normalized Planning rows = source rows minus 3 header rows
- normalized Scheduling rows = source rows minus 2 header rows

The previous active snapshot is deactivated only after the new import passes validation.

## 6. Pages

- `/` Overview
- `/import` Data Import
- `/planning` Planning operational view
- `/scheduling` Scheduling operational view

## 7. Vercel

Use normal Next.js detection:

- Framework Preset: Next.js
- Root Directory: repository root
- Build Command: default (`npm run build`)
- Output Directory: default / blank
- Install Command: default

Do not set Output Directory to `public` or `.next`.

Add `DATABASE_URL` and `AIVEN_CA_CERT` in Vercel Environment Variables, then redeploy.

## Design rule

The RAW layer is immutable source evidence. Future application edits and business logic must be stored in operational/business tables, not written back over RAW imported rows.


## Phase 2 + Phase 3

See `docs/PHASE2_PHASE3.md` for the complete implemented scope. No additional SQL migration is required.
