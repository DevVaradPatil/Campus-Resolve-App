import { exportQuery } from "@/lib/domain/schemas";
import { requirePermission, requireUser } from "@/lib/server/auth";
import { exportCsv } from "@/lib/server/export";
import { route } from "@/lib/server/http";

/** CSV of authorized records (FR-15). Audited; confidential rows need confidential.view too. */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  requirePermission(user, "export");
  const p = exportQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  const { csv } = await exportCsv(user, p);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="campusresolve-${p.from}-to-${p.to}.csv"`,
      "cache-control": "no-store",
    },
  });
});
