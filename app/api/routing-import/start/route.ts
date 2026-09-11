import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { getConfigBootstrap, routingPrefixes } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columnSchema = z.object({
  excelColumn: z.string().min(1).max(4),
  columnOrder: z.number().int().positive(),
  headerRow1: z.string().nullable(),
  headerRow2: z.string().nullable(),
  headerRow3: z.string().nullable(),
});

const bodySchema = z.object({
  filename: z.string().min(1).max(500),
  sha256: z.string().length(64),
  sheet: z.object({
    name: z.string().min(1).max(200),
    totalRows: z.number().int().min(2),
    totalColumns: z.number().int().positive(),
    headerRows: z.number().int().positive(),
    columns: z.array(columnSchema).min(1).max(500),
  }),
});

function assertRoutingHeaders(columns: z.infer<typeof columnSchema>[], operationSlots: number, prefixes: ReturnType<typeof routingPrefixes>) {
  const counts = new Map<string, number>();
  for (const column of columns) {
    const header = (column.headerRow1 ?? "").trim();
    if (header) counts.set(header, (counts.get(header) ?? 0) + 1);
  }

  for (const required of ["Program", "EpicorPart", "JobNum", "RevisionNum", "NextOperation"]) {
    if ((counts.get(required) ?? 0) !== 1) {
      throw new Error(`Routing source must contain exactly one "${required}" column.`);
    }
  }

  for (let slot = 1; slot <= operationSlots; slot++) {
    for (const prefix of [prefixes.operation, prefixes.complete, prefixes.nonconformance, prefixes.sequence]) {
      const header = `${prefix}${slot}`;
      if ((counts.get(header) ?? 0) !== 1) {
        throw new Error(`Routing source must contain exactly one "${header}" column.`);
      }
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const { sheet } = body;
    const bootstrap = await getConfigBootstrap();
    const profile = bootstrap.sources.ROUTING;
    if (!profile.enabled) throw new Error("Routing source profile is disabled in Configuration.");
    const operationSlots = profile.operationSlots ?? 36;

    if (sheet.headerRows !== profile.headerRows) throw new Error(`Routing source header rows ${sheet.headerRows}; configuration expects ${profile.headerRows}.`);
    if (sheet.totalColumns < profile.baselineColumns) {
      throw new Error(`Routing source requires at least ${profile.baselineColumns} columns.`);
    }
    if (sheet.columns.length !== sheet.totalColumns) {
      throw new Error("Routing source column metadata does not match the worksheet used range.");
    }
    assertRoutingHeaders(sheet.columns, operationSlots, routingPrefixes(profile));

    const importId = await withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO route_import_runs
          (source_filename, source_sha256, sheet_name, route_row_count, route_column_count, config_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         RETURNING id`,
        [body.filename, body.sha256, sheet.name, sheet.totalRows, sheet.totalColumns,
         JSON.stringify({ routing: profile, settings: bootstrap.settings })]
      );
      const id = inserted.rows[0].id;

      const values: unknown[] = [];
      const tuples = sheet.columns.map((column) => {
        const base = values.length;
        values.push(id, sheet.name, column.excelColumn, column.columnOrder, column.headerRow1);
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`;
      });
      await client.query(
        `INSERT INTO route_source_columns
          (import_id, sheet_name, excel_column, column_order, header_row_1)
         VALUES ${tuples.join(",")}`,
        values
      );

      return id;
    });

    return NextResponse.json({ importId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start routing import.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
