import { requireUser } from "@/lib/server/auth";
import { addPhoto } from "@/lib/server/complaints";
import { HttpError, route } from "@/lib/server/http";

// One photo per request (multipart field "photo"), so a failure affects only that photo.
export const POST = route(async (req, ctx: RouteContext<"/api/complaints/[id]/photos">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{20}$/.test(id)) throw new HttpError(404, "Not found.");
  // Reject obviously oversized bodies before buffering them.
  if (Number(req.headers.get("content-length")) > 6 * 1024 * 1024)
    throw new HttpError(413, "Each photo must be 5 MB or smaller.");
  const photo = await req
    .formData()
    .then((f) => f.get("photo"))
    .catch(() => null);
  if (!(photo instanceof File)) throw new HttpError(400, "Attach one photo.");
  return Response.json(await addPhoto(user, id, photo));
});
