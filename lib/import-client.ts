"use client";

import { apiJson } from "@/lib/api-client";
import type { ParsedWorkbook, RawRow } from "@/lib/types";

const MAX_ROWS_PER_CHUNK = 100;
const TARGET_JSON_BYTES = 1_600_000;

function splitRows(rows: RawRow[]): RawRow[][] {
  const chunks: RawRow[][] = [];
  let current: RawRow[] = [];
  let bytes = 2;

  for (const row of rows) {
    const rowBytes = new Blob([JSON.stringify(row)]).size + 1;
    if (current.length && (current.length >= MAX_ROWS_PER_CHUNK || bytes + rowBytes > TARGET_JSON_BYTES)) {
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

export type ImportProgress = {
  stage: "STARTING" | "UPLOADING" | "FINALIZING" | "COMPLETE";
  sheet?: string;
  sentRows: number;
  totalRows: number;
  percent: number;
};

export async function importWorkbook(
  workbook: ParsedWorkbook,
  sha256: string,
  onProgress: (progress: ImportProgress) => void
): Promise<{ importId: string; validation: unknown }> {
  const totalRows = workbook.sheets.reduce((sum, s) => sum + s.rows.length, 0);
  onProgress({ stage: "STARTING", sentRows: 0, totalRows, percent: 0 });

  const start = await apiJson<{ importId: string }>("/api/import/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: workbook.filename,
      sha256,
      sheets: workbook.sheets.map((sheet) => ({
        key: sheet.key,
        name: sheet.name,
        totalRows: sheet.totalRows,
        totalColumns: sheet.totalColumns,
        headerRows: sheet.headerRows,
        columns: sheet.columns,
      })),
    }),
  });

  let sentRows = 0;
  for (const sheet of workbook.sheets) {
    for (const rows of splitRows(sheet.rows)) {
      await apiJson<{ inserted: number }>("/api/import/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId: start.importId, sheetKey: sheet.key, rows }),
      });
      sentRows += rows.length;
      onProgress({
        stage: "UPLOADING",
        sheet: sheet.name,
        sentRows,
        totalRows,
        percent: Math.round((sentRows / totalRows) * 95),
      });
    }
  }

  onProgress({ stage: "FINALIZING", sentRows, totalRows, percent: 97 });
  const finish = await apiJson<{ importId: string; validation: unknown }>("/api/import/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ importId: start.importId }),
  });

  onProgress({ stage: "COMPLETE", sentRows, totalRows, percent: 100 });
  return finish;
}
