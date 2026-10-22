import { requireUser } from "@/lib/server/auth";
import { loadConfig } from "@/lib/server/config";
import { forbidden, route } from "@/lib/server/http";
import { can } from "@/lib/domain/permissions";

export const GET = route(async (req) => {
  const user = await requireUser(req);
  if (!can(user, "categories.manage") && !can(user, "contacts.manage")) throw forbidden();
  return Response.json(await loadConfig());
});
