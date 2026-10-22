import "server-only";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { notificationsFor } from "@/lib/domain/notifications";
import { can } from "@/lib/domain/permissions";
import { writeAudit } from "./audit";
import type { SessionUser } from "./auth";
import { iso, notFound, viewerOf } from "./complaints";
import { adminDb } from "./firebase-admin";
import { forbidden, HttpError } from "./http";
import { adminUids, writeNotifications } from "./notify";
import { consume, LIMITS } from "./rate-limit";
import type { CommentDoc, ComplaintDoc } from "./types";

const db = adminDb;
const PAGE = 20;

/** Public, visible complaints can be supported by anyone but their reporter. */
export const canSupport = (user: SessionUser, c: ComplaintDoc) =>
  c.visibility === "public" && !c.hidden && c.reporterUid !== user.uid;

/** Toggles the caller's one support vote (FR-09). Count changes on both docs atomically. */
export async function toggleSupport(user: SessionUser, id: string) {
  await consume(`support:${user.uid}`, LIMITS.support);
  const ref = db.doc(`complaints/${id}`);
  const voteRef = ref.collection("votes").doc(user.uid);
  return db.runTransaction(async (tx) => {
    const [snap, vote] = await tx.getAll(ref, voteRef);
    const c = snap.data() as ComplaintDoc | undefined;
    if (!c || !viewerOf(user, c)) throw notFound();
    if (!canSupport(user, c))
      throw new HttpError(409, "You can only support other people's public complaints.");
    const supported = !vote.exists;
    const delta = FieldValue.increment(supported ? 1 : -1);
    if (supported) tx.create(voteRef, { at: FieldValue.serverTimestamp() });
    else tx.delete(voteRef);
    tx.update(ref, { supportCount: delta });
    tx.update(db.doc(`publicComplaints/${id}`), { supportCount: delta });
    writeAudit(tx, {
      actorUid: user.uid,
      action: "complaint.support",
      target: { type: "complaint", id },
      outcome: "success",
      meta: { supported },
    });
    return { supported, supportCount: Math.max(0, c.supportCount + (supported ? 1 : -1)) };
  });
}

/** What the viewer may do with comments on this complaint. */
const moderator = (user: SessionUser) => can(user, "content.moderate");
const authorLabel = (user: SessionUser) =>
  user.role === "admin" ? "Hostel admin" : user.pseudonym;

export type CommentView = {
  id: string;
  author: string;
  mine: boolean;
  body: string;
  at: string;
  /** Moderators only: hidden comments stay visible to them, marked. */
  hidden?: { reason: string | null };
};

export async function addComment(user: SessionUser, id: string, body: string) {
  await consume(`comment:${user.uid}`, LIMITS.comment);
  const admins = await adminUids();
  const ref = db.doc(`complaints/${id}`);
  return db.runTransaction(async (tx) => {
    const c = (await tx.get(ref)).data() as ComplaintDoc | undefined;
    if (!c || !viewerOf(user, c)) throw notFound();
    const commentRef = ref.collection("comments").doc();
    tx.set(commentRef, {
      authorUid: user.uid,
      authorLabel: authorLabel(user),
      body,
      hidden: false,
      hiddenReason: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    writeAudit(tx, {
      actorUid: user.uid,
      action: "comment.create",
      target: { type: "complaint", id },
      outcome: "success",
      meta: { commentId: commentRef.id }, // never the text
    });
    writeNotifications(
      tx,
      id,
      notificationsFor("comment", c, {
        actorUid: user.uid,
        adminUids: c.visibility === "confidential" ? admins : [],
        note: body,
      }),
    );
    return { id: commentRef.id };
  });
}

/** Newest first, 20 per page. Hidden comments are left out unless the viewer moderates. */
export async function listComments(user: SessionUser, id: string, before: string | null) {
  const ref = db.doc(`complaints/${id}`);
  const c = (await ref.get()).data() as ComplaintDoc | undefined;
  if (!c || !viewerOf(user, c)) throw notFound();
  const mod = moderator(user);
  let q = ref.collection("comments").orderBy("createdAt", "desc");
  if (!mod) q = q.where("hidden", "==", false);
  if (before) {
    const cursor = await ref.collection("comments").doc(before).get();
    if (cursor.exists) q = q.startAfter(cursor);
  }
  const docs = (await q.limit(PAGE + 1).get()).docs;
  const page = docs.slice(0, PAGE);
  return {
    comments: page.map((d): CommentView => {
      const x = d.data() as CommentDoc;
      return {
        id: d.id,
        author:
          x.authorUid === c.reporterUid && x.authorUid !== user.uid
            ? `${x.authorLabel} (reporter)`
            : x.authorLabel,
        mine: x.authorUid === user.uid,
        body: x.body,
        at: iso(x.createdAt as Timestamp),
        ...(x.hidden && { hidden: { reason: x.hiddenReason } }),
      };
    }),
    next: docs.length > PAGE ? page[page.length - 1].id : null,
    canModerate: mod,
  };
}

/** Moderation: hides one comment with a reason (FR-10). Kept for the audit trail, not deleted. */
export async function hideComment(
  user: SessionUser,
  id: string,
  commentId: string,
  reason: string,
) {
  if (!moderator(user)) throw forbidden();
  const ref = db.doc(`complaints/${id}`);
  const commentRef = ref.collection("comments").doc(commentId);
  await db.runTransaction(async (tx) => {
    const [cs, ms] = await tx.getAll(ref, commentRef);
    const c = cs.data() as ComplaintDoc | undefined;
    if (!c || !viewerOf(user, c) || !ms.exists) throw notFound();
    if (ms.get("hidden")) throw new HttpError(409, "That comment is already hidden.");
    tx.update(commentRef, { hidden: true, hiddenReason: reason });
    writeAudit(tx, {
      actorUid: user.uid,
      action: "comment.hide",
      target: { type: "complaint", id },
      outcome: "success",
      meta: { commentId },
    });
  });
}
