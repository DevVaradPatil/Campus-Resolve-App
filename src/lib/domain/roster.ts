import { normalizeRollNumber } from "./identity";

/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

export type RosterRow = {
  rollNumber: string;
  name: string;
  block: string;
  floor: string;
  room: string;
  eligible: boolean;
};

export const ROSTER_COLUMNS = ["rollNumber", "name", "block", "floor", "room", "eligible"] as const;
export const MAX_ROSTER_ROWS = 2000;

const YES = new Set(["yes", "y", "true", "1", "eligible"]);
const NO = new Set(["no", "n", "false", "0", "ineligible"]);

/** Validate a roster CSV. The header row is required and must name the expected columns. */
export function parseRosterCsv(text: string): { rows: RosterRow[]; errors: string[] } {
  const [header, ...body] = parseCsv(text);
  const errors: string[] = [];
  if (!header) return { rows: [], errors: ["The file is empty."] };
  const cols = header.map((h) => h.trim());
  const idx = Object.fromEntries(ROSTER_COLUMNS.map((c) => [c, cols.indexOf(c)]));
  const missing = ROSTER_COLUMNS.filter((c) => idx[c] < 0);
  if (missing.length) return { rows: [], errors: [`Missing column(s): ${missing.join(", ")}`] };
  if (body.length > MAX_ROSTER_ROWS)
    return { rows: [], errors: [`Too many rows (max ${MAX_ROSTER_ROWS}).`] };

  const seen = new Set<string>();
  const rows: RosterRow[] = [];
  body.forEach((r, i) => {
    const line = i + 2;
    const get = (c: (typeof ROSTER_COLUMNS)[number]) => (r[idx[c]] ?? "").trim();
    const roll = normalizeRollNumber(get("rollNumber"));
    const elig = get("eligible").toLowerCase();
    if (!roll)
      return void errors.push(`Line ${line}: "${get("rollNumber")}" is not a roll number.`);
    if (seen.has(roll)) return void errors.push(`Line ${line}: ${roll} appears more than once.`);
    if (!YES.has(elig) && !NO.has(elig))
      return void errors.push(`Line ${line}: eligible must be yes or no.`);
    if (!get("block")) return void errors.push(`Line ${line}: block is required.`);
    const tooLong = (["name", "block", "floor", "room"] as const).find((c) => get(c).length > 80);
    if (tooLong) return void errors.push(`Line ${line}: ${tooLong} is longer than 80 characters.`);
    seen.add(roll);
    rows.push({
      rollNumber: roll,
      name: get("name"),
      block: get("block"),
      floor: get("floor"),
      room: get("room"),
      eligible: YES.has(elig),
    });
  });
  return { rows, errors };
}

type Existing = Pick<RosterRow, "rollNumber" | "name" | "block" | "floor" | "room" | "eligible">;

export type RosterDiff = {
  add: RosterRow[];
  update: { before: Existing; after: RosterRow }[];
  /** In the current roster but not the file; only applied when removeMissing is set. */
  remove: Existing[];
  unchanged: number;
};

export function diffRoster(existing: Existing[], incoming: RosterRow[]): RosterDiff {
  const byRoll = new Map(existing.map((e) => [e.rollNumber, e]));
  const diff: RosterDiff = { add: [], update: [], remove: [], unchanged: 0 };
  for (const row of incoming) {
    const before = byRoll.get(row.rollNumber);
    byRoll.delete(row.rollNumber);
    if (!before) diff.add.push(row);
    else if (ROSTER_COLUMNS.some((c) => before[c] !== row[c]))
      diff.update.push({ before, after: row });
    else diff.unchanged++;
  }
  diff.remove = [...byRoll.values()].filter((e) => e.eligible);
  return diff;
}
