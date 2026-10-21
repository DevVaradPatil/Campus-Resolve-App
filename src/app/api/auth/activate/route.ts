import { activate } from "@/lib/server/accounts";
import { clientIp, readJson, route } from "@/lib/server/http";
import { activateInput } from "@/lib/domain/schemas";

export const POST = route(async (req) => {
  const input = await readJson(req, activateInput);
  return Response.json(await activate(input, clientIp(req)));
});
