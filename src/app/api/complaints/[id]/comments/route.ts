import { commentInput } from "@/lib/domain/schemas";
import { requireUser } from "@/lib/server/auth";
import { addComment, listComments } from "@/lib/server/community";
import { HttpError, readJson, route } from "@/lib/server/http";

const checkId = (id: string) => {
  if (!/^[a-f0-9]{20}$/.test(id)) throw new HttpError(404, "Not found.");
};

export const GET = route(async (req, ctx: RouteContext<"/api/complaints/[id]/comments">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  checkId(id);
  const before = new URL(req.url).searchParams.get("before");
  return Response.json(await listComments(user, id, before?.match(/^\w{1,40}$/) ? before : null));
});

export const POST = route(async (req, ctx: RouteContext<"/api/complaints/[id]/comments">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  checkId(id);
  const { body } = await readJson(req, commentInput);
  return Response.json(await addComment(user, id, body));
});
