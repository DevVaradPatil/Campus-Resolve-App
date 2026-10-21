import { describe, expect, it } from "vitest";
import { diffRoster, parseCsv, parseRosterCsv } from "./roster";

const HEADER = "rollNumber,name,block,floor,room,eligible";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and blank lines", () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n\r\n1,2,3\n')).toEqual([
      ["a", "b,c", 'd "e"'],
      ["1", "2", "3"],
    ]);
  });
});

describe("parseRosterCsv", () => {
  it("parses valid rows and normalizes roll numbers", () => {
    const { rows, errors } = parseRosterCsv(`${HEADER}\n23-1045,Asha Rao,B,2,214,yes`);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ rollNumber: "231045", block: "B", eligible: true });
  });
  it("reports missing columns", () => {
    expect(parseRosterCsv("rollNumber,name\n1234,x").errors[0]).toMatch(/Missing column/);
  });
  it("reports bad rows with line numbers and keeps good ones", () => {
    const { rows, errors } = parseRosterCsv(
      `${HEADER}\n1234,A,B,1,1,yes\n12,A,B,1,1,yes\n1234,A,B,1,1,yes\n5678,A,B,1,1,maybe\n9999,A,,1,1,no`,
    );
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([
      'Line 3: "12" is not a roll number.',
      "Line 4: 1234 appears more than once.",
      "Line 5: eligible must be yes or no.",
      "Line 6: block is required.",
    ]);
  });
});

describe("diffRoster", () => {
  const base = { name: "A", block: "B", floor: "1", room: "1", eligible: true };
  it("classifies add / update / remove / unchanged", () => {
    const d = diffRoster(
      [
        { rollNumber: "1111", ...base },
        { rollNumber: "2222", ...base },
        { rollNumber: "3333", ...base },
        { rollNumber: "4444", ...base, eligible: false },
      ],
      [
        { rollNumber: "1111", ...base },
        { rollNumber: "2222", ...base, room: "9" },
        { rollNumber: "5555", ...base },
      ],
    );
    expect(d.unchanged).toBe(1);
    expect(d.update.map((u) => u.after.rollNumber)).toEqual(["2222"]);
    expect(d.add.map((a) => a.rollNumber)).toEqual(["5555"]);
    // Already-ineligible students aren't "removed" again.
    expect(d.remove.map((r) => r.rollNumber)).toEqual(["3333"]);
  });
});
