import { safeEqual } from "@/lib/server/crypto";
import { env } from "@/lib/server/env";
import { HttpError, route } from "@/lib/server/http";
import { sweep } from "@/lib/server/sweep";

/** Called by .github/workflows/sweep-cron.yml with `Authorization: Bearer $CRON_SECRET`. */
export const POST = route(
  async (req) => {
    const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
    if (!env.CRON_SECRET || !safeEqual(token, env.CRON_SECRET))
      throw new HttpError(401, "Unauthorized.");
    return Response.json(await sweep());
  },
  { appCheck: false },
); // called by GitHub Actions, not the browser app
