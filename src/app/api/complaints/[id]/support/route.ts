import { requireUser } from "@/lib/server/auth";
import { toggleSupport } from "@/lib/server/community";
import { HttpError, route } from "@/lib/server/http";

/** Toggles "affects me too" for the signed-in user. */
export const POST = route(async (req, ctx: RouteContext<"/api/complaints/[id]/support">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{20}$/.test(id)) throw new HttpError(404, "Not found.");
  return Response.json(await toggleSupport(user, id));
});
