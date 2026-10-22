import { FieldPath } from "firebase-admin/firestore";
import { markReadInput } from "@/lib/domain/schemas";
import { requireUser } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { readJson, route } from "@/lib/server/http";

/** Marks the caller's own notifications read: given ids, or every unread one (bounded). */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const input = await readJson(req, markReadInput);
  const mine = adminDb.collection("notifications").where("recipientUid", "==", user.uid);
  const snap =
    "ids" in input
      ? await mine.where(FieldPath.documentId(), "in", input.ids).get()
      : await mine.where("read", "==", false).limit(200).get();
  const batch = adminDb.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
  // Not audited: read receipts on your own notifications change nothing anyone else sees.
  return Response.json({ updated: snap.size });
});
