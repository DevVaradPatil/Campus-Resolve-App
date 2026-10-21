import { describe, expect, it } from "vitest";
import { can } from "./permissions";

describe("can", () => {
  it("gives students nothing privileged", () => {
    expect(can({ role: "student" }, "complaints.manage")).toBe(false);
    expect(can({ role: "student", grants: ["export"] }, "export")).toBe(false);
  });
  it("gives committee escalate + moderate, extras only via grants", () => {
    expect(can({ role: "committee" }, "complaints.escalate")).toBe(true);
    expect(can({ role: "committee" }, "export")).toBe(false);
    expect(can({ role: "committee", grants: ["export"] }, "export")).toBe(true);
  });
  it("never lets a grant unlock roster, roles or confidential access", () => {
    const grants = ["roster.manage", "roles.manage", "confidential.view"];
    expect(can({ role: "committee", grants }, "roster.manage")).toBe(false);
    expect(can({ role: "committee", grants }, "roles.manage")).toBe(false);
    expect(can({ role: "committee", grants }, "confidential.view")).toBe(false);
  });
  it("gives admins everything", () => {
    expect(can({ role: "admin" }, "roles.manage")).toBe(true);
  });
});
