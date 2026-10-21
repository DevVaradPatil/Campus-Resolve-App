import { setRole } from "@/lib/server/accounts";
import { requirePermission, requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";
import { setRoleInput } from "@/lib/domain/schemas";

export const POST = route(async (req, ctx: RouteContext<"/api/admin/users/[uid]/role">) => {
  const user = await requireUser(req);
  requirePermission(user, "roles.manage");
  const { uid } = await ctx.params;
  await setRole(user, uid, await readJson(req, setRoleInput));
  return Response.json({ ok: true });
});
