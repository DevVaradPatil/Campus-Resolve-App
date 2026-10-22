import { requireUser } from "@/lib/server/auth";
import { listMine } from "@/lib/server/complaints";
import { route } from "@/lib/server/http";

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const after = new URL(req.url).searchParams.get("after");
  return Response.json(await listMine(user, after?.slice(0, 40) || null));
});
