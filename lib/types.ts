export type RawCell = {
  v: string | number | boolean | null;
  f?: string;
  t?: string;
};

export type RawRow = {
  rowNo: number;
  cells: Record<string, RawCell | null>;
};

export type SourceColumn = {
  excelColumn: string;
  columnOrder: number;
  headerRow1: string | null;
  headerRow2: string | null;
  headerRow3: string | null;
};

export type ParsedSheet = {
  key: "planning" | "scheduling" | "routing";
  name: string;
  totalRows: number;
  totalColumns: number;
  headerRows: number;
  columns: SourceColumn[];
  rows: RawRow[];
};

export type ParsedWorkbook = {
  filename: string;
  sheets: ParsedSheet[];
};


export type ParsedRoutingWorkbook = {
  filename: string;
  sheet: ParsedSheet;
};

export type ParserSourceProfile = {
  sourceKey: "PLANNING" | "SCHEDULING" | "ROUTING";
  displayName: string;
  sheetName: string | null;
  headerRows: number;
  baselineColumns: number;
  operationSlots: number | null;
  parserConfig: Record<string, unknown>;
};

export type ParserConfigBundle = {
  planning: ParserSourceProfile;
  scheduling: ParserSourceProfile;
  routing: ParserSourceProfile;
};
