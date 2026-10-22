// CSV cells, safe to open in Excel or Sheets.

/**
 * Quotes when needed, and defuses formula injection: a cell starting with = + - @ tab or CR is
 * prefixed with an apostrophe so spreadsheets treat it as text, not a formula (FR-15).
 */
export function csvCell(v: string | number | boolean | null | undefined) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvRow = (cells: Parameters<typeof csvCell>[0][]) => cells.map(csvCell).join(",");
