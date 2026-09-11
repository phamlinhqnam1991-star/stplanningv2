import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { sourceColumnMetadata } from "@/lib/source-model";
import { getConfigBootstrap, sourceOperationRange } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columnSchema = z.object({
  excelColumn: z.string().min(1).max(4),
  columnOrder: z.number().int().positive(),
  headerRow1: z.string().nullable(),
  headerRow2: z.string().nullable(),
  headerRow3: z.string().nullable(),
});

const sheetSchema = z.object({
  key: z.enum(["planning", "scheduling"]),
  name: z.string(),
  totalRows: z.number().int().positive(),
  totalColumns: z.number().int().positive(),
  headerRows: z.number().int().positive(),
  columns: z.array(columnSchema).min(1).max(500),
});

const bodySchema = z.object({
  filename: z.string().min(1).max(500),
  sha256: z.string().length(64),
  sheets: z.array(sheetSchema).length(2),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const byKey = new Map(body.sheets.map((s) => [s.key, s]));
    const bootstrap = await getConfigBootstrap();
    const planningProfile = bootstrap.sources.PLANNING;
    const schedulingProfile = bootstrap.sources.SCHEDULING;
    if (!planningProfile.enabled) throw new Error("Planning source profile is disabled in Configuration.");
    if (!schedulingProfile.enabled) throw new Error("Scheduling source profile is disabled in Configuration.");
    const profileByKey = { planning: planningProfile, scheduling: schedulingProfile };

    for (const key of ["planning", "scheduling"] as const) {
      const sheet = byKey.get(key);
      const expected = profileByKey[key];
      const expectedName = expected.sheetName || expected.displayName;
      if (!sheet) throw new Error(`Missing required worksheet metadata: ${expectedName}`);
      if (sheet.name !== expectedName) throw new Error(`Unexpected worksheet name: ${sheet.name}. Configuration expects ${expectedName}.`);
      if (sheet.headerRows !== expected.headerRows) throw new Error(`Unexpected header-row count for ${sheet.name}.`);
      if (sheet.totalColumns < expected.baselineColumns) {
        throw new Error(`${sheet.name} must contain at least ${expected.baselineColumns} columns.`);
      }
      if (sheet.columns.length !== sheet.totalColumns) {
        throw new Error(`${sheet.name} column metadata does not match its used range.`);
      }
    }

    const planning = byKey.get("planning")!;
    const scheduling = byKey.get("scheduling")!;

    const importId = await withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO import_runs
          (source_filename, source_sha256, planning_row_count, scheduling_row_count,
           planning_column_count, scheduling_column_count, config_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
         RETURNING id`,
        [body.filename, body.sha256, planning.totalRows, scheduling.totalRows, planning.totalColumns, scheduling.totalColumns,
         JSON.stringify({ planning: planningProfile, scheduling: schedulingProfile, settings: bootstrap.settings })]
      );
      const id = inserted.rows[0].id;

      const allColumns = body.sheets.flatMap((sheet) =>
        sheet.columns.map((c) => {
          const meta = sourceColumnMetadata(sheet.key, c.columnOrder);
          const profile = sheet.key === "planning" ? planningProfile : schedulingProfile;
          const range = sheet.key === "planning" ? sourceOperationRange(profile) : null;
          const operationMeta = range && c.columnOrder >= range.start && c.columnOrder <= range.end
            ? { ...meta, businessGroup: "ST Operation Planning State", phase1Strategy: "NORMALIZE NOW", targetTable: "planning_job_operations", targetField: "source_value", sourceDataType: "text" }
            : meta;
          return [
            id, sheet.name, c.excelColumn, c.columnOrder, c.headerRow1, c.headerRow2, c.headerRow3,
            operationMeta.businessGroup, operationMeta.phase1Strategy, operationMeta.targetTable, operationMeta.targetField, operationMeta.sourceDataType,
          ];
        })
      );

      if (allColumns.length) {
        const values: unknown[] = [];
        const tuples = allColumns.map((row) => {
          const offset = values.length;
          values.push(...row);
          return `(${row.map((_, i) => `$${offset + i + 1}`).join(",")})`;
        });
        await client.query(
          `INSERT INTO source_columns
            (import_id, sheet_name, excel_column, column_order, header_row_1, header_row_2, header_row_3,
             business_group, phase1_strategy, target_table, target_field, source_data_type)
           VALUES ${tuples.join(",")}`,
          values
        );
      }

      const opRange = sourceOperationRange(planningProfile);
      const operationColumns = planning.columns.filter((c) => c.columnOrder >= opRange.start && c.columnOrder <= opRange.end && c.headerRow3?.trim());
      for (const c of operationColumns) {
        await client.query(
          `INSERT INTO config_items (category, code, label, sort_order, data)
           VALUES ('ST_OPERATION',$1,$2,$3,$4::jsonb)
           ON CONFLICT (category,code) DO UPDATE SET label=EXCLUDED.label, sort_order=EXCLUDED.sort_order, data=config_items.data || EXCLUDED.data, updated_at=now()`,
          [c.headerRow3!.trim(), c.headerRow3!.trim(), c.columnOrder, JSON.stringify({ sourceColumn: c.excelColumn })]
        );
      }

      return id;
    });

    return NextResponse.json({ importId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start import.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
