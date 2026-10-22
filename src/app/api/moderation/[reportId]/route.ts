import { resolveReportInput } from "@/lib/domain/schemas";
import { requirePermission, requireUser } from "@/lib/server/auth";
import { HttpError, readJson, route } from "@/lib/server/http";
import { resolveReport } from "@/lib/server/moderation";

export const POST = route(async (req, ctx: RouteContext<"/api/moderation/[reportId]">) => {
  const user = await requireUser(req);
  requirePermission(user, "content.moderate");
  const { reportId } = await ctx.params;
  if (!/^[a-f0-9]{32}$/.test(reportId)) throw new HttpError(404, "Not found.");
  const { action } = await readJson(req, resolveReportInput);
  await resolveReport(user, reportId, action);
  return Response.json({ ok: true });
});
