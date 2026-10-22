import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  firstActionDeadline,
  LIMITS as FIELD_LIMITS,
  priorityFor,
  routeComplaint,
  safeLocationLabel,
  toPublicComplaint,
  type ComplaintRecord,
  type IssueSummary,
  type Priority,
  type Status,
  type Visibility,
} from "@/lib/domain/complaint";
import { can } from "@/lib/domain/permissions";
import { isOverdue } from "@/lib/domain/lifecycle";
import { notificationsFor } from "@/lib/domain/notifications";
import { statsDelta } from "@/lib/domain/stats";
import type { CreateComplaintInput, WorkflowInput } from "@/lib/domain/schemas";
import { writeAudit } from "./audit";
import type { SessionUser } from "./auth";
import { loadConfig } from "./config";
import { adminDb } from "./firebase-admin";
import { HttpError } from "./http";
import { reencodeImage } from "./images";
import { consume, LIMITS } from "./rate-limit";
import { deleteObject, putObject, signedUrl } from "./storage";
import { adminUids, writeNotifications } from "./notify";
import { writeStats } from "./stats";
import { canSupport } from "./community";
import { availableActions } from "./workflow";
import type { AttachmentDoc, ComplaintDoc, EventDoc } from "./types";

const db = adminDb;
const PAGE = 20;
const MB = 1024 * 1024;
export const notFound = () =>
  new HttpError(404, "That complaint doesn't exist or isn't visible to you.");

/** Deterministic per (user, draft key), so a retried submit finds the ticket it already made. */
const complaintId = (uid: string, key: string) =>
  createHash("sha256").update(`${uid}\n${key}`).digest("hex").slice(0, 20);

/**
 * PRD §4.2: validates against live config, sets priority/deadline/routing, then writes the
 * complaint, its first events, the audit entry, the ticket counter and the public projection
 * in one transaction.
 */
export async function createComplaint(user: SessionUser, input: CreateComplaintInput) {
  const id = complaintId(user.uid, input.idempotencyKey);
  const ref = db.doc(`complaints/${id}`);
  const existing = await ref.get();
  if (existing.exists) return { id, ticketId: existing.get("ticketId") as string };
  await consume(`complaint:${user.uid}`, LIMITS.complaintCreate);

  const cfg = await loadConfig();
  const cat = cfg.categories.find((c) => c.id === input.categoryId && c.active);
  if (!cat) throw new HttpError(400, "Pick a category from the list.");
  const sub = cat.subcategories.find((s) => s.id === input.subcategoryId) ?? null;
  if (input.subcategoryId && !sub) throw new HttpError(400, "Pick a subcategory from the list.");
  const loc = input.location;
  const block = cfg.locations.find((b) => b.id === loc.blockId && b.active) ?? null;
  if (loc.blockId && !block) throw new HttpError(400, "Pick a block from the list.");
  if (loc.floorId && !block?.floors.some((f) => f.id === loc.floorId))
    throw new HttpError(400, "Pick a floor from the list.");

  const { priority, rule } = priorityFor(cat, sub?.id ?? null);
  const routing = routeComplaint(cfg.routingRules, cfg.contacts, cat.id, block?.id ?? null);
  const critical = priority === "critical";
  const nowMs = Date.now();
  const deadline = Timestamp.fromMillis(firstActionDeadline(priority, nowMs));

  const admins = await adminUids();
  return db.runTransaction(async (tx) => {
    const counterRef = db.doc("systemSettings/ticketCounter");
    const [snap, counter] = await tx.getAll(ref, counterRef);
    if (snap.exists) return { id, ticketId: snap.get("ticketId") as string };
    const n = ((counter.get("value") as number | undefined) ?? 0) + 1;
    const ticketId = `CR-${String(n).padStart(6, "0")}`;
    const now = FieldValue.serverTimestamp();

    const record: ComplaintRecord<Timestamp | FieldValue> = {
      ticketId,
      title: input.title,
      description: input.description,
      categoryId: cat.id,
      categoryLabel: cat.label,
      subcategoryId: sub?.id ?? null,
      subcategoryLabel: sub?.label ?? null,
      location: loc,
      locationLabel: safeLocationLabel(loc, cfg.locations),
      priority,
      priorityRule: rule,
      urgentFlag: input.urgent,
      reporterUid: user.uid,
      reporterLabel: user.pseudonym,
      visibility: input.visibility,
      status: "submitted",
      open: true,
      escalated: critical,
      hidden: false,
      hiddenReason: null,
      routing,
      assignedContactId: null,
      supportCount: 0,
      attachmentCount: 0,
      activeSince: Timestamp.fromMillis(nowMs),
      firstActionDeadline: deadline,
      firstActionAt: null,
      resolvedAt: null,
      resolutionNote: null,
      confirmationDeadline: null,
      closedAt: null,
      closureReason: null,
      feedback: null,
      createdAt: now,
      updatedAt: now,
    };
    tx.set(counterRef, { value: n });
    tx.set(ref, record);
    const pub = toPublicComplaint(record);
    if (pub) tx.set(db.doc(`publicComplaints/${id}`), pub);
    const event = (e: Omit<EventDoc, "at">) =>
      tx.set(ref.collection("events").doc(), { ...e, at: now });
    event({ type: "created", status: "submitted", actorUid: user.uid, note: null });
    if (critical)
      event({
        type: "escalated",
        status: "submitted",
        actorUid: null,
        note: "Raised to the hostel lead automatically because it's critical.",
      });
    writeNotifications(
      tx,
      id,
      notificationsFor("created", record, { actorUid: user.uid, adminUids: admins, critical }),
    );
    writeStats(
      tx,
      statsDelta(id, null, record, "created", nowMs, () => nowMs),
    );
    writeAudit(tx, {
      actorUid: user.uid,
      action: "complaint.create",
      target: { type: "complaint", id },
      outcome: "success",
      meta: {
        ticketId,
        categoryId: cat.id,
        priority,
        visibility: input.visibility,
        escalated: critical,
      },
    });
    return { id, ticketId };
  });
}

export type Viewer = "owner" | "staff" | "public";

/** Who may see this complaint, and how much. null = it doesn't exist for them (404, not 403). */
export function viewerOf(user: SessionUser, c: ComplaintDoc): Viewer | null {
  if (c.reporterUid === user.uid) return "owner";
  if (
    can(user, "complaints.manage") &&
    (c.visibility === "public" || can(user, "confidential.view"))
  )
    return "staff";
  if (c.visibility === "public" && !c.hidden) return "public";
  return null;
}

export type ComplaintView = {
  id: string;
  ticketId: string;
  title: string;
  description: string;
  category: string;
  subcategory: string | null;
  status: Status;
  priority: Priority;
  escalated: boolean;
  supportCount: number;
  location: string[];
  reporterLabel: string;
  visibility: Visibility;
  createdAt: string;
  viewer: Viewer;
  /** Owner and staff only. */
  details: {
    roomReference: string | null;
    locationDescription: string | null;
    urgent: boolean;
    firstActionDeadline: string;
  } | null;
  photos: { id: string; url: string }[];
  canAddPhotos: boolean;
  timeline: { id: string; status: Status; at: string; note?: string; byline: string }[];
  /** No recorded action and past the first-action deadline. */
  overdue: boolean;
  workflow: {
    assignee: string | null;
    resolutionNote: string | null;
    closureReason: ComplaintDoc["closureReason"];
    /** Owner and staff only. */
    confirmationDeadline: string | null;
    feedback: ComplaintDoc["feedback"];
    hidden: boolean;
    /** Staff only. */
    hiddenReason: string | null;
  };
  /** Workflow actions this user can take right now. */
  actions: WorkflowInput["type"][];
  /** Staff only: who it can be assigned to. */
  assignees: { id: string; name: string }[];
  /** Set when merged as a duplicate. The primary is named only if this viewer can see it. */
  mergedInto: { id: string; ticketId: string } | "hidden" | null;
  /** "Affects me too" state for this viewer. */
  support: { supported: boolean; canSupport: boolean };
};

export const iso = (t: Timestamp | null | undefined) =>
  (t ?? Timestamp.now()).toDate().toISOString();

export async function getComplaint(user: SessionUser, id: string): Promise<ComplaintView> {
  const ref = db.doc(`complaints/${id}`);
  const c = (await ref.get()).data() as ComplaintDoc | undefined;
  const viewer = c && viewerOf(user, c);
  if (!c || !viewer) throw notFound();
  const privileged = viewer !== "public";

  const staff = viewer === "staff";
  const [events, attachments, cfg, vote, primary] = await Promise.all([
    ref.collection("events").orderBy("at").get(),
    ref.collection("attachments").orderBy("createdAt").get(),
    staff || c.assignedContactId ? loadConfig() : null,
    ref.collection("votes").doc(user.uid).get(),
    c.duplicateOf ? db.doc(`complaints/${c.duplicateOf}`).get() : null,
  ]);
  const p = primary?.data() as ComplaintDoc | undefined;
  const contacts = cfg?.contacts ?? [];
  const visible = attachments.docs.filter((d) => {
    const a = d.data() as AttachmentDoc;
    return privileged || (a.privacy === "public" && a.publication === "published");
  });
  // A storage outage hides photos; the complaint itself still loads.
  const photos = (
    await Promise.all(
      visible.map((d) =>
        signedUrl((d.data() as AttachmentDoc).key).then(
          (url) => ({ id: d.id, url }),
          (e) => (console.error("Signing photo URL failed", e), null),
        ),
      ),
    )
  ).filter((p) => p !== null);

  return {
    id,
    ticketId: c.ticketId,
    title: c.title,
    description: c.description,
    category: c.categoryLabel,
    subcategory: c.subcategoryLabel,
    status: c.status,
    priority: c.priority,
    escalated: c.escalated,
    supportCount: c.supportCount,
    location: c.locationLabel,
    reporterLabel: viewer === "owner" ? "you" : c.reporterLabel,
    visibility: c.visibility,
    createdAt: iso(c.createdAt),
    viewer,
    details: privileged
      ? {
          roomReference: c.location.roomReference,
          locationDescription: c.location.description,
          urgent: c.urgentFlag,
          firstActionDeadline: iso(c.firstActionDeadline),
        }
      : null,
    photos,
    canAddPhotos: viewer === "owner" && c.attachmentCount < FIELD_LIMITS.photos,
    timeline: events.docs
      .filter((d) => staff || !(d.data() as EventDoc).internal)
      .map((d) => {
        const e = d.data() as EventDoc;
        return {
          id: d.id,
          status: e.status,
          at: iso(e.at),
          ...(e.note && { note: e.note }),
          byline:
            e.type === "created"
              ? viewer === "owner"
                ? "You reported this"
                : `Reported by ${c.reporterLabel}`
              : !e.actorUid
                ? "Automatic"
                : e.actorUid === c.reporterUid
                  ? viewer === "owner"
                    ? "You"
                    : c.reporterLabel
                  : // Staff have no accounts: updates are recorded by an admin (PRD §17).
                    e.type === "escalated"
                    ? "Hostel committee"
                    : "Recorded by admin",
        };
      }),
    overdue: isOverdue(c, Date.now(), (t) => t.toMillis()),
    workflow: {
      assignee: contacts.find((x) => x.id === c.assignedContactId)?.name ?? null,
      resolutionNote: c.resolutionNote ?? null,
      closureReason: c.closureReason ?? null,
      confirmationDeadline:
        privileged && c.confirmationDeadline ? iso(c.confirmationDeadline) : null,
      feedback: privileged ? (c.feedback ?? null) : null,
      hidden: privileged && c.hidden,
      hiddenReason: staff ? (c.hiddenReason ?? null) : null,
    },
    actions: availableActions(user, viewer, c),
    assignees: staff
      ? contacts.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name }))
      : [],
    support: { supported: vote.exists, canSupport: canSupport(user, c) },
    mergedInto: !c.duplicateOf
      ? null
      : p && viewerOf(user, p)
        ? { id: c.duplicateOf, ticketId: p.ticketId }
        : "hidden",
  };
}

export const toSummary = (id: string, c: ComplaintDoc): IssueSummary => ({
  id,
  ticketId: c.ticketId,
  title: c.title,
  category: c.categoryLabel,
  status: c.status,
  priority: c.priority,
  escalated: c.escalated,
  supportCount: c.supportCount,
  location: c.locationLabel,
  createdAt: iso(c.createdAt),
  confidential: c.visibility === "confidential",
});

/** The signed-in user's own complaints, newest first. `after` is the last id of the previous page. */
export async function listMine(user: SessionUser, after: string | null) {
  let q = db
    .collection("complaints")
    .where("reporterUid", "==", user.uid)
    .orderBy("createdAt", "desc")
    .limit(PAGE + 1);
  if (after) {
    const cursor = await db.doc(`complaints/${after}`).get();
    if (cursor.get("reporterUid") === user.uid) q = q.startAfter(cursor);
  }
  const docs = (await q.get()).docs;
  const page = docs.slice(0, PAGE);
  return {
    items: page.map((d) => toSummary(d.id, d.data() as ComplaintDoc)),
    next: docs.length > PAGE ? page[page.length - 1].id : null,
  };
}

/**
 * Owner photo upload (PRD §11). Rate limit → ownership → size/count → magic bytes → re-encode
 * (strips EXIF) → store under a generated key → metadata + count in a transaction.
 */
export async function addPhoto(user: SessionUser, id: string, file: File) {
  await consume(`upload:${user.uid}`, LIMITS.upload);
  const ref = db.doc(`complaints/${id}`);
  const c = (await ref.get()).data() as ComplaintDoc | undefined;
  if (!c || c.reporterUid !== user.uid) throw notFound();
  const tooMany = () =>
    new HttpError(400, `A complaint can have at most ${FIELD_LIMITS.photos} photos.`);
  if (c.attachmentCount >= FIELD_LIMITS.photos) throw tooMany();
  if (file.size > FIELD_LIMITS.photoMb * MB)
    throw new HttpError(413, `Each photo must be ${FIELD_LIMITS.photoMb} MB or smaller.`);

  const img = await reencodeImage(Buffer.from(await file.arrayBuffer()));
  const attRef = ref.collection("attachments").doc();
  const key = `complaints/${id}/${attRef.id}.webp`;
  await putObject(key, img.data);
  try {
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data() as ComplaintDoc;
      if (cur.attachmentCount >= FIELD_LIMITS.photos) throw tooMany();
      tx.update(ref, { attachmentCount: FieldValue.increment(1) });
      tx.set(attRef, {
        key,
        contentType: "image/webp",
        bytes: img.data.length,
        width: img.width,
        height: img.height,
        // Confidential complaints never publish attachments (PRD §11.3).
        privacy: cur.visibility === "public" ? "public" : "private",
        publication: "published",
        uploadedBy: user.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      writeAudit(tx, {
        actorUid: user.uid,
        action: "attachment.upload",
        target: { type: "complaint", id },
        outcome: "success",
        meta: { attachmentId: attRef.id, bytes: img.data.length },
      });
    });
  } catch (e) {
    await deleteObject(key).catch(() => {});
    throw e;
  }
  return { id: attRef.id };
}
