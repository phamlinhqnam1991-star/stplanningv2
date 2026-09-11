"use client";

import { apiJson } from "@/lib/api-client";
import type { ParsedRoutingWorkbook, RawRow } from "@/lib/types";

const TARGET_JSON_BYTES = 1_600_000;

function splitRows(rows: RawRow[], maxRows: number): RawRow[][] {
  const chunks: RawRow[][] = [];
  let current: RawRow[] = [];
  let bytes = 2;

  for (const row of rows) {
    const rowBytes = new Blob([JSON.stringify(row)]).size + 1;
    if (current.length && (current.length >= maxRows || bytes + rowBytes > TARGET_JSON_BYTES)) {
      chunks.push(current);
      current = [];
      bytes = 2;
    }
    current.push(row);
    bytes += rowBytes;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export type RoutingImportProgress = {
  stage: "STARTING" | "UPLOADING" | "FINALIZING" | "COMPLETE";
  sentRows: number;
  totalRows: number;
  percent: number;
};

export async function importRoutingWorkbook(
  workbook: ParsedRoutingWorkbook,
  sha256: string,
  onProgress: (progress: RoutingImportProgress) => void,
  maxRowsPerChunk = 80
): Promise<{ importId: string; validation: unknown }> {
  const totalRows = workbook.sheet.rows.length;
  onProgress({ stage: "STARTING", sentRows: 0, totalRows, percent: 0 });

  const start = await apiJson<{ importId: string }>("/api/routing-import/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: workbook.filename,
      sha256,
      sheet: {
        name: workbook.sheet.name,
        totalRows: workbook.sheet.totalRows,
        totalColumns: workbook.sheet.totalColumns,
        headerRows: workbook.sheet.headerRows,
        columns: workbook.sheet.columns,
      },
    }),
  });

  let sentRows = 0;
  for (const rows of splitRows(workbook.sheet.rows, Math.max(1, Math.min(500, maxRowsPerChunk)))) {
    await apiJson<{ inserted: number }>("/api/routing-import/chunk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ importId: start.importId, rows }),
    });
    sentRows += rows.length;
    onProgress({
      stage: "UPLOADING",
      sentRows,
      totalRows,
      percent: Math.round((sentRows / totalRows) * 95),
    });
  }

  onProgress({ stage: "FINALIZING", sentRows, totalRows, percent: 97 });
  const finish = await apiJson<{ importId: string; validation: unknown }>("/api/routing-import/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ importId: start.importId }),
  });

  onProgress({ stage: "COMPLETE", sentRows, totalRows, percent: 100 });
  return finish;
}
