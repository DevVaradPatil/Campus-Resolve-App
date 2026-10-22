import { requirePermission, requireUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { listCommittee } from "@/lib/server/queue";
import { maybeSweep } from "@/lib/server/sweep";

export const GET = route(async (req) => {
  const user = await requireUser(req);
  requirePermission(user, "complaints.escalate");
  await maybeSweep();
  return Response.json(await listCommittee());
});
