export function wallDateFromInstant(
  instant: string | number | Date,
  timezoneOffsetMinutes: number,
): string {
  const ms = instant instanceof Date ? instant.getTime() : typeof instant === "number" ? instant : new Date(instant).getTime();
  if (!Number.isFinite(ms)) throw new Error("Invalid timestamp for plant wall-clock conversion.");
  return new Date(ms + timezoneOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function wallTimestampFromInstant(
  instant: string | number | Date,
  timezoneOffsetMinutes: number,
): string {
  const ms = instant instanceof Date ? instant.getTime() : typeof instant === "number" ? instant : new Date(instant).getTime();
  if (!Number.isFinite(ms)) throw new Error("Invalid timestamp for plant wall-clock conversion.");
  return new Date(ms + timezoneOffsetMinutes * 60_000).toISOString().slice(0, 19).replace("T", " ");
}

export function plantToday(timezoneOffsetMinutes: number): string {
  return wallDateFromInstant(Date.now(), timezoneOffsetMinutes);
}

export function compactDate(wallDate: string): string {
  return wallDate.replaceAll("-", "");
}

export function ddMonFromWallDate(wallDate: string): string {
  const match = wallDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid plant date ${wallDate}.`);
  const month = Number(match[2]);
  const mon = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][month - 1];
  if (!mon) throw new Error(`Invalid plant date ${wallDate}.`);
  return `${match[3]}${mon}`;
}
