import { z } from "zod";
import { importRoster } from "@/lib/server/accounts";
import { requirePermission, requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";
import { rosterImportInput } from "@/lib/domain/schemas";

const input = rosterImportInput.extend({ apply: z.boolean().default(false) });

export const POST = route(async (req) => {
  const user = await requireUser(req);
  requirePermission(user, "roster.manage");
  const { apply, ...rest } = await readJson(req, input);
  return Response.json(await importRoster(user, rest, apply));
});
