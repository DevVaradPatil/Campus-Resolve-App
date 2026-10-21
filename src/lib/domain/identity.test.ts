import { describe, expect, it } from "vitest";
import { normalizeRollNumber, toLoginId } from "./identity";

describe("normalizeRollNumber", () => {
  it("uppercases and strips spaces and dashes", () => {
    expect(normalizeRollNumber(" 23-10 45 ")).toBe("231045");
    expect(normalizeRollNumber("ab12cd")).toBe("AB12CD");
  });
  it("rejects junk", () => {
    for (const bad of ["", "12", "1234567890123", "12;DROP", "admin:x"])
      expect(normalizeRollNumber(bad)).toBeNull();
  });
});

describe("toLoginId", () => {
  it("routes admin: prefix to the admin namespace", () => {
    expect(toLoginId("Admin:Varad.P")).toBe("admin:varad.p");
    expect(toLoginId("admin:x")).toBeNull();
  });
  it("treats everything else as a roll number", () => {
    expect(toLoginId("231045")).toBe("231045");
  });
});
