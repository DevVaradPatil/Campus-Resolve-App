import { login } from "@/lib/server/accounts";
import { clientIp, readJson, route } from "@/lib/server/http";
import { loginInput } from "@/lib/domain/schemas";

export const POST = route(async (req) => {
  const input = await readJson(req, loginInput);
  return Response.json(await login(input, clientIp(req)));
});
