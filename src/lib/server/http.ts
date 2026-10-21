import "server-only";
import { ZodError, type ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, "Sign in to continue.");
export const forbidden = () => new HttpError(403, "You don't have permission to do that.");

/**
 * Wraps a route handler: known errors become JSON responses; anything else is logged
 * server-side and returned as a generic 500 so internals never reach the client.
 */
export function route<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError)
        return Response.json({ error: e.message, ...e.extra }, { status: e.status });
      if (e instanceof ZodError)
        return Response.json(
          {
            error: "Some fields need fixing.",
            fields: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
          { status: 400 },
        );
      console.error("Unhandled route error", e instanceof Error ? e.stack : e);
      return Response.json(
        { error: "Something went wrong on our side. Try again." },
        { status: 500 },
      );
    }
  };
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
  return schema.parse(body);
}

/** First hop of x-forwarded-for (set by the hosting proxy), else a fixed bucket. */
export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
