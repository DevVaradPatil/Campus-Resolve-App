import { requireUser } from "@/lib/server/auth";
import { loadConfig } from "@/lib/server/config";
import { route } from "@/lib/server/http";

/** What the complaint form needs: active categories and blocks, plus emergency numbers. */
export const GET = route(async (req) => {
  await requireUser(req);
  const cfg = await loadConfig();
  return Response.json({
    categories: cfg.categories.filter((c) => c.active),
    blocks: cfg.locations.filter((b) => b.active),
    emergencyContacts: cfg.contacts
      .filter((c) => c.active && c.emergency && c.phone)
      .map((c) => ({ label: c.name, phone: c.phone })),
  });
});
