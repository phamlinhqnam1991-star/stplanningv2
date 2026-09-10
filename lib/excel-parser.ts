"use client";

import * as XLSX from "xlsx";
import { SOURCE_SHEETS, excelColumnLetter } from "@/lib/source-model";
import type { ParsedSheet, ParsedWorkbook, RawCell, RawRow, SourceColumn } from "@/lib/types";

function serializableValue(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function readCell(sheet: XLSX.WorkSheet, row: number, col: number): RawCell | null {
  const address = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
  const cell = sheet[address] as XLSX.CellObject | undefined;
  if (!cell) return null;
  const out: RawCell = {
    v: serializableValue(cell.v),
  };
  if (cell.f) out.f = cell.f;
  if (cell.t) out.t = cell.t;
  return out;
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

function parseSheet(workbook: XLSX.WorkBook, key: "planning" | "scheduling"): ParsedSheet {
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

  const rows: RawRow[] = [];
  for (let row = 1; row <= totalRows; row++) {
    const cells: Record<string, RawCell | null> = {};
    for (let col = 1; col <= totalColumns; col++) {
      cells[excelColumnLetter(col)] = readCell(sheet, row, col);
    }
    rows.push({ rowNo: row, cells });
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

export async function parseWorkbook(file: File): Promise<{ workbook: ParsedWorkbook; sha256: string }> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer.slice(0));
  const sha256 = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");

  const xlsx = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    cellFormula: true,
  });

  return {
    sha256,
    workbook: {
      filename: file.name,
      sheets: [parseSheet(xlsx, "planning"), parseSheet(xlsx, "scheduling")],
    },
  };
}
