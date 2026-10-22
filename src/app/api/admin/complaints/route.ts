import { queueQuery } from "@/lib/domain/schemas";
import { requirePermission, requireUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { listQueue } from "@/lib/server/queue";
import { maybeSweep } from "@/lib/server/sweep";

export const GET = route(async (req) => {
  const user = await requireUser(req);
  requirePermission(user, "complaints.manage");
  const params = queueQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  await maybeSweep(); // D3: admin visits also run overdue checks between cron runs
  return Response.json(await listQueue(user, params));
});
