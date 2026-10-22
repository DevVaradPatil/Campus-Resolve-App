import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, type Query, type Timestamp } from "firebase-admin/firestore";
import { applyAction, LifecycleError } from "@/lib/domain/lifecycle";
import { can } from "@/lib/domain/permissions";
import { REPORT_REASONS, type ReportInput } from "@/lib/domain/schemas";
import { writeAudit } from "./audit";
import type { SessionUser } from "./auth";
import { iso, notFound, viewerOf } from "./complaints";
import { adminDb } from "./firebase-admin";
import { forbidden, HttpError } from "./http";
import { adminUids } from "./notify";
import { consume, LIMITS } from "./rate-limit";
import { signedUrl } from "./storage";
import type { AttachmentDoc, CommentDoc, ComplaintDoc, ReportDoc } from "./types";
import { clock, writeTransition } from "./workflow";

const db = adminDb;
const PAGE = 20;

const targetOf = (i: Pick<ReportInput, "complaintId" | "commentId" | "photoId">) =>
  i.photoId
    ? ({ type: "photo", complaintId: i.complaintId, itemId: i.photoId } as const)
    : i.commentId
      ? ({ type: "comment", complaintId: i.complaintId, itemId: i.commentId } as const)
      : ({ type: "complaint", complaintId: i.complaintId, itemId: null } as const);
const keyOf = (t: ReportDoc["target"]) => `${t.type}:${t.complaintId}:${t.itemId ?? ""}`;
const itemRef = (t: ReportDoc["target"]) =>
  t.type === "complaint"
    ? null
    : db.doc(
        `complaints/${t.complaintId}/${t.type === "photo" ? "attachments" : "comments"}/${t.itemId}`,
      );

/** Anyone who can see something can report it, once (repeats update their report). */
export async function createReport(user: SessionUser, input: ReportInput) {
  await consume(`report:${user.uid}`, LIMITS.report);
  const target = targetOf(input);
  const cRef = db.doc(`complaints/${target.complaintId}`);
  const item = itemRef(target);
  const [cs, is] = await db.getAll(cRef, ...(item ? [item] : []));
  const c = cs.data() as ComplaintDoc | undefined;
  if (!c || !viewerOf(user, c) || (item && !is.exists)) throw notFound();
  const key = keyOf(target);
  const ref = db.doc(
    `reports/${createHash("sha256").update(`${user.uid}\n${key}`).digest("hex").slice(0, 32)}`,
  );
  const b = db.batch();
  b.set(ref, {
    targetKey: key,
    target,
    ticketId: c.ticketId,
    confidential: c.visibility === "confidential",
    reason: input.reason,
    note: input.note,
    reporterUid: user.uid,
    status: "open",
    resolution: null,
    resolvedBy: null,
    createdAt: FieldValue.serverTimestamp(),
    resolvedAt: null,
  } satisfies Omit<ReportDoc, "createdAt"> & { createdAt: unknown });
  writeAudit(b, {
    actorUid: user.uid,
    action: "report.create",
    target: { type: "report", id: ref.id },
    outcome: "success",
    meta: { targetType: target.type, ticketId: c.ticketId, reason: input.reason },
  });
  await b.commit();
}

export type ReportView = {
  id: string;
  reason: string;
  note: string | null;
  at: string;
  ticketId: string;
  complaintId: string;
  targetType: ReportDoc["target"]["type"];
  /** What was reported, so moderators can judge without opening it. */
  preview: { text: string | null; photoUrl: string | null; alreadyHidden: boolean };
};

const moderates = (user: SessionUser, confidential: boolean) =>
  can(user, "content.moderate") && (!confidential || can(user, "confidential.view"));

/** Open reports, newest first. Committee moderators only see reports on public complaints. */
export async function listReports(user: SessionUser, after: string | null) {
  if (!can(user, "content.moderate")) throw forbidden();
  let q: Query = db.collection("reports").where("status", "==", "open");
  if (!can(user, "confidential.view")) q = q.where("confidential", "==", false);
  q = q.orderBy("createdAt", "desc");
  if (after) {
    const cursor = await db.doc(`reports/${after}`).get();
    if (cursor.exists) q = q.startAfter(cursor);
  }
  const docs = (await q.limit(PAGE + 1).get()).docs;
  const page = docs.slice(0, PAGE);
  const items = await Promise.all(
    page.map(async (d): Promise<ReportView> => {
      const r = d.data() as ReportDoc;
      const item = itemRef(r.target);
      const [cs, is] = await db.getAll(
        db.doc(`complaints/${r.target.complaintId}`),
        ...(item ? [item] : []),
      );
      const c = cs.data() as ComplaintDoc | undefined;
      let preview: ReportView["preview"] = {
        text: c?.title ?? null,
        photoUrl: null,
        alreadyHidden: !!c?.hidden,
      };
      if (r.target.type === "comment") {
        const m = is?.data() as CommentDoc | undefined;
        preview = { text: m?.body ?? null, photoUrl: null, alreadyHidden: !!m?.hidden };
      } else if (r.target.type === "photo") {
        const a = is?.data() as AttachmentDoc | undefined;
        preview = {
          text: null,
          photoUrl: a ? await signedUrl(a.key).catch(() => null) : null,
          alreadyHidden: a?.publication === "hidden",
        };
      }
      return {
        id: d.id,
        reason: REPORT_REASONS[r.reason],
        note: r.note,
        at: iso(r.createdAt as Timestamp),
        ticketId: r.ticketId,
        complaintId: r.target.complaintId,
        targetType: r.target.type,
        preview,
      };
    }),
  );
  return { items, next: docs.length > PAGE ? page[page.length - 1].id : null };
}

/**
 * Keep, or hide the reported thing: a complaint leaves the public feed, a comment is hidden, a
 * photo is unpublished (the complaint stays, PRD §11.3). Every open report on the same thing is
 * resolved together.
 */
export async function resolveReport(user: SessionUser, reportId: string, action: "keep" | "hide") {
  const admins = action === "hide" ? await adminUids() : [];
  const ref = db.doc(`reports/${reportId}`);
  await db.runTransaction(async (tx) => {
    const r = (await tx.get(ref)).data() as ReportDoc | undefined;
    if (!r || r.status !== "open") throw new HttpError(404, "That report is already handled.");
    if (!moderates(user, r.confidential)) throw forbidden();
    const cRef = db.doc(`complaints/${r.target.complaintId}`);
    const item = itemRef(r.target);
    const siblings = db
      .collection("reports")
      .where("targetKey", "==", r.targetKey)
      .where("status", "==", "open");
    const [[cs, is], open] = await Promise.all([
      tx.getAll(cRef, ...(item ? [item] : [])),
      tx.get(siblings),
    ]);
    const c = cs.data() as ComplaintDoc | undefined;

    if (action === "hide" && c) {
      const reason = `Reported: ${REPORT_REASONS[r.reason]}`;
      if (r.target.type === "complaint" && !c.hidden) {
        try {
          const result = applyAction(c, { type: "hide", reason }, clock());
          writeTransition(tx, cs.id, c, result, user.uid, "complaint.hide", admins);
        } catch (e) {
          if (!(e instanceof LifecycleError)) throw e;
        }
      } else if (r.target.type === "comment" && is?.exists)
        tx.update(is.ref, { hidden: true, hiddenReason: reason });
      else if (r.target.type === "photo" && is?.exists)
        tx.update(is.ref, { publication: "hidden" });
    }

    const resolution = action === "hide" ? "hidden" : "kept";
    for (const d of open.docs)
      tx.update(d.ref, {
        status: "resolved",
        resolution,
        resolvedBy: user.uid,
        resolvedAt: FieldValue.serverTimestamp(),
      });
    writeAudit(tx, {
      actorUid: user.uid,
      action: "report.resolve",
      target: { type: "report", id: reportId },
      outcome: "success",
      meta: { resolution, targetType: r.target.type, ticketId: r.ticketId, reports: open.size },
    });
  });
}
