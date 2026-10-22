import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("App Check in route() (PRD §12.3)", () => {
  const load = async (mode: string) => {
    vi.stubEnv("APP_CHECK", mode);
    vi.resetModules();
    return (await import("./http")).route;
  };
  const ok = async () => Response.json({ ok: true });
  const call = (r: Awaited<ReturnType<typeof load>>, header?: string, opts = {}) =>
    r(ok, opts)(
      new Request("http://localhost/api/x", {
        headers: header ? { "x-firebase-appcheck": header } : {},
      }),
      undefined,
    );

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("enforce refuses missing and invalid tokens", async () => {
    const r = await load("enforce");
    expect((await call(r)).status).toBe(401);
    expect((await call(r, "not-a-real-token")).status).toBe(401);
  });

  it("monitor logs and lets the request through", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await load("monitor");
    expect((await call(r)).status).toBe(200);
    expect(warn).toHaveBeenCalledWith("App Check missing: GET /api/x");
  });

  it("off, and routes that opt out, skip the check", async () => {
    expect((await call(await load("off"))).status).toBe(200);
    expect((await call(await load("enforce"), undefined, { appCheck: false })).status).toBe(200);
  });
});
