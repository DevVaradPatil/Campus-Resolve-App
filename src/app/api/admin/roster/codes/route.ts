import { issueCodes } from "@/lib/server/accounts";
import { requirePermission, requireUser } from "@/lib/server/auth";
import { readJson, route } from "@/lib/server/http";
import { issueCodesInput } from "@/lib/domain/schemas";

export const POST = route(async (req) => {
  const user = await requireUser(req);
  requirePermission(user, "roster.manage");
  const { rollNumbers } = await readJson(req, issueCodesInput);
  // Plaintext codes: never cache this response anywhere.
  return Response.json(await issueCodes(user, rollNumbers), {
    headers: { "cache-control": "no-store" },
  });
});
