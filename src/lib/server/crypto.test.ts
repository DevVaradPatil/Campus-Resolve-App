import { describe, expect, it } from "vitest";
import {
  DUMMY_HASH,
  generateActivationCode,
  hashActivationCode,
  hashPassword,
  normalizeActivationCode,
  verifyPassword,
} from "./crypto";

describe("passwords", () => {
  it("verifies the right password only", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong horse battery", h)).toBe(false);
  });
  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
  it("never accepts anything against the dummy hash", async () => {
    expect(await verifyPassword("", DUMMY_HASH)).toBe(false);
  });
});

describe("activation codes", () => {
  it("are 10 unambiguous chars shown as XXXXX-XXXXX", () => {
    const c = generateActivationCode();
    expect(c).toMatch(/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
  });
  it("hash the same regardless of case, spaces or dashes, and bind to the roll number", () => {
    expect(hashActivationCode("1234", "abcde-fghjk")).toBe(
      hashActivationCode("1234", " ABCDE FGHJK"),
    );
    expect(hashActivationCode("1234", "ABCDEFGHJK")).not.toBe(
      hashActivationCode("5678", "ABCDEFGHJK"),
    );
    expect(normalizeActivationCode("ab-c d")).toBe("ABCD");
  });
});
