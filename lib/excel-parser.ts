"use client";

import * as XLSX from "xlsx";
import { SOURCE_SHEETS, excelColumnLetter } from "@/lib/source-model";
import type { ParsedSheet, ParsedWorkbook, RawCell, RawRow, SourceColumn } from "@/lib/types";

export type ParseProgress = {
  stage: "READING" | "PARSING" | "COMPLETE";
  sheet?: string;
  percent: number;
};

function serializableValue(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function rawCell(cell: XLSX.CellObject | undefined): RawCell | null {
  if (!cell) return null;
  const out: RawCell = { v: serializableValue(cell.v) };
  if (cell.f) out.f = cell.f;
  if (cell.t) out.t = cell.t;
  return out;
}

function readCell(sheet: XLSX.WorkSheet, row: number, col: number): RawCell | null {
  const address = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
  return rawCell(sheet[address] as XLSX.CellObject | undefined);
}

function cellText(cell: RawCell | null): string | null {
  if (!cell || cell.v == null) return null;
  return String(cell.v);
}

function normalizedHeader(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

const criticalHeaders = {
  planning: {
    A: "PROGRAM",
    C: "EPICORPART",
    F: "JOBNUM",
    H: "NEXTOPERATION",
    M: "CMSA",
    AV: "VARNISH",
  },
  scheduling: {
    A: "DATE",
    D: "SPX CLEAN",
    Q: "SP#/FB#/PB#",
    R: "RECIPE#",
    AJ: "STATUS",
  },
} as const;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function parseSheet(
  workbook: XLSX.WorkBook,
  key: "planning" | "scheduling",
  onProgress?: (progress: ParseProgress) => void,
  progressStart = 20,
  progressEnd = 60
): Promise<ParsedSheet> {
  const config = SOURCE_SHEETS[key];
  const sheet = workbook.Sheets[config.name];
  if (!sheet) throw new Error(`Required worksheet not found: ${config.name}`);
  if (!sheet["!ref"]) throw new Error(`Worksheet has no used range: ${config.name}`);

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  if (range.s.r !== 0 || range.s.c !== 0) {
    throw new Error(`${config.name} must start at cell A1 for the approved source mapping.`);
  }

  const totalRows = range.e.r + 1;
  const totalColumns = range.e.c + 1;

  if (totalColumns < config.baselineColumns) {
    throw new Error(
      `${config.name} has ${totalColumns} columns, but the approved baseline requires at least ${config.baselineColumns}.`
    );
  }

  for (const [letter, expected] of Object.entries(criticalHeaders[key])) {
    const column = XLSX.utils.decode_col(letter) + 1;
    const actualRow = config.headerRows;
    const actual = normalizedHeader(cellText(readCell(sheet, actualRow, column)));
    if (actual !== expected) {
      throw new Error(`${config.name}: expected ${letter}${actualRow} to be "${expected}", found "${actual || "<blank>"}".`);
    }
  }

  const columns: SourceColumn[] = [];
  for (let col = 1; col <= totalColumns; col++) {
    columns.push({
      excelColumn: excelColumnLetter(col),
      columnOrder: col,
      headerRow1: cellText(readCell(sheet, 1, col)),
      headerRow2: config.headerRows >= 2 ? cellText(readCell(sheet, 2, col)) : null,
      headerRow3: config.headerRows >= 3 ? cellText(readCell(sheet, 3, col)) : null,
    });
  }

  // Keep every source row, but store only cells that actually carry data/formulas.
  // Empty cells remain fully reconstructable because the exact used range and all
  // source columns are stored separately. This removes hundreds of thousands of
  // null JS objects from the browser without losing source data.
  const rows: RawRow[] = Array.from({ length: totalRows }, (_, index) => ({
    rowNo: index + 1,
    cells: {},
  }));

  const addresses = Object.keys(sheet).filter((address) => !address.startsWith("!"));
  const batchSize = 5000;

  for (let start = 0; start < addresses.length; start += batchSize) {
    const end = Math.min(start + batchSize, addresses.length);

    for (let index = start; index < end; index++) {
      const address = addresses[index];
      const point = XLSX.utils.decode_cell(address);
      if (point.r < range.s.r || point.r > range.e.r || point.c < range.s.c || point.c > range.e.c) continue;

      const source = sheet[address] as XLSX.CellObject | undefined;
      if (!source || (source.v === undefined && !source.f)) continue;
      rows[point.r].cells[excelColumnLetter(point.c + 1)] = rawCell(source);
    }

    const ratio = addresses.length ? end / addresses.length : 1;
    onProgress?.({
      stage: "PARSING",
      sheet: config.name,
      percent: Math.round(progressStart + ratio * (progressEnd - progressStart)),
    });
    await yieldToBrowser();
  }

  if (!addresses.length) {
    onProgress?.({ stage: "PARSING", sheet: config.name, percent: progressEnd });
    await yieldToBrowser();
  }

  return {
    key,
    name: config.name,
    totalRows,
    totalColumns,
    headerRows: config.headerRows,
    columns,
    rows,
  };
}

export async function parseWorkbook(
  file: File,
  onProgress?: (progress: ParseProgress) => void
): Promise<{ workbook: ParsedWorkbook; sha256: string }> {
  onProgress?.({ stage: "READING", percent: 2 });
  await yieldToBrowser();

  const buffer = await file.arrayBuffer();
  onProgress?.({ stage: "READING", percent: 8 });
  await yieldToBrowser();

  const digestPromise = crypto.subtle.digest("SHA-256", buffer);

  // Only parse the two controlled source sheets. The previous implementation
  // parsed the whole workbook even though every other worksheet is out of scope.
  const xlsx = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    cellFormula: true,
    sheets: [SOURCE_SHEETS.planning.name, SOURCE_SHEETS.scheduling.name],
  });

  onProgress?.({ stage: "PARSING", percent: 20 });
  await yieldToBrowser();

  const planning = await parseSheet(xlsx, "planning", onProgress, 20, 72);
  const scheduling = await parseSheet(xlsx, "scheduling", onProgress, 72, 96);

  const digest = await digestPromise;
  const sha256 = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  onProgress?.({ stage: "COMPLETE", percent: 100 });

  return {
    sha256,
    workbook: {
      filename: file.name,
      sheets: [planning, scheduling],
    },
  };
}
