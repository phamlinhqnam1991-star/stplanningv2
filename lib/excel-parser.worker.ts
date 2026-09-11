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

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

type WorkbookSheetRef = {
  name: string;
  relId: string;
};

const utf8 = new TextDecoder("utf-8");

function postProgress(progress: ParseProgress) {
  const message: ProgressMessage = { type: "PROGRESS", progress };
  self.postMessage(message);
}

function decodeXml(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(?:#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (entity) => {
    if (entity === "&amp;") return "&";
    if (entity === "&lt;") return "<";
    if (entity === "&gt;") return ">";
    if (entity === "&quot;") return '"';
    if (entity === "&apos;") return "'";
    if (entity.startsWith("&#x")) {
      const code = Number.parseInt(entity.slice(3, -1), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    if (entity.startsWith("&#")) {
      const code = Number.parseInt(entity.slice(2, -1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return entity;
  });
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) attrs[match[1]] = decodeXml(match[2]);
  return attrs;
}

function findEndOfCentralDirectory(view: DataView): number {
  const min = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= min; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("The selected file is not a valid XLSX/ZIP workbook.");
}

function readZipDirectory(buffer: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(buffer);
  const eocd = findEndOfCentralDirectory(view);
  const totalEntries = view.getUint16(eocd + 10, true);
  const centralDirectoryOffset = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();
  let offset = centralDirectoryOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Invalid XLSX ZIP central directory.");
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = new Uint8Array(buffer, offset + 46, nameLength);
    const name = utf8.decode(nameBytes).replace(/\\/g, "/");

    entries.set(name, {
      name,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser does not support native XLSX decompression. Please use a current Chrome or Edge version.");
  }

  // TypeScript 5.9 models Uint8Array with ArrayBufferLike, which may include
  // SharedArrayBuffer. BlobPart only accepts an ArrayBuffer-backed view.
  // Make a small owned copy so the Blob input is guaranteed to be ArrayBuffer.
  const owned = new Uint8Array(data.byteLength);
  owned.set(data);

  const stream = new Blob([owned.buffer])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const out = await new Response(stream).arrayBuffer();
  return new Uint8Array(out);
}

async function unzipEntry(buffer: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(buffer);
  const offset = entry.localHeaderOffset;
  if (view.getUint32(offset, true) !== 0x04034b50) {
    throw new Error(`Invalid local ZIP header for ${entry.name}.`);
  }
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataOffset = offset + 30 + nameLength + extraLength;
  const compressed = new Uint8Array(buffer, dataOffset, entry.compressedSize);

  if (entry.method === 0) return compressed.slice();
  if (entry.method === 8) return inflateRaw(compressed);
  throw new Error(`Unsupported XLSX ZIP compression method ${entry.method} in ${entry.name}.`);
}

async function readZipText(buffer: ArrayBuffer, entries: Map<string, ZipEntry>, name: string): Promise<string> {
  const normalized = name.replace(/^\//, "").replace(/\\/g, "/");
  const entry = entries.get(normalized);
  if (!entry) throw new Error(`Required workbook part not found: ${normalized}`);
  return utf8.decode(await unzipEntry(buffer, entry));
}

function normalizeRelationshipTarget(target: string): string {
  const clean = target.replace(/\\/g, "/").replace(/^\//, "");
  if (clean.startsWith("xl/")) return clean;
  return `xl/${clean.replace(/^\.\//, "")}`;
}

function parseWorkbookSheetRefs(xml: string): WorkbookSheetRef[] {
  const out: WorkbookSheetRef[] = [];
  const re = /<sheet\b([^>]*?)(?:\/>|>)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const attrs = parseAttributes(match[1]);
    if (attrs.name && attrs["r:id"]) out.push({ name: attrs.name, relId: attrs["r:id"] });
  }
  return out;
}

function parseWorkbookRelationships(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /<Relationship\b([^>]*?)(?:\/>|>)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const attrs = parseAttributes(match[1]);
    if (attrs.Id && attrs.Target) out.set(attrs.Id, normalizeRelationshipTarget(attrs.Target));
  }
  return out;
}

function extractTextNodes(xml: string): string {
  let out = "";
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) out += decodeXml(match[1]);
  return out;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) out.push(extractTextNodes(match[1]));
  return out;
}

function parseDimension(xml: string): { totalRows: number; totalColumns: number } {
  const match = /<dimension\b[^>]*\bref="([^"]+)"/.exec(xml);
  if (!match) throw new Error("Worksheet dimension is missing.");
  const end = match[1].split(":").pop() ?? match[1];
  const coord = /^([A-Z]+)(\d+)$/i.exec(end);
  if (!coord) throw new Error(`Unsupported worksheet dimension: ${match[1]}`);
  let totalColumns = 0;
  for (const ch of coord[1].toUpperCase()) totalColumns = totalColumns * 26 + ch.charCodeAt(0) - 64;
  return { totalRows: Number(coord[2]), totalColumns };
}

function parseCellValue(cellXml: string, attrs: Record<string, string>, sharedStrings: string[]): RawCell | null {
  const type = attrs.t;
  const formulaMatch = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(cellXml);
  const inlineFormula = formulaMatch ? decodeXml(formulaMatch[1]) : undefined;

  let value: string | number | boolean | null = null;
  let hasValue = false;

  if (type === "inlineStr") {
    const isMatch = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(cellXml);
    if (isMatch) {
      value = extractTextNodes(isMatch[1]);
      hasValue = true;
    }
  } else {
    const valueMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cellXml);
    if (valueMatch) {
      const raw = decodeXml(valueMatch[1]);
      hasValue = true;
      if (type === "s") {
        const index = Number(raw);
        value = Number.isInteger(index) && index >= 0 && index < sharedStrings.length ? sharedStrings[index] : raw;
      } else if (type === "b") {
        value = raw === "1";
      } else if (type === "str" || type === "e" || type === "d") {
        value = raw;
      } else {
        const numeric = Number(raw);
        value = raw !== "" && Number.isFinite(numeric) ? numeric : raw;
      }
    }
  }

  if (!hasValue && inlineFormula === undefined) return null;
  // Empty source cells are implicit in the RAW model. Keeping hundreds of
  // thousands of styled empty cells would only increase clone/upload cost.
  // Formula cells remain explicit even when their cached result is blank.
  if ((value === "" || value === null) && inlineFormula === undefined) return null;

  const cell: RawCell = { v: value };
  if (inlineFormula !== undefined) cell.f = inlineFormula;
  if (type) cell.t = type;
  return cell;
}

function normalizedHeader(cell: RawCell | null): string {
  if (!cell || cell.v == null) return "";
  return String(cell.v).replace(/\s+/g, " ").trim().toUpperCase();
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

function rowCell(rows: RawRow[], rowNo: number, column: string): RawCell | null {
  return rows[rowNo - 1]?.cells[column] ?? null;
}

function parseWorksheetXml(
  xml: string,
  sharedStrings: string[],
  key: "planning" | "scheduling",
  progressStart: number,
  progressEnd: number
): ParsedSheet {
  const config = SOURCE_SHEETS[key];
  const { totalRows, totalColumns } = parseDimension(xml);

  if (totalColumns < config.baselineColumns) {
    throw new Error(`${config.name} has ${totalColumns} columns, but the approved baseline requires at least ${config.baselineColumns}.`);
  }

  const rows: RawRow[] = Array.from({ length: totalRows }, (_, index) => ({ rowNo: index + 1, cells: {} }));
  const rowRe = /<row\b([^>]*?)\/>|<row\b([^>]*?)>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  let parsedRows = 0;
  let lastReported = progressStart;

  while ((rowMatch = rowRe.exec(xml))) {
    const rowAttrs = parseAttributes(rowMatch[1] ?? rowMatch[2] ?? "");
    const rowNo = Number(rowAttrs.r);
    if (!Number.isInteger(rowNo) || rowNo < 1 || rowNo > totalRows) continue;

    const rowXml = rowMatch[3] ?? "";
    const cells: RawRow["cells"] = {};
    const cellRe = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRe.exec(rowXml))) {
      const attrs = parseAttributes(cellMatch[1] ?? cellMatch[2] ?? "");
      const address = attrs.r;
      if (!address) continue;
      const coordinate = /^([A-Z]+)\d+$/i.exec(address);
      if (!coordinate) continue;
      const value = parseCellValue(cellMatch[3] ?? "", attrs, sharedStrings);
      if (value) cells[coordinate[1].toUpperCase()] = value;
    }

    rows[rowNo - 1] = { rowNo, cells };
    parsedRows++;

    if (parsedRows % 50 === 0) {
      const approximateRow = Math.min(totalRows, rowNo);
      const percent = Math.round(progressStart + (approximateRow / totalRows) * (progressEnd - progressStart));
      if (percent > lastReported) {
        lastReported = percent;
        postProgress({ stage: "PARSING", sheet: config.name, percent });
      }
    }
  }

  for (const [letter, expected] of Object.entries(criticalHeaders[key])) {
    const actual = normalizedHeader(rowCell(rows, config.headerRows, letter));
    if (actual !== expected) {
      throw new Error(`${config.name}: expected ${letter}${config.headerRows} to be "${expected}", found "${actual || "<blank>"}".`);
    }
  }

  const columns: SourceColumn[] = [];
  for (let col = 1; col <= totalColumns; col++) {
    const letter = excelColumnLetter(col);
    const text = (row: number): string | null => {
      const cell = rowCell(rows, row, letter);
      return cell?.v == null ? null : String(cell.v);
    };
    columns.push({
      excelColumn: letter,
      columnOrder: col,
      headerRow1: text(1),
      headerRow2: config.headerRows >= 2 ? text(2) : null,
      headerRow3: config.headerRows >= 3 ? text(3) : null,
    });
  }

  postProgress({ stage: "PARSING", sheet: config.name, percent: progressEnd });
  return { key, name: config.name, totalRows, totalColumns, headerRows: config.headerRows, columns, rows };
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
    postProgress({ stage: "LOCATING", percent: 10 });
    const entries = readZipDirectory(request.buffer);

    postProgress({ stage: "UNPACKING", percent: 12, detail: "Workbook metadata" });
    const workbookXml = await readZipText(request.buffer, entries, "xl/workbook.xml");
    const relsXml = await readZipText(request.buffer, entries, "xl/_rels/workbook.xml.rels");
    const refs = parseWorkbookSheetRefs(workbookXml);
    const relationships = parseWorkbookRelationships(relsXml);

    const paths = new Map<string, string>();
    for (const ref of refs) {
      const path = relationships.get(ref.relId);
      if (path) paths.set(ref.name, path);
    }

    const planningPath = paths.get(SOURCE_SHEETS.planning.name);
    const schedulingPath = paths.get(SOURCE_SHEETS.scheduling.name);
    if (!planningPath) throw new Error(`Required worksheet not found: ${SOURCE_SHEETS.planning.name}`);
    if (!schedulingPath) throw new Error(`Required worksheet not found: ${SOURCE_SHEETS.scheduling.name}`);

    postProgress({ stage: "UNPACKING", percent: 14, detail: "Shared strings" });
    const sharedXml = entries.has("xl/sharedStrings.xml")
      ? await readZipText(request.buffer, entries, "xl/sharedStrings.xml")
      : "";
    const sharedStrings = sharedXml ? parseSharedStrings(sharedXml) : [];

    postProgress({ stage: "UNPACKING", percent: 17, sheet: SOURCE_SHEETS.planning.name });
    const planningXml = await readZipText(request.buffer, entries, planningPath);
    postProgress({ stage: "PARSING", percent: 20, sheet: SOURCE_SHEETS.planning.name });
    const planning = parseWorksheetXml(planningXml, sharedStrings, "planning", 20, 76);

    postProgress({ stage: "UNPACKING", percent: 78, sheet: SOURCE_SHEETS.scheduling.name });
    const schedulingXml = await readZipText(request.buffer, entries, schedulingPath);
    postProgress({ stage: "PARSING", percent: 80, sheet: SOURCE_SHEETS.scheduling.name });
    const scheduling = parseWorksheetXml(schedulingXml, sharedStrings, "scheduling", 80, 96);

    // Release the large XML strings before hashing and transferring results.
    postProgress({ stage: "HASHING", percent: 98 });
    const sha256 = await sha256Hex(request.buffer);

    const result: DoneMessage = {
      type: "DONE",
      sha256,
      workbook: { filename: request.filename, sheets: [planning, scheduling] },
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
