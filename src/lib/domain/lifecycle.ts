// The only place complaint state changes are decided (PRD §6.1). Pure: the server supplies the
// clock and timestamp conversion, then writes the patch, the event, the audit entry and the
// public projection in one transaction.

import {
  FIRST_ACTION_HOURS,
  isOpen,
  type ComplaintRecord,
  type Priority,
  type Status,
} from "./complaint";
import { GENERIC_REPORTER } from "./pseudonym";

export type WorkflowAction =
  | { type: "assign"; contactId: string; contactName: string }
  | { type: "start"; note: string | null }
  | { type: "note"; note: string }
  | { type: "resolve"; note: string; closureWindowHours: number }
  | { type: "priority"; priority: Priority; reason: string }
  | { type: "escalate"; reason: string; by: "committee" | "system" }
  | { type: "hide"; reason: string }
  | { type: "unhide" }
  | { type: "confirm" }
  | { type: "reopen"; note: string | null }
  | { type: "auto_close" }
  /** `primaryLabel` is the primary's ticket only when it's safe to show (public primary). */
  | { type: "duplicate"; primaryId: string; primaryLabel: string }
  | { type: "anonymize" };

export type EventType =
  | "created"
  | "assigned"
  | "started"
  | "note"
  | "resolved"
  | "priority"
  | "escalated"
  | "hidden"
  | "unhidden"
  | "confirmed"
  | "reopened"
  | "auto_closed"
  | "duplicate"
  | "duplicate_linked"
  | "anonymized";

export type LifecycleEvent = {
  type: EventType;
  status: Status;
  note: string | null;
  /** Staff-only (reasons, moderation). Owners and the public never see it. */
  internal: boolean;
};

export class LifecycleError extends Error {}

type Ctx<T> = { now: number; ts: (ms: number) => T; toMs: (t: T) => number };

const ACTIVE: Status[] = ["submitted", "assigned", "in_progress", "reopened"];
const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};
const HOUR = 3600_000;

export function applyAction<T>(c: ComplaintRecord<T>, a: WorkflowAction, ctx: Ctx<T>) {
  const now = ctx.ts(ctx.now);
  const deny = (msg: string): never => {
    throw new LifecycleError(msg);
  };
  const need = (ok: boolean, msg: string) => ok || deny(msg);
  const active = ACTIVE.includes(c.status);
  const firstAction = { firstActionAt: c.firstActionAt ?? now };

  let status = c.status;
  let patch: Partial<ComplaintRecord<T>> = {};
  let event: Omit<LifecycleEvent, "status">;

  switch (a.type) {
    case "assign":
      need(active, "Only open complaints can be assigned.");
      need(a.contactId !== c.assignedContactId, "It's already assigned to them.");
      // Reassigning keeps progress; a first assignment moves it along.
      if (c.status === "submitted" || c.status === "reopened") status = "assigned";
      patch = { assignedContactId: a.contactId, ...firstAction };
      event = { type: "assigned", note: `Assigned to ${a.contactName}`, internal: false };
      break;
    case "start":
      need(c.status === "assigned" || c.status === "reopened", "Assign it before starting work.");
      need(!!c.assignedContactId, "Assign it before starting work.");
      status = "in_progress";
      patch = firstAction;
      event = { type: "started", note: a.note, internal: false };
      break;
    case "note":
      need(active, "Progress notes are only for open complaints.");
      patch = firstAction;
      event = { type: "note", note: a.note, internal: false };
      break;
    case "resolve":
      need(
        c.status === "assigned" || c.status === "in_progress" || c.status === "reopened",
        "Assign it before marking it resolved.",
      );
      status = "resolved";
      patch = {
        ...firstAction,
        resolvedAt: now,
        resolutionNote: a.note,
        confirmationDeadline: ctx.ts(ctx.now + a.closureWindowHours * HOUR),
      };
      event = { type: "resolved", note: a.note, internal: false };
      break;
    case "priority":
      need(c.status !== "closed", "Closed complaints can't change priority.");
      need(a.priority !== c.priority, "It already has that priority.");
      patch = {
        priority: a.priority,
        priorityRule: "override",
        firstActionDeadline: ctx.ts(
          ctx.toMs(c.activeSince) + FIRST_ACTION_HOURS[a.priority] * HOUR,
        ),
      };
      event = {
        type: "priority",
        note: `${PRIORITY_LABEL[c.priority]} → ${PRIORITY_LABEL[a.priority]}: ${a.reason}`,
        internal: true,
      };
      break;
    case "escalate":
      need(active, "Only open complaints can be escalated.");
      need(!c.escalated, "It's already escalated.");
      patch = { escalated: true };
      event = { type: "escalated", note: a.reason, internal: a.by === "committee" };
      break;
    case "hide":
      need(!c.hidden, "It's already hidden.");
      patch = { hidden: true, hiddenReason: a.reason };
      event = { type: "hidden", note: a.reason, internal: true };
      break;
    case "unhide":
      need(c.hidden, "It isn't hidden.");
      patch = { hidden: false, hiddenReason: null };
      event = { type: "unhidden", note: null, internal: true };
      break;
    case "confirm":
      need(c.status === "resolved", "Only a resolved complaint can be confirmed.");
      status = "closed";
      patch = { closedAt: now, closureReason: "student_confirmed" };
      event = { type: "confirmed", note: "Reporter confirmed it's fixed.", internal: false };
      break;
    case "reopen":
      need(
        c.status === "resolved" || c.status === "closed",
        "Only resolved or closed complaints can be reopened.",
      );
      // A new handling cycle: nothing from the old resolution carries over (PRD §6.1).
      status = "reopened";
      patch = {
        activeSince: now,
        firstActionDeadline: ctx.ts(ctx.now + FIRST_ACTION_HOURS[c.priority] * HOUR),
        firstActionAt: null,
        resolvedAt: null,
        resolutionNote: null,
        confirmationDeadline: null,
        closedAt: null,
        closureReason: null,
        feedback: null,
        escalated: c.priority === "critical",
      };
      event = {
        type: "reopened",
        note: a.note ?? "Reporter says it's still a problem.",
        internal: false,
      };
      break;
    case "duplicate":
      need(c.status !== "closed", "Closed complaints can't be merged.");
      need(!c.duplicateOf, "It's already merged.");
      status = "closed";
      patch = { closedAt: now, closureReason: "duplicate", duplicateOf: a.primaryId };
      event = { type: "duplicate", note: `Merged into ${a.primaryLabel}.`, internal: false };
      break;
    case "anonymize":
      need(c.reporterLabel !== GENERIC_REPORTER, "It already shows a generic name.");
      patch = { reporterLabel: GENERIC_REPORTER };
      event = { type: "anonymized", note: null, internal: true };
      break;
    case "auto_close":
      need(
        c.status === "resolved" &&
          !!c.confirmationDeadline &&
          ctx.toMs(c.confirmationDeadline) <= ctx.now,
        "Not due to close yet.",
      );
      status = "closed";
      patch = { closedAt: now, closureReason: "confirmation_window_expired" };
      event = {
        type: "auto_closed",
        note: "Closed automatically: no reply before the confirmation deadline.",
        internal: false,
      };
      break;
  }

  return {
    patch: { ...patch, status, open: isOpen(status), updatedAt: now },
    event: { ...event, status },
  };
}

/** No documented action yet and past the first-action deadline. */
export const isOverdue = <T>(c: ComplaintRecord<T>, now: number, toMs: (t: T) => number) =>
  ACTIVE.includes(c.status) && !c.firstActionAt && toMs(c.firstActionDeadline) < now;
