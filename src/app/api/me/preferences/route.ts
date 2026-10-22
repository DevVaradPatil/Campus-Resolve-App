import { FieldValue } from "firebase-admin/firestore";
import { preferencesInput } from "@/lib/domain/schemas";
import { writeAudit } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { readJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const { muteNonEssential } = await readJson(req, preferencesInput);
  const b = adminDb.batch();
  b.update(adminDb.doc(`users/${user.uid}`), {
    muteNonEssential,
    updatedAt: FieldValue.serverTimestamp(),
  });
  writeAudit(b, {
    actorUid: user.uid,
    action: "account.preferences",
    target: { type: "user", id: user.uid },
    outcome: "success",
    meta: { muteNonEssential },
  });
  await b.commit();
  return Response.json({ ok: true });
});
