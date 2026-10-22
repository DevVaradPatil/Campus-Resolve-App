import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { audit } from "./audit";
import { env } from "./env";
import { adminDb } from "./firebase-admin";
import { deleteObject } from "./storage";
import type { AttachmentDoc, ComplaintDoc } from "./types";

// PRD §14.2, run from the sweep. Off unless RETENTION_ENABLED=true, because deleting is
// irreversible and the one-year policy still needs the owner's approval (TODO.md).
// Aggregate stats stay: they hold counts, never people.

const db = adminDb;
export const RETENTION_DAYS = 365;
const BATCH = 10; // complaints per run; each one deletes its subcollections too
const PRUNE = 200; // audit logs / counters per run

async function deleteComplaint(id: string, c: ComplaintDoc) {
  const ref = db.doc(`complaints/${id}`);
  // Photos first: once the metadata is gone nothing points at them.
  const attachments = await ref.collection("attachments").get();
  await Promise.all(attachments.docs.map((d) => deleteObject((d.data() as AttachmentDoc).key)));
  const related = await Promise.all([
    db.collection("notifications").where("complaintId", "==", id).limit(500).get(),
    db.collection("reports").where("target.complaintId", "==", id).limit(500).get(),
  ]);
  const b = db.batch();
  related.flatMap((s) => s.docs).forEach((d) => b.delete(d.ref));
  b.delete(db.doc(`publicComplaints/${id}`));
  await b.commit();
  await db.recursiveDelete(ref); // complaint + events, comments, votes, attachments metadata
  await audit({
    actorUid: null,
    action: "complaint.retention_delete",
    target: { type: "complaint", id },
    outcome: "success",
    meta: { ticketId: c.ticketId, photos: attachments.size },
  });
}

async function prune(collection: string, field: string, before: Timestamp) {
  const snap = await db.collection(collection).where(field, "<", before).limit(PRUNE).get();
  if (snap.empty) return 0;
  const b = db.batch();
  snap.docs.forEach((d) => b.delete(d.ref));
  await b.commit();
  return snap.size;
}

/**
 * Deletes complaints closed more than a year ago (with photos, comments, votes, events,
 * notifications and reports), audit logs older than a year, and expired rate-limit counters.
 * Bounded per run; the cron catches up over later runs. Complaints with `retentionHold: true`
 * are kept (a documented preservation exception, set by an admin in the Firebase console).
 */
export async function runRetention(now = Date.now(), enabled = env.RETENTION_ENABLED) {
  // Expired counters hold no personal data; clear them even with retention off, as the
  // fallback for when no Firestore TTL policy is set (TODO.md).
  const counters = await prune("rateLimits", "expiresAt", Timestamp.fromMillis(now));
  if (!enabled) return { enabled, complaints: 0, auditLogs: 0, counters };

  const cutoff = Timestamp.fromMillis(now - RETENTION_DAYS * 86_400_000);
  const old = await db
    .collection("complaints")
    .where("status", "==", "closed")
    .where("closedAt", "<=", cutoff)
    .limit(BATCH)
    .get();
  let complaints = 0;
  for (const d of old.docs) {
    const c = d.data() as ComplaintDoc & { retentionHold?: boolean };
    if (c.retentionHold) continue;
    await deleteComplaint(d.id, c);
    complaints++;
  }
  const auditLogs = await prune("auditLogs", "at", cutoff);
  return { enabled, complaints, auditLogs, counters };
}
