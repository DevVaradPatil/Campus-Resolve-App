import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { dedupeKey, hourBucket, type NotificationDraft } from "@/lib/domain/notifications";
import { adminDb } from "./firebase-admin";

// notifications/{hash(dedupeKey)}: one doc per type + ticket + person + bucket, so repeats within
// the bucket overwrite instead of piling up. Users read their own with the client SDK
// (firestore.rules); marking read goes through POST /api/notifications/read.

const db = adminDb;
const docId = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 32);

export const notificationRef = (
  d: NotificationDraft,
  complaintId: string,
  bucket: string | number,
) => db.doc(`notifications/${docId(dedupeKey(d, complaintId, bucket))}`);

const toDoc = (d: NotificationDraft, complaintId: string) => ({
  ...d,
  complaintId,
  href: `/complaints/${complaintId}`,
  read: false,
  createdAt: FieldValue.serverTimestamp(),
});

/** Writes in the caller's transaction, after its reads. */
export function writeNotifications(
  tx: Transaction,
  complaintId: string,
  drafts: NotificationDraft[],
  nowMs = Date.now(),
) {
  for (const d of drafts)
    tx.set(notificationRef(d, complaintId, hourBucket(nowMs)), toDoc(d, complaintId));
}

/** Creates the notification only if this exact one was never sent (one-off reminders). */
export async function notifyOnce(complaintId: string, d: NotificationDraft, bucket: string) {
  const ref = notificationRef(d, complaintId, bucket);
  return db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return false;
    tx.set(ref, toDoc(d, complaintId));
    return true;
  });
}

/** Active admins: the designated leads in a single-hostel pilot (PRD §6.2). */
export async function adminUids() {
  const snap = await db
    .collection("users")
    .where("role", "==", "admin")
    .where("active", "==", true)
    .get();
  return snap.docs.map((d) => d.id);
}
