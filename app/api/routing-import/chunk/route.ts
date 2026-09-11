import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import type { PoolClient } from "pg";
import { routingPrefixes, sourceCoreColumns, type SourceProfile } from "@/lib/config";
import { asBooleanFlag, asInteger, asNumber, asText, isNonBlank, operationCodeFromSource, rawValue } from "@/lib/normalize";
import type { RawRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cellSchema = z.object({
  v: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  f: z.string().optional(),
  t: z.string().optional(),
});

const rowSchema = z.object({
  rowNo: z.number().int().positive(),
  cells: z.record(z.string(), cellSchema.nullable()),
});

const bodySchema = z.object({
  importId: z.string().uuid(),
  rows: z.array(rowSchema).min(1).max(500),
});

function bulkValues(rows: unknown[][]) {
  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const base = params.length;
    params.push(...row);
    return `(${row.map((_, i) => `$${base + i + 1}`).join(",")})`;
  });
  return { params, tuples };
}

function operationColumnMap(rows: { header_row_1: string | null; excel_column: string }[], operationSlots: number, prefixes: ReturnType<typeof routingPrefixes>) {
  const byHeader = new Map<string, string>();
  for (const row of rows) {
    const header = (row.header_row_1 ?? "").trim();
    if (header) byHeader.set(header, row.excel_column);
  }
  const slots = [] as Array<{ slot: number; op: string; complete: string; nonconf: string; seq: string }>;
  for (let slot = 1; slot <= operationSlots; slot++) {
    const op = byHeader.get(`${prefixes.operation}${slot}`);
    const complete = byHeader.get(`${prefixes.complete}${slot}`);
    const nonconf = byHeader.get(`${prefixes.nonconformance}${slot}`);
    const seq = byHeader.get(`${prefixes.sequence}${slot}`);
    if (!op || !complete || !nonconf || !seq) throw new Error(`Routing operation metadata is incomplete at slot ${slot}.`);
    slots.push({ slot, op, complete, nonconf, seq });
  }
  return slots;
}

async function insertOperations(client: PoolClient, rows: unknown[][]) {
  const batchSize = 800;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const bulk = bulkValues(batch);
    await client.query(
      `INSERT INTO job_operation_sequence
        (job_route_id, operation_position, operation_code, operation_seq, is_complete,
         open_nonconformance, source_operation_text, source_operation_column,
         source_complete_column, source_nonconf_column, source_seq_column)
       VALUES ${bulk.tuples.join(",")}`,
      bulk.params
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const rows = body.rows as RawRow[];
    if (new Set(rows.map((row) => row.rowNo)).size !== rows.length) {
      throw new Error("The routing chunk contains duplicate source row numbers.");
    }

    const result = await withTransaction(async (client) => {
      const run = await client.query<{ status: string; route_row_count: number; sheet_name: string; config_snapshot: unknown }>(
        `SELECT status, route_row_count, sheet_name, config_snapshot
         FROM route_import_runs WHERE id=$1 FOR UPDATE`,
        [body.importId]
      );
      if (!run.rowCount) throw new Error("Routing import run not found.");
      if (run.rows[0].status !== "IMPORTING") throw new Error("Routing import is no longer accepting chunks.");
      const snapshot = run.rows[0].config_snapshot as { routing?: SourceProfile; settings?: Record<string, unknown> } | null;
      const profile = snapshot?.routing;
      if (!profile) throw new Error("Routing import has no configuration snapshot. Restart the import with the current version.");
      const configuredMaxRows = Math.max(1, Math.min(500, Number(snapshot?.settings?.["import.maxRoutingChunkRows"] || 80)));
      if (rows.length > configuredMaxRows) throw new Error(`Chunk exceeds configured routing import limit of ${configuredMaxRows} rows.`);
      const core = sourceCoreColumns(profile);
      const operationSlots = profile.operationSlots ?? 36;
      const prefixes = routingPrefixes(profile);
      if (rows.some((row) => row.rowNo > run.rows[0].route_row_count)) {
        throw new Error("Routing chunk contains a row outside the worksheet used range.");
      }

      const rawRows = rows.map((row) => {
        const payload = JSON.stringify(row.cells);
        const hash = createHash("sha256").update(payload).digest("hex");
        return [body.importId, row.rowNo, payload, hash];
      });
      const rawBulk = bulkValues(rawRows);
      await client.query(
        `INSERT INTO raw_route_rows (import_id, source_row_no, row_data, row_hash)
         VALUES ${rawBulk.tuples.join(",")}
         ON CONFLICT (import_id, source_row_no)
         DO UPDATE SET row_data=EXCLUDED.row_data, row_hash=EXCLUDED.row_hash`,
        rawBulk.params
      );

      const dataRows = rows.filter((row) => row.rowNo > profile.headerRows);
      if (!dataRows.length) return { inserted: rows.length };

      const sourceNos = dataRows.map((row) => row.rowNo);
      await client.query(
        `DELETE FROM job_routes WHERE import_id=$1 AND source_row_no=ANY($2::int[])`,
        [body.importId, sourceNos]
      );

      const columnResult = await client.query<{ header_row_1: string | null; excel_column: string }>(
        `SELECT header_row_1, excel_column
         FROM route_source_columns
         WHERE import_id=$1
         ORDER BY column_order`,
        [body.importId]
      );
      const opSlots = operationColumnMap(columnResult.rows, operationSlots, prefixes);

      const routeRows = dataRows.map((row) => {
        const operationCount = opSlots.reduce((count, slot) => count + (isNonBlank(rawValue(row, slot.op)) ? 1 : 0), 0);
        return [
          body.importId,
          row.rowNo,
          asText(rawValue(row, core.program || "D")),
          asText(rawValue(row, core.epicorPart || "E")),
          asText(rawValue(row, core.revisionNum || "X")),
          asText(rawValue(row, core.jobNum || "J")),
          asNumber(rawValue(row, core.prodQty || "L")),
          asText(rawValue(row, core.lastLaborOp || "M")),
          asInteger(rawValue(row, core.lastLaborOprSeq || "AB")),
          asText(rawValue(row, core.nextOperation || "AC")),
          asInteger(rawValue(row, core.lastCompleteOprSeq || "AZ")),
          asBooleanFlag(rawValue(row, core.jobComplete || "AD")),
          operationCount,
        ];
      });
      const routesBulk = bulkValues(routeRows);
      const insertedRoutes = await client.query<{ id: string; source_row_no: number }>(
        `INSERT INTO job_routes
          (import_id, source_row_no, program, epicor_part, revision_num, job_num, prod_qty,
           last_labor_op, last_labor_opr_seq, next_operation, last_complete_opr_seq,
           job_complete, operation_count)
         VALUES ${routesBulk.tuples.join(",")}
         RETURNING id, source_row_no`,
        routesBulk.params
      );
      const routeIds = new Map(insertedRoutes.rows.map((route) => [route.source_row_no, route.id]));

      const operationRows: unknown[][] = [];
      for (const row of dataRows) {
        const routeId = routeIds.get(row.rowNo);
        if (!routeId) continue;
        for (const slot of opSlots) {
          const sourceText = asText(rawValue(row, slot.op))?.trim();
          if (!sourceText) continue;
          const code = operationCodeFromSource(sourceText);
          if (!code) continue;
          operationRows.push([
            routeId,
            slot.slot,
            code,
            asInteger(rawValue(row, slot.seq)),
            asBooleanFlag(rawValue(row, slot.complete)),
            asText(rawValue(row, slot.nonconf))?.trim() || null,
            sourceText,
            slot.op,
            slot.complete,
            slot.nonconf,
            slot.seq,
          ]);
        }
      }
      if (operationRows.length) await insertOperations(client, operationRows);

      return { inserted: rows.length };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import routing chunk.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
