import type { RawCell, RawRow } from "@/lib/types";

export function rawValue(row: RawRow, column: string): string | number | boolean | null {
  const cell: RawCell | null | undefined = row.cells[column];
  return cell?.v ?? null;
}

export function asText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text === "" ? null : text;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function asInteger(value: unknown): number | null {
  const n = asNumber(value);
  return n == null ? null : Math.trunc(n);
}

export function excelSerialToDate(value: unknown): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const serial = asNumber(value);
  if (serial == null) return null;
  const days = Math.floor(serial);
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + days * 86_400_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function excelFractionToTime(value: unknown): string | null {
  if (typeof value === "string" && /^\d{1,2}:\d{2}/.test(value.trim())) {
    const text = value.trim();
    return text.length === 5 ? `${text}:00` : text.slice(0, 8);
  }
  const serial = asNumber(value);
  if (serial == null) return null;
  const fraction = ((serial % 1) + 1) % 1;
  let seconds = Math.round(fraction * 86_400) % 86_400;
  const h = Math.floor(seconds / 3600);
  seconds -= h * 3600;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function excelDurationToMinutes(value: unknown): number | null {
  const n = asNumber(value);
  return n == null ? null : n * 1440;
}

export function isNonBlank(value: unknown): boolean {
  return value !== null && value !== undefined && String(value) !== "";
}
