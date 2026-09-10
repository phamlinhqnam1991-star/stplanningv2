import * as XLSX from "xlsx";
import { SOURCE_SHEETS, excelColumnLetter } from "@/lib/source-model";
import type { ParsedSheet, ParsedWorkbook, RawCell, RawRow, SourceColumn } from "@/lib/types";
import type { ParseProgress } from "@/lib/excel-parser";

type ParseRequest = {
  type: "PARSE";
  filename: string;
  buffer: ArrayBuffer;
};

type ProgressMessage = {
  type: "PROGRESS";
  progress: ParseProgress;
};

type DoneMessage = {
  type: "DONE";
  workbook: ParsedWorkbook;
  sha256: string;
};

type ErrorMessage = {
  type: "ERROR";
  error: string;
};

function postProgress(progress: ParseProgress) {
  const message: ProgressMessage = { type: "PROGRESS", progress };
  self.postMessage(message);
}

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

function parseSheet(
  workbook: XLSX.WorkBook,
  key: "planning" | "scheduling",
  progressStart: number,
  progressEnd: number
): ParsedSheet {
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

  // Row-by-row sparse extraction. This deliberately avoids Object.keys(sheet)
  // on the UI thread and sends no work back to React until parsing is complete.
  // Blank cells remain implicit while row/column positions remain exact.
  const rows: RawRow[] = new Array(totalRows);
  const progressEveryRows = key === "planning" ? 50 : 100;

  for (let row = 1; row <= totalRows; row++) {
    const cells: RawRow["cells"] = {};

    for (let col = 1; col <= totalColumns; col++) {
      const address = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
      const source = sheet[address] as XLSX.CellObject | undefined;
      if (!source || (source.v === undefined && !source.f)) continue;
      cells[excelColumnLetter(col)] = rawCell(source);
    }

    rows[row - 1] = { rowNo: row, cells };

    if (row % progressEveryRows === 0 || row === totalRows) {
      const ratio = totalRows ? row / totalRows : 1;
      postProgress({
        stage: "PARSING",
        sheet: config.name,
        percent: Math.round(progressStart + ratio * (progressEnd - progressStart)),
      });
    }
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

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  const request = event.data;
  if (!request || request.type !== "PARSE") return;

  try {
    postProgress({ stage: "DECODING", percent: 10 });

    // Start hashing before the synchronous XLSX decode. WebCrypto is asynchronous
    // and both tasks operate entirely outside the browser UI thread.
    const digestPromise = sha256Hex(request.buffer);

    const workbook = XLSX.read(request.buffer, {
      type: "array",
      cellDates: false,
      cellFormula: true,
      sheets: [SOURCE_SHEETS.planning.name, SOURCE_SHEETS.scheduling.name],
    });

    postProgress({ stage: "DECODING", percent: 20 });

    const planning = parseSheet(workbook, "planning", 20, 76);
    const scheduling = parseSheet(workbook, "scheduling", 76, 98);
    const sha256 = await digestPromise;

    const result: DoneMessage = {
      type: "DONE",
      sha256,
      workbook: {
        filename: request.filename,
        sheets: [planning, scheduling],
      },
    };

    postProgress({ stage: "COMPLETE", percent: 100 });
    self.postMessage(result);
  } catch (error) {
    const message: ErrorMessage = {
      type: "ERROR",
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(message);
  }
};

export {};
