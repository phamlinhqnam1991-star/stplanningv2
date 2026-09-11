# ST Planning Clean Rebuild v013 — Recipe + Process Time Model

v013 extends the configuration-first architecture with a source-grounded Recipe and Process Time model.

## New CFG-92 workbench

Open:

`/configuration/recipe-model`

Tabs:

- **Recipe Master** — Recipe No., Recipe Name, Recipe Group, area, paint type, source aliases, default process time, temperature.
- **Recipe Rules** — configurable Main Operation → recipe selector rules.
- **Process Time** — recipe default durations, stage times and source process-time profiles.
- **Process Time Rules** — configurable source/fixed/future Qty-Surface calculation rules.

## Seeded baseline counts

- **144 Recipe records**
- **32 Recipe Rules**
- **27 Recipe Source Fields**
- **4 Process Time Profiles**
- **23 Process Time Rules**
- **26 Process Time Source Fields**

Rules and source fields remain editable in CFG-92. Seed files use `ON CONFLICT DO NOTHING` so later user edits are not overwritten by rerunning the seed.

## Source-derived baseline

Recipe Master is seeded from:

1. `STRecipe` in `ST_PAINTING_POWERCOATING.xlsx`.
2. Recipe identifiers actually observed in `SirusClean_Painting_MasterList` but missing from `STRecipe` are retained as **source-only / needs review**.
3. `AutoSP.1.RECIPE PVT` identifiers are retained as Auto Shot Peening recipes.
4. Manual Shot Peening does **not** expose a Recipe No. in the supplied source; its execution file is handled as a source identifier. No fake Recipe No. is created.

Recipe Rules use configurable source field masters rather than hard-coded Excel columns.

Important source selectors include:

- `CI` Sirius cleaning recipe
- `CP` plating recipe
- `DY:ED` HE-Bake context recipes
- `EE:EG` Plating Line recipe fields
- `EH:EM` Additional Recipe Info
- `BF:BL` paint/material names
- `BC` Auto Shot Peening Recipe PVT
- `CH` Manual Shot Peening execution file

## Process Time baseline

Safe/explicit source time data:

- `STRecipe.Duration` → converted from Excel day fraction to minutes.
- `DW` Blasting time is explicitly labelled **minute** and the rule is enabled.
- Sirius cleaning 10/20/50-pcs timing fields are catalogued, but the interpolation / batching calculation is **disabled for review** because the supplied workbook does not define the calculation behavior.
- Masking/marking numeric source fields are catalogued but their unit is not stated in the supplied headers, therefore seeded Process Time Rules are **disabled + needsReview**.

This deliberately avoids inventing process-time logic.

## Planning integration

Planning now returns:

- `recipeSuggestion`
- `processTimeSuggestion`

for the configured `Next Planning Operation`.

The Planning grid includes:

- **Suggested Recipe**
- **Process Time**

Missing or ambiguous recipe mappings remain visible.

## Aiven upgrade from v012

Run these files separately, in order:

1. `db/15_recipe_model_definitions.sql`
2. `db/16_recipe_master_seed.sql`
3. `db/17_recipe_process_source_fields.sql`
4. `db/18_recipe_rules_seed.sql`
5. `db/19_process_time_profiles.sql`
6. `db/20_process_time_rules_seed.sql`

Every file is below the requested maximum of 8 SQL statements.

Then run:

`db/verify_v013_recipe.sql`

## Important review points

The source workbook itself contains some inconsistencies / gaps, therefore v013 preserves them instead of silently correcting them. Examples include source recipe numbers not present in `STRecipe`, duplicate Recipe No. rows, and recipe-name / recipe-number observations that do not always agree with `STRecipe`.

Review these in CFG-92 and edit the configuration; no code change is required.
