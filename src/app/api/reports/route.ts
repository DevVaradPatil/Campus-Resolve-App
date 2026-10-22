import { reportInput } from "@/lib/domain/schemas";
import { requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";
import { createReport } from "@/lib/server/moderation";

/** Report a complaint, comment or photo to the moderators. */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  await createReport(user, await readJson(req, reportInput));
  return Response.json({ ok: true });
});
