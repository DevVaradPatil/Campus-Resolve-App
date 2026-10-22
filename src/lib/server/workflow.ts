import "server-only";
import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { toPublicComplaint } from "@/lib/domain/complaint";
import {
  applyAction,
  LifecycleError,
  type LifecycleEvent,
  type WorkflowAction,
} from "@/lib/domain/lifecycle";
import { notificationsFor } from "@/lib/domain/notifications";
import { statsDelta } from "@/lib/domain/stats";
import { can } from "@/lib/domain/permissions";
import type { WorkflowInput } from "@/lib/domain/schemas";
import { writeAudit, type AuditAction } from "./audit";
import type { SessionUser } from "./auth";
import { notFound, viewerOf, type Viewer } from "./complaints";
import { loadConfig, type HostelConfig } from "./config";
import { adminDb } from "./firebase-admin";
import { forbidden, HttpError } from "./http";
import { adminUids, writeNotifications } from "./notify";
import { writeStats } from "./stats";
import type { ComplaintDoc } from "./types";

const db = adminDb;
const toMs = (t: Timestamp) => t.toMillis();
export const clock = (now = Date.now()) => ({
  now,
  ts: Timestamp.fromMillis,
  toMs: (t: Timestamp) => t.toMillis(),
});

type ActionType = WorkflowInput["type"];
const STAFF: ActionType[] = [
  "assign",
  "start",
  "note",
  "resolve",
  "priority",
  "hide",
  "unhide",
  "duplicate",
  "anonymize",
];
const OWNER: ActionType[] = ["confirm", "reopen", "feedback"];

/** Server-side role check (FR-07). `viewer` already encodes confidential access. */
function allowed(user: SessionUser, viewer: Viewer, type: ActionType) {
  if (STAFF.includes(type)) return viewer === "staff" && can(user, "complaints.manage");
  if (OWNER.includes(type)) return viewer === "owner";
  return can(user, "complaints.escalate"); // escalate
}

function toAction(input: WorkflowInput, c: ComplaintDoc, cfg: HostelConfig | null): WorkflowAction {
  switch (input.type) {
    case "assign": {
      const contact = cfg?.contacts.find((x) => x.id === input.contactId && x.active);
      if (!contact) throw new HttpError(400, "Pick an active contact.");
      return { type: "assign", contactId: contact.id, contactName: contact.name };
    }
    case "resolve": {
      const hours = cfg?.categories.find((x) => x.id === c.categoryId)?.closureWindowHours ?? 72;
      return { type: "resolve", note: input.note, closureWindowHours: hours };
    }
    case "escalate":
      return { type: "escalate", reason: input.reason, by: "committee" };
    case "feedback":
    case "duplicate":
      throw new Error(`${input.type} is handled separately`);
    default:
      return input;
  }
}

/** Writes one state change everywhere it must land, in the caller's transaction. */
export function writeTransition(
  tx: Transaction,
  id: string,
  c: ComplaintDoc,
  { patch, event }: { patch: Partial<ComplaintDoc>; event: LifecycleEvent },
  actorUid: string | null,
  action: AuditAction,
  adminUids: string[],
) {
  const ref = db.doc(`complaints/${id}`);
  tx.update(ref, patch);
  const pub = toPublicComplaint({ ...c, ...patch });
  const pubRef = db.doc(`publicComplaints/${id}`);
  if (pub) tx.set(pubRef, pub);
  else tx.delete(pubRef);
  tx.set(ref.collection("events").doc(), { ...event, actorUid, at: patch.updatedAt });
  writeAudit(tx, {
    actorUid,
    action,
    target: { type: "complaint", id },
    outcome: "success",
    meta: { ticketId: c.ticketId, from: c.status, to: patch.status ?? c.status },
  });
  const next = { ...c, ...patch } as ComplaintDoc;
  writeStats(
    tx,
    statsDelta(id, c, next, event.type, (patch.updatedAt as Timestamp).toMillis(), toMs),
  );
  writeNotifications(
    tx,
    id,
    notificationsFor(event.type, next, {
      actorUid,
      adminUids,
      note: event.internal ? null : event.note,
    }),
  );
}

/** POST /api/complaints/[id]/actions. Every check runs on the server, inside the transaction. */
export async function act(user: SessionUser, id: string, input: WorkflowInput) {
  const [cfg, admins] = await Promise.all([
    input.type === "assign" || input.type === "resolve" ? loadConfig() : null,
    adminUids(),
  ]);
  const ref = db.doc(`complaints/${id}`);
  const primaryRef =
    input.type === "duplicate" ? await findPrimary(id, input.primaryTicketId) : null;
  await db.runTransaction(async (tx) => {
    const [snap, primarySnap] = await tx.getAll(ref, ...(primaryRef ? [primaryRef] : []));
    const c = snap.data() as ComplaintDoc | undefined;
    const viewer = c && viewerOf(user, c);
    if (!c || !viewer) throw notFound();
    if (!allowed(user, viewer, input.type)) throw forbidden();

    if (input.type === "feedback") {
      if (c.status !== "closed" || c.feedback)
        throw new HttpError(409, "Feedback is for closed complaints, once.");
      // Private to the reporter and admins; never on the public record.
      const feedback = { rating: input.rating, comment: input.comment };
      tx.update(ref, { feedback });
      writeStats(tx, statsDelta(id, c, { ...c, feedback }, "feedback", Date.now(), toMs));
      writeAudit(tx, {
        actorUid: user.uid,
        action: "complaint.feedback",
        target: { type: "complaint", id },
        outcome: "success",
        meta: { ticketId: c.ticketId, rating: input.rating },
      });
      return;
    }

    if (input.type === "duplicate") {
      const p = primarySnap.data() as ComplaintDoc;
      return mergeDuplicate(tx, user, { id, c }, { id: primarySnap.id, c: p }, admins);
    }

    let result;
    try {
      result = applyAction(c, toAction(input, c, cfg), clock());
    } catch (e) {
      if (e instanceof LifecycleError) throw new HttpError(409, e.message);
      throw e;
    }
    writeTransition(tx, id, c, result, user.uid, `complaint.${input.type}`, admins);
  });
}

async function findPrimary(id: string, ticketId: string) {
  const q = await db.collection("complaints").where("ticketId", "==", ticketId).limit(1).get();
  if (q.empty) throw new HttpError(400, "No complaint has that ticket number.");
  if (q.docs[0].id === id) throw new HttpError(400, "A complaint can't duplicate itself.");
  return q.docs[0].ref;
}

/**
 * FR-08: closes the duplicate as merged and adds its support to the primary. Both histories stay.
 * Neither side reveals the other when that side is confidential: notes and labels name the other
 * ticket only if it's public, and no reporter or attachment crosses the link.
 */
function mergeDuplicate(
  tx: Transaction,
  user: SessionUser,
  dup: { id: string; c: ComplaintDoc },
  primary: { id: string; c: ComplaintDoc },
  admins: string[],
) {
  if (!primary.c || viewerOf(user, primary.c) !== "staff")
    throw new HttpError(400, "You can't merge into that complaint.");
  if (primary.c.duplicateOf || primary.c.status === "closed")
    throw new HttpError(400, "Merge into the original, open complaint.");
  const ctx = clock();
  let result;
  try {
    result = applyAction(
      dup.c,
      {
        type: "duplicate",
        primaryId: primary.id,
        primaryLabel: primary.c.visibility === "public" ? primary.c.ticketId : "another report",
      },
      ctx,
    );
  } catch (e) {
    if (e instanceof LifecycleError) throw new HttpError(409, e.message);
    throw e;
  }
  writeTransition(tx, dup.id, dup.c, result, user.uid, "complaint.duplicate", admins);

  // ponytail: counts add up, so someone who supported both is counted twice. Fine at pilot scale.
  const now = ctx.ts(ctx.now);
  const pPatch = { supportCount: primary.c.supportCount + dup.c.supportCount + 1, updatedAt: now };
  const pRef = db.doc(`complaints/${primary.id}`);
  tx.update(pRef, pPatch);
  const pub = toPublicComplaint({ ...primary.c, ...pPatch });
  if (pub) tx.set(db.doc(`publicComplaints/${primary.id}`), pub);
  tx.set(pRef.collection("events").doc(), {
    type: "duplicate_linked",
    status: primary.c.status,
    note:
      dup.c.visibility === "public"
        ? `${dup.c.ticketId} was merged into this complaint.`
        : "Another report was merged into this complaint.",
    internal: false,
    actorUid: user.uid,
    at: now,
  });
}

/** Which actions this user could take right now, for showing only the buttons that will work. */
export function availableActions(user: SessionUser, viewer: Viewer, c: ComplaintDoc) {
  const dry: Record<Exclude<ActionType, "feedback">, WorkflowAction> = {
    assign: { type: "assign", contactId: "\u0000", contactName: "" },
    start: { type: "start", note: null },
    note: { type: "note", note: "-" },
    resolve: { type: "resolve", note: "-", closureWindowHours: 1 },
    priority: { type: "priority", priority: c.priority === "low" ? "normal" : "low", reason: "-" },
    escalate: { type: "escalate", reason: "-", by: "committee" },
    hide: { type: "hide", reason: "-" },
    unhide: { type: "unhide" },
    confirm: { type: "confirm" },
    reopen: { type: "reopen", note: null },
    duplicate: { type: "duplicate", primaryId: "-", primaryLabel: "-" },
    anonymize: { type: "anonymize" },
  };
  const out: ActionType[] = [];
  for (const [type, action] of Object.entries(dry) as [ActionType, WorkflowAction][]) {
    if (!allowed(user, viewer, type)) continue;
    try {
      applyAction(c, action, clock());
      out.push(type);
    } catch {}
  }
  if (allowed(user, viewer, "feedback") && c.status === "closed" && !c.feedback)
    out.push("feedback");
  return out;
}
