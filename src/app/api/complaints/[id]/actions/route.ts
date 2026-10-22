import { workflowInput } from "@/lib/domain/schemas";
import { requireUser } from "@/lib/server/auth";
import { HttpError, readJson, route } from "@/lib/server/http";
import { act } from "@/lib/server/workflow";

/** One endpoint for every workflow action; `act()` decides who may do what. */
export const POST = route(async (req, ctx: RouteContext<"/api/complaints/[id]/actions">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{20}$/.test(id)) throw new HttpError(404, "Not found.");
  await act(user, id, await readJson(req, workflowInput));
  return Response.json({ ok: true });
});
