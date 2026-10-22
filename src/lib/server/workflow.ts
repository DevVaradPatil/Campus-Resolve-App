import "server-only";
import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { toPublicComplaint } from "@/lib/domain/complaint";
import {
  applyAction,
  LifecycleError,
  type LifecycleEvent,
  type WorkflowAction,
} from "@/lib/domain/lifecycle";
import { can } from "@/lib/domain/permissions";
import type { WorkflowInput } from "@/lib/domain/schemas";
import { writeAudit, type AuditAction } from "./audit";
import type { SessionUser } from "./auth";
import { notFound, viewerOf, type Viewer } from "./complaints";
import { loadConfig, type HostelConfig } from "./config";
import { adminDb } from "./firebase-admin";
import { forbidden, HttpError } from "./http";
import type { ComplaintDoc } from "./types";

const db = adminDb;
export const clock = (now = Date.now()) => ({
  now,
  ts: Timestamp.fromMillis,
  toMs: (t: Timestamp) => t.toMillis(),
});

type ActionType = WorkflowInput["type"];
const STAFF: ActionType[] = ["assign", "start", "note", "resolve", "priority", "hide", "unhide"];
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
      throw new Error("feedback is not a lifecycle action");
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
}

/** POST /api/complaints/[id]/actions. Every check runs on the server, inside the transaction. */
export async function act(user: SessionUser, id: string, input: WorkflowInput) {
  const cfg = input.type === "assign" || input.type === "resolve" ? await loadConfig() : null;
  const ref = db.doc(`complaints/${id}`);
  await db.runTransaction(async (tx) => {
    const c = (await tx.get(ref)).data() as ComplaintDoc | undefined;
    const viewer = c && viewerOf(user, c);
    if (!c || !viewer) throw notFound();
    if (!allowed(user, viewer, input.type)) throw forbidden();

    if (input.type === "feedback") {
      if (c.status !== "closed" || c.feedback)
        throw new HttpError(409, "Feedback is for closed complaints, once.");
      // Private to the reporter and admins; never on the public record.
      tx.update(ref, { feedback: { rating: input.rating, comment: input.comment } });
      writeAudit(tx, {
        actorUid: user.uid,
        action: "complaint.feedback",
        target: { type: "complaint", id },
        outcome: "success",
        meta: { ticketId: c.ticketId, rating: input.rating },
      });
      return;
    }

    let result;
    try {
      result = applyAction(c, toAction(input, c, cfg), clock());
    } catch (e) {
      if (e instanceof LifecycleError) throw new HttpError(409, e.message);
      throw e;
    }
    writeTransition(tx, id, c, result, user.uid, `complaint.${input.type}`);
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
