import { describe, expect, it, vi } from "vitest";
import { HttpError, route } from "./http";

describe("route() error handling (PRD §15.2)", () => {
  it("never sends internal error details to the client", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = route(async () => {
      throw new Error("FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY----- leaked");
    });
    const res = await handler(new Request("http://localhost/x"), undefined);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toMatch(/PRIVATE KEY|leaked|stack|at /);
    expect(JSON.parse(text)).toEqual({ error: "Something went wrong on our side. Try again." });
    log.mockRestore();
  });

  it("passes deliberate HttpErrors through with their status", async () => {
    const res = await route(async () => {
      throw new HttpError(409, "Already done.");
    })(new Request("http://localhost/x"), undefined);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Already done." });
  });
});
