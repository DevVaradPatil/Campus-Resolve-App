import { createComplaintInput } from "@/lib/domain/schemas";
import { requireUser } from "@/lib/server/auth";
import { createComplaint } from "@/lib/server/complaints";
import { readJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const user = await requireUser(req);
  return Response.json(await createComplaint(user, await readJson(req, createComplaintInput)));
});
