import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { excelColumnNumber } from "@/lib/source-model";
import { sourceCoreColumns, sourceOperationRange, sourceResourceColumns, type SourceProfile } from "@/lib/config";
import { asInteger, asNumber, asText, excelDurationToMinutes, excelFractionToTime, excelSerialToDate, isNonBlank, rawValue } from "@/lib/normalize";
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
  sheetKey: z.enum(["planning", "scheduling"]),
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

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const rows = body.rows as RawRow[];

    if (new Set(rows.map((r) => r.rowNo)).size !== rows.length) {
      throw new Error("The chunk contains duplicate source row numbers.");
    }

    const result = await withTransaction(async (client) => {
      const run = await client.query<{
        status: string;
        planning_row_count: number;
        scheduling_row_count: number;
        config_snapshot: unknown;
      }>(
        `SELECT status, planning_row_count, scheduling_row_count, config_snapshot
         FROM import_runs WHERE id = $1 FOR UPDATE`,
        [body.importId]
      );
      if (!run.rowCount) throw new Error("Import run not found.");
      if (run.rows[0].status !== "IMPORTING") throw new Error("Import run is no longer accepting chunks.");
      const snapshot = run.rows[0].config_snapshot as { planning?: SourceProfile; scheduling?: SourceProfile; settings?: Record<string, unknown> } | null;
      const sheetConfig = body.sheetKey === "planning" ? snapshot?.planning : snapshot?.scheduling;
      if (!sheetConfig) throw new Error("Import run has no configuration snapshot. Restart the import with the current version.");
      const configuredMaxRows = Math.max(1, Math.min(500, Number(snapshot?.settings?.["import.maxStChunkRows"] || 100)));
      if (rows.length > configuredMaxRows) throw new Error(`Chunk exceeds configured ST import limit of ${configuredMaxRows} rows.`);
      const sheetName = sheetConfig.sheetName || sheetConfig.displayName;
      const core = sourceCoreColumns(sheetConfig);

      const expectedRows = body.sheetKey === "planning"
        ? run.rows[0].planning_row_count
        : run.rows[0].scheduling_row_count;
      if (rows.some((r) => r.rowNo > expectedRows)) {
        throw new Error(`Chunk contains a row outside the ${sheetName} used range.`);
      }

      const rawRows = rows.map((row) => {
        const payload = JSON.stringify(row.cells);
        const hash = createHash("sha256").update(payload).digest("hex");
        return [body.importId, sheetName, row.rowNo, payload, hash];
      });
      const rawBulk = bulkValues(rawRows);
      await client.query(
        `INSERT INTO raw_sheet_rows (import_id, sheet_name, source_row_no, row_data, row_hash)
         VALUES ${rawBulk.tuples.map((t) => t.replace(/\)$/, ")")).join(",")}
         ON CONFLICT (import_id, sheet_name, source_row_no)
         DO UPDATE SET row_data = EXCLUDED.row_data, row_hash = EXCLUDED.row_hash`,
        rawBulk.params
      );

      if (body.sheetKey === "planning") {
        const dataRows = rows.filter((r) => r.rowNo > sheetConfig.headerRows);
        if (dataRows.length) {
          const sourceNos = dataRows.map((r) => r.rowNo);
          await client.query(
            `DELETE FROM planning_jobs WHERE import_id = $1 AND source_row_no = ANY($2::int[])`,
            [body.importId, sourceNos]
          );

          const jobRows = dataRows.map((row) => [
            body.importId,
            row.rowNo,
            asText(rawValue(row, core.program || "A")),
            asText(rawValue(row, core.partCluster || "B")),
            asText(rawValue(row, core.epicorPart || "C")),
            asNumber(rawValue(row, core.surfaceDm2 || "D")),
            asText(rawValue(row, core.partDescription || "E")),
            asText(rawValue(row, core.jobNum || "F")),
            asText(rawValue(row, core.lastLaborOp || "G")),
            asText(rawValue(row, core.nextOperation || "H")),
            asNumber(rawValue(row, core.lastLaborQty || "I")),
            asNumber(rawValue(row, core.prodQty || "J")),
            asNumber(rawValue(row, core.currentGoodWipQty || "K")),
            asText(rawValue(row, core.stSourceValue || "AW")),
            asText(rawValue(row, core.stWipArea || "AX")),
            asText(rawValue(row, core.wipSequence || "AY")),
            asText(rawValue(row, core.allOperation || "AZ")),
          ]);
          const jobsBulk = bulkValues(jobRows);
          const insertedJobs = await client.query<{ id: string; source_row_no: number }>(
            `INSERT INTO planning_jobs
              (import_id, source_row_no, program, part_cluster, epicor_part, surface_dm2,
               part_description, job_num, last_labor_op, next_operation, last_labor_qty,
               prod_qty, current_good_wip_qty, st_source_value, st_wip_area, wip_sequence, all_operation)
             VALUES ${jobsBulk.tuples.join(",")}
             RETURNING id, source_row_no`,
            jobsBulk.params
          );
          const jobIds = new Map(insertedJobs.rows.map((r) => [r.source_row_no, r.id]));

          const opColumns = await client.query<{
            column_order: number;
            excel_column: string;
            header_row_3: string | null;
          }>(
            `SELECT column_order, excel_column, header_row_3
             FROM source_columns
             WHERE import_id = $1 AND sheet_name = $2 AND column_order BETWEEN $3 AND $4
             ORDER BY column_order`,
            [body.importId, sheetName, sourceOperationRange(sheetConfig).start, sourceOperationRange(sheetConfig).end]
          );

          const opRows: unknown[][] = [];
          for (const row of dataRows) {
            const jobId = jobIds.get(row.rowNo);
            if (!jobId) continue;
            for (const col of opColumns.rows) {
              const value = rawValue(row, col.excel_column);
              if (!isNonBlank(value) || !col.header_row_3) continue;
              opRows.push([jobId, col.header_row_3, col.column_order, col.excel_column, String(value)]);
            }
          }
          if (opRows.length) {
            const opsBulk = bulkValues(opRows);
            await client.query(
              `INSERT INTO planning_job_operations
                (planning_job_id, operation_code, operation_order, source_excel_column, source_value)
               VALUES ${opsBulk.tuples.join(",")}`,
              opsBulk.params
            );
          }
        }
      } else {
        const dataRows = rows.filter((r) => r.rowNo > sheetConfig.headerRows);
        if (dataRows.length) {
          const sourceNos = dataRows.map((r) => r.rowNo);
          await client.query(
            `DELETE FROM schedule_blocks WHERE import_id = $1 AND source_row_no = ANY($2::int[])`,
            [body.importId, sourceNos]
          );

          const blockRows = dataRows.map((row) => [
            body.importId,
            row.rowNo,
            excelSerialToDate(rawValue(row, core.date || "A")),
            asText(rawValue(row, core.day || "B")),
            asInteger(rawValue(row, core.slot || "C")),
            asText(rawValue(row, core.batch || "Q")),
            asText(rawValue(row, core.recipeNo || "R")),
            asText(rawValue(row, core.recipeDescription || "S")),
            asInteger(rawValue(row, core.jobCount || "T")),
            asNumber(rawValue(row, core.pcs || "U")),
            asNumber(rawValue(row, core.surfaceDm2 || "V")),
            excelFractionToTime(rawValue(row, core.start || "W")),
            excelFractionToTime(rawValue(row, core.end || "X")),
            excelDurationToMinutes(rawValue(row, core.duration || "Y")),
            asText(rawValue(row, core.status || "AJ")),
            asText(rawValue(row, core.comments || "AK")),
          ]);
          const blocksBulk = bulkValues(blockRows);
          const insertedBlocks = await client.query<{ id: string; source_row_no: number }>(
            `INSERT INTO schedule_blocks
              (import_id, source_row_no, schedule_date, day_label, slot_no, batch_ref, recipe_no,
               recipe_description, job_count, pcs, surface_dm2, start_time, end_time,
               duration_minutes, status, comments)
             VALUES ${blocksBulk.tuples.join(",")}
             RETURNING id, source_row_no`,
            blocksBulk.params
          );
          const blockIds = new Map(insertedBlocks.rows.map((r) => [r.source_row_no, r.id]));

          const assignmentRows: unknown[][] = [];
          for (const row of dataRows) {
            const blockId = blockIds.get(row.rowNo);
            if (!blockId) continue;
            for (const [col, resourceCode] of Object.entries(sourceResourceColumns(sheetConfig))) {
              const order = excelColumnNumber(col);
              const value = rawValue(row, col);
              if (!isNonBlank(value)) continue;
              assignmentRows.push([blockId, resourceCode, order, col, String(value)]);
            }
          }
          if (assignmentRows.length) {
            const assignmentsBulk = bulkValues(assignmentRows);
            await client.query(
              `INSERT INTO schedule_resource_assignments
                (schedule_block_id, resource_code, resource_order, source_excel_column, batch_ref)
               VALUES ${assignmentsBulk.tuples.join(",")}`,
              assignmentsBulk.params
            );
          }
        }
      }

      return { inserted: rows.length };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import chunk.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
