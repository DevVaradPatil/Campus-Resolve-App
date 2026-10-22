import { CONFIG_SCHEMAS, type ConfigKind } from "@/lib/domain/schemas";
import { requirePermission, requireUser } from "@/lib/server/auth";
import { saveConfigItem } from "@/lib/server/config";
import { HttpError, readJson, route } from "@/lib/server/http";
import { z } from "zod";

const PERMISSION = {
  categories: "categories.manage",
  locations: "categories.manage",
  contacts: "contacts.manage",
  routingRules: "contacts.manage",
} as const;

/** Upserts one config item. Deactivate instead of deleting, so old complaints keep their labels. */
export const PUT = route(async (req, ctx: RouteContext<"/api/admin/config/[kind]">) => {
  const user = await requireUser(req);
  const { kind } = await ctx.params;
  if (!(kind in CONFIG_SCHEMAS)) throw new HttpError(404, "Not found.");
  requirePermission(user, PERMISSION[kind as ConfigKind]);
  const body = await readJson(req, z.unknown());
  return Response.json(await saveConfigItem(user, kind as ConfigKind, body));
});
