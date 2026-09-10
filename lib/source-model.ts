export const SOURCE_SHEETS = {
  planning: {
    name: "SirusClean_Painting_MasterList",
    headerRows: 3,
    baselineColumns: 148,
  },
  scheduling: {
    name: "Main Planning",
    headerRows: 2,
    baselineColumns: 38,
  },
} as const;

export type SourceSheetKey = keyof typeof SOURCE_SHEETS;

export const PLANNING_OPERATION_RANGE = { start: 13, end: 48 } as const;

export const SCHEDULING_RESOURCE_COLUMNS: Record<number, string> = {
  4: "SPX_CLEAN",
  5: "MANUAL_DBL",
  6: "AUTO_DBL",
  7: "PLATING",
  8: "HE_BAKE",
  9: "PASSIVATION",
  10: "MANUAL_SP",
  11: "AUTO_SHP",
  12: "FLYBAR",
  13: "CAB1",
  14: "CAB2",
  15: "CAB3",
  16: "PAINT_POWDER",
};

export function excelColumnLetter(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function excelColumnNumber(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}

type SourceMetadata = {
  businessGroup: string;
  phase1Strategy: "NORMALIZE NOW" | "RAW FIRST" | "RAW + REVIEW";
  targetTable: string;
  targetField: string;
  sourceDataType: string;
};

const planningCore: Record<number, [string, string]> = {
  1: ["program", "text"],
  2: ["part_cluster", "text"],
  3: ["epicor_part", "text"],
  4: ["surface_dm2", "numeric"],
  5: ["part_description", "text"],
  6: ["job_num", "text"],
  7: ["last_labor_op", "text"],
  8: ["next_operation", "text"],
  9: ["last_labor_qty", "numeric"],
  10: ["prod_qty", "numeric"],
  11: ["current_good_wip_qty", "numeric"],
  49: ["st_source_value", "text"],
  50: ["st_wip_area", "text"],
  51: ["wip_sequence", "text"],
  52: ["all_operation", "text"],
};

const schedulingCore: Record<number, [string, string]> = {
  1: ["schedule_date", "date"],
  2: ["day_label", "text"],
  3: ["slot_no", "integer"],
  17: ["batch_ref", "text"],
  18: ["recipe_no", "text"],
  19: ["recipe_description", "text"],
  20: ["job_count", "integer"],
  21: ["pcs", "numeric"],
  22: ["surface_dm2", "numeric"],
  23: ["start_time", "time"],
  24: ["end_time", "time"],
  25: ["duration_minutes", "numeric"],
  36: ["status", "text"],
  37: ["comments", "text"],
};

function planningGroup(order: number): string {
  if (order <= 12) return "Job & WIP Core";
  if (order <= 48) return "ST Operation Planning State";
  if (order <= 52) return "ST Routing & WIP Control";
  if (order <= 94) return "Part / Recipe / Priority Reference";
  if (order <= 98) return "Sirius Cleaning Standards";
  if (order <= 118) return "Masking / Marking Standards";
  if (order <= 124) return "Flybar / Scan Tracking";
  if (order <= 137) return "Blasting / Bake / Plating Parameters";
  if (order <= 147) return "Additional Recipe Information";
  return "Review";
}

function schedulingGroup(order: number): string {
  if (order <= 3) return "Schedule Identity";
  if (order <= 16) return "Resource Lanes";
  if (order <= 25) return "Batch & Schedule Core";
  if (order <= 35) return "Schedule Helper Parameters";
  if (order <= 37) return "Status / Comments";
  return "Review";
}

export function sourceColumnMetadata(key: SourceSheetKey, order: number): SourceMetadata {
  if (key === "planning") {
    const core = planningCore[order];
    if (core) {
      return { businessGroup: planningGroup(order), phase1Strategy: "NORMALIZE NOW", targetTable: "planning_jobs", targetField: core[0], sourceDataType: core[1] };
    }
    if (order >= PLANNING_OPERATION_RANGE.start && order <= PLANNING_OPERATION_RANGE.end) {
      return { businessGroup: planningGroup(order), phase1Strategy: "NORMALIZE NOW", targetTable: "planning_job_operations", targetField: "source_value", sourceDataType: "text" };
    }
    if (order === 12 || order === 148) {
      return { businessGroup: planningGroup(order), phase1Strategy: "RAW + REVIEW", targetTable: "raw_sheet_rows", targetField: "row_data", sourceDataType: "jsonb" };
    }
    return { businessGroup: planningGroup(order), phase1Strategy: "RAW FIRST", targetTable: "raw_sheet_rows", targetField: "row_data", sourceDataType: "jsonb" };
  }

  const core = schedulingCore[order];
  if (core) {
    return { businessGroup: schedulingGroup(order), phase1Strategy: "NORMALIZE NOW", targetTable: "schedule_blocks", targetField: core[0], sourceDataType: core[1] };
  }
  if (SCHEDULING_RESOURCE_COLUMNS[order]) {
    return { businessGroup: schedulingGroup(order), phase1Strategy: "NORMALIZE NOW", targetTable: "schedule_resource_assignments", targetField: "batch_ref", sourceDataType: "text" };
  }
  if (order === 38) {
    return { businessGroup: schedulingGroup(order), phase1Strategy: "RAW + REVIEW", targetTable: "raw_sheet_rows", targetField: "row_data", sourceDataType: "jsonb" };
  }
  return { businessGroup: schedulingGroup(order), phase1Strategy: "RAW FIRST", targetTable: "raw_sheet_rows", targetField: "row_data", sourceDataType: "jsonb" };
}
