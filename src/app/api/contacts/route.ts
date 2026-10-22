import { requireUser } from "@/lib/server/auth";
import { loadConfig } from "@/lib/server/config";
import { route } from "@/lib/server/http";

/** Contact directory (PRD §7.1): active contacts' public details only. */
export const GET = route(async (req) => {
  await requireUser(req);
  const { contacts } = await loadConfig();
  return Response.json({
    contacts: contacts
      .filter((c) => c.active)
      .map(({ id, name, role, phone, email, emergency }) => ({
        id,
        name,
        role,
        phone,
        email,
        emergency,
      }))
      .sort((a, b) => Number(b.emergency) - Number(a.emergency) || a.name.localeCompare(b.name)),
  });
});
