import { hideCommentInput } from "@/lib/domain/schemas";
import { requirePermission, requireUser } from "@/lib/server/auth";
import { hideComment } from "@/lib/server/community";
import { HttpError, readJson, route } from "@/lib/server/http";

export const POST = route(
  async (req, ctx: RouteContext<"/api/complaints/[id]/comments/[commentId]/hide">) => {
    const user = await requireUser(req);
    requirePermission(user, "content.moderate");
    const { id, commentId } = await ctx.params;
    if (!/^[a-f0-9]{20}$/.test(id) || !/^\w{1,40}$/.test(commentId))
      throw new HttpError(404, "Not found.");
    const { reason } = await readJson(req, hideCommentInput);
    await hideComment(user, id, commentId, reason);
    return Response.json({ ok: true });
  },
);
