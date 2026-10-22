import { requireUser } from "@/lib/server/auth";
import { dashboard } from "@/lib/server/dashboard";
import { route } from "@/lib/server/http";

const RANGES = [7, 30, 90];

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const days = Number(new URL(req.url).searchParams.get("days"));
  return Response.json(await dashboard(user, RANGES.includes(days) ? days : 30));
});
