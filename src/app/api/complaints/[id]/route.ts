import { requireUser } from "@/lib/server/auth";
import { getComplaint } from "@/lib/server/complaints";
import { HttpError, route } from "@/lib/server/http";

export const GET = route(async (req, ctx: RouteContext<"/api/complaints/[id]">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{20}$/.test(id)) throw new HttpError(404, "Not found.");
  return Response.json(await getComplaint(user, id));
});
