import { changePassword } from "@/lib/server/accounts";
import { requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";
import { changePasswordInput } from "@/lib/domain/schemas";

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const input = await readJson(req, changePasswordInput);
  return Response.json(await changePassword(user, input));
});
