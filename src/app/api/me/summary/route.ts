import { requireUser } from "@/lib/server/auth";
import { mySummary } from "@/lib/server/dashboard";
import { route } from "@/lib/server/http";

/** The caller's own complaint counts, for the feed's summary strip. */
export const GET = route(async (req) => Response.json(await mySummary(await requireUser(req))));
