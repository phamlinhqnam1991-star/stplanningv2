import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { SOURCE_SHEETS, sourceColumnMetadata } from "@/lib/source-model";

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

    for (const key of ["planning", "scheduling"] as const) {
      const sheet = byKey.get(key);
      const expected = SOURCE_SHEETS[key];
      if (!sheet) throw new Error(`Missing required worksheet metadata: ${expected.name}`);
      if (sheet.name !== expected.name) throw new Error(`Unexpected worksheet name: ${sheet.name}`);
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
           planning_column_count, scheduling_column_count)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [body.filename, body.sha256, planning.totalRows, scheduling.totalRows, planning.totalColumns, scheduling.totalColumns]
      );
      const id = inserted.rows[0].id;

      const allColumns = body.sheets.flatMap((sheet) =>
        sheet.columns.map((c) => {
          const meta = sourceColumnMetadata(sheet.key, c.columnOrder);
          return [
            id,
            sheet.name,
            c.excelColumn,
            c.columnOrder,
            c.headerRow1,
            c.headerRow2,
            c.headerRow3,
            meta.businessGroup,
            meta.phase1Strategy,
            meta.targetTable,
            meta.targetField,
            meta.sourceDataType,
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

      return id;
    });

    return NextResponse.json({ importId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start import.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
