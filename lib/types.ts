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
  key: "planning" | "scheduling";
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
