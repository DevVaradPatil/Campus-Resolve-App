import { requireUser, toMe } from "@/lib/server/auth";
import { route } from "@/lib/server/http";

export const GET = route(async (req) => Response.json(toMe(await requireUser(req))));
