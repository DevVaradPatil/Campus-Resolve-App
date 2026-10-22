import { audit } from "@/lib/server/audit";
import { requirePermission, requireUser } from "@/lib/server/auth";
import { notFound, viewerOf } from "@/lib/server/complaints";
import { adminDb } from "@/lib/server/firebase-admin";
import { HttpError, route } from "@/lib/server/http";
import type { ComplaintDoc, UserDoc } from "@/lib/server/types";

/**
 * Reporter identity, for when it's operationally necessary (PRD §3). Separate from the complaint
 * view so it's fetched on purpose, and every look is audited.
 */
export const GET = route(async (req, ctx: RouteContext<"/api/complaints/[id]/reporter">) => {
  const user = await requireUser(req);
  requirePermission(user, "reporter.view");
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{20}$/.test(id)) throw new HttpError(404, "Not found.");
  const c = (await adminDb.doc(`complaints/${id}`).get()).data() as ComplaintDoc | undefined;
  if (!c || viewerOf(user, c) !== "staff") throw notFound();
  const r = (await adminDb.doc(`users/${c.reporterUid}`).get()).data() as UserDoc | undefined;
  await audit({
    actorUid: user.uid,
    action: "complaint.reporter_view",
    target: { type: "complaint", id },
    outcome: "success",
    meta: { ticketId: c.ticketId },
  });
  return Response.json({
    name: r?.displayName ?? "Unknown",
    rollNumber: r?.rollNumber ?? null,
    room: r
      ? [r.block && `Block ${r.block}`, r.floor && `Floor ${r.floor}`, r.room && `Room ${r.room}`]
          .filter(Boolean)
          .join(" · ")
      : "",
  });
});
