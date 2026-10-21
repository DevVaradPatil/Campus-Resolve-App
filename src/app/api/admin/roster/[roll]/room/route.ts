import { changeRoom } from "@/lib/server/accounts";
import { requirePermission, requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";
import { changeRoomInput } from "@/lib/domain/schemas";

export const POST = route(async (req, ctx: RouteContext<"/api/admin/roster/[roll]/room">) => {
  const user = await requireUser(req);
  requirePermission(user, "roster.manage");
  const { roll } = await ctx.params;
  await changeRoom(user, roll, await readJson(req, changeRoomInput));
  return Response.json({ ok: true });
});
