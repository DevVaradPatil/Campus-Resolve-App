import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "./csv";

describe("csvCell", () => {
  it("defuses spreadsheet formulas (FR-15)", () => {
    for (const f of ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\tx", "\rx"])
      expect(csvCell(f).replace(/^"/, "").startsWith("'")).toBe(true);
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
  });
  it("leaves numbers alone, quotes separators and escapes quotes", () => {
    expect(csvRow([-3, true, null, "a,b", 'say "hi"', "line\nbreak"])).toBe(
      `-3,true,,"a,b","say ""hi""","line\nbreak"`,
    );
  });
});
