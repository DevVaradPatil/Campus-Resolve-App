import { setActive } from "@/lib/server/accounts";
import { requirePermission, requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";
import { setActiveInput } from "@/lib/domain/schemas";

export const POST = route(async (req, ctx: RouteContext<"/api/admin/users/[uid]/active">) => {
  const user = await requireUser(req);
  requirePermission(user, "roster.manage");
  const { uid } = await ctx.params;
  await setActive(user, uid, (await readJson(req, setActiveInput)).active);
  return Response.json({ ok: true });
});
