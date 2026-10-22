import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { applyAction, LifecycleError, type WorkflowAction } from "@/lib/domain/lifecycle";
import { notificationsFor } from "@/lib/domain/notifications";
import type { AuditAction } from "./audit";
import { adminDb } from "./firebase-admin";
import { adminUids, notifyOnce } from "./notify";
import { runRetention } from "./retention";
import { ping } from "./storage";
import type { ComplaintDoc } from "./types";
import { clock, writeTransition } from "./workflow";

// Scheduled work (plan.md D3): GitHub Actions calls POST /api/cron/sweep every 30 minutes, and
// admin/committee screens trigger it opportunistically. Bounded per run and idempotent: every
// item is re-checked inside its own transaction, so overlapping runs can't double-apply.

const db = adminDb;
const BATCH = 50;
const STATE = db.doc("systemSettings/sweep");
const OPPORTUNISTIC_MIN = 10;
const REMIND_BEFORE_MS = 12 * 3600_000;

async function transition(
  id: string,
  action: WorkflowAction,
  audit: AuditAction,
  now: number,
  admins: string[],
) {
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`complaints/${id}`);
    const c = (await tx.get(ref)).data() as ComplaintDoc | undefined;
    if (!c) return false;
    try {
      writeTransition(tx, id, c, applyAction(c, action, clock(now)), null, audit, admins);
      return true;
    } catch (e) {
      if (e instanceof LifecycleError) return false; // already handled by another run
      throw e;
    }
  });
}

export async function sweep(now = Date.now()) {
  const due = Timestamp.fromMillis(now);
  const admins = await adminUids();
  const count = async (ids: string[], action: WorkflowAction, audit: AuditAction) =>
    (await Promise.all(ids.map((id) => transition(id, action, audit, now, admins)))).filter(Boolean)
      .length;

  // No documented action by the first-action deadline → escalate (PRD §6.2).
  const overdue = await db
    .collection("complaints")
    .where("firstActionAt", "==", null)
    .where("escalated", "==", false)
    .where("firstActionDeadline", "<=", due)
    .limit(BATCH)
    .get();
  const escalated = await count(
    overdue.docs.map((d) => d.id),
    {
      type: "escalate",
      reason: "Overdue: nothing was recorded before the deadline.",
      by: "system",
    },
    "complaint.escalate",
  );

  // Resolved and the student didn't reply in the category window → close (PRD §6.3, FR-11).
  const expired = await db
    .collection("complaints")
    .where("status", "==", "resolved")
    .where("confirmationDeadline", "<=", due)
    .limit(BATCH)
    .get();
  const closed = await count(
    expired.docs.map((d) => d.id),
    { type: "auto_close" },
    "complaint.auto_close",
  );

  // Reporter reminder before an auto-close: once per resolution, ~12 hours ahead (PRD §6.3).
  const closingSoon = await db
    .collection("complaints")
    .where("status", "==", "resolved")
    .where("confirmationDeadline", "<=", Timestamp.fromMillis(now + REMIND_BEFORE_MS))
    .limit(BATCH)
    .get();
  const reminded = (
    await Promise.all(
      closingSoon.docs.map((d) => {
        const c = d.data() as ComplaintDoc;
        if (!c.resolvedAt || c.confirmationDeadline!.toMillis() <= now) return false;
        const [draft] = notificationsFor("closure_reminder", c, { actorUid: null, adminUids: [] });
        return notifyOnce(d.id, draft, `resolved-${c.resolvedAt.toMillis()}`);
      }),
    )
  ).filter(Boolean).length;

  // Keeps the free Supabase project from pausing (D2). A failure here mustn't fail the sweep.
  // Reports the backend it reached, so a Sweep run in GitHub Actions doubles as a storage check.
  const storage = await ping().then(
    (backend) => (backend === "none" ? "not configured" : `${backend} ok`),
    (e) => (console.error("Storage keep-alive failed", e), "failed"),
  );

  const retention = await runRetention(now);

  await STATE.set({ lastRunAt: due, escalated, closed, reminded, storage, retention });
  return {
    escalated,
    closed,
    reminded,
    storage,
    retention,
    more: overdue.size === BATCH || expired.size === BATCH || closingSoon.size === BATCH,
  };
}

/** Runs the sweep if nobody has in the last few minutes. Never throws into the caller. */
export async function maybeSweep() {
  try {
    const last = (await STATE.get()).get("lastRunAt") as Timestamp | undefined;
    if (!last || Date.now() - last.toMillis() > OPPORTUNISTIC_MIN * 60_000) await sweep();
  } catch (e) {
    console.error("Opportunistic sweep failed", e);
  }
}
