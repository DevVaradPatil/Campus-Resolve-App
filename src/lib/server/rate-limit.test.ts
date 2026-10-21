import { describe, expect, it } from "vitest";
import { step } from "./rate-limit";

const L = { limit: 3, windowSec: 60 };

describe("rate-limit step", () => {
  it("allows up to the limit within a window, then blocks", () => {
    let s: { count: number; windowStart: number } | undefined;
    const results = [0, 1, 2, 3].map((i) => {
      const r = step(s, 1000 + i, L);
      s = r.next;
      return r.allowed;
    });
    expect(results).toEqual([true, true, true, false]);
  });
  it("resets after the window and reports retry time", () => {
    const blocked = step({ count: 3, windowStart: 0 }, 30_000, L);
    expect(blocked).toMatchObject({ allowed: false, retryAfterSec: 30 });
    expect(step({ count: 3, windowStart: 0 }, 60_000, L)).toMatchObject({
      allowed: true,
      next: { count: 1 },
    });
  });
});
