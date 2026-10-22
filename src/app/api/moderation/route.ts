import { requirePermission, requireUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { listReports } from "@/lib/server/moderation";

export const GET = route(async (req) => {
  const user = await requireUser(req);
  requirePermission(user, "content.moderate");
  const after = new URL(req.url).searchParams.get("after");
  return Response.json(await listReports(user, after?.match(/^[a-f0-9]{32}$/) ? after : null));
});
