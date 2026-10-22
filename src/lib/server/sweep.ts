import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { applyAction, LifecycleError, type WorkflowAction } from "@/lib/domain/lifecycle";
import type { AuditAction } from "./audit";
import { adminDb } from "./firebase-admin";
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

async function transition(id: string, action: WorkflowAction, audit: AuditAction, now: number) {
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`complaints/${id}`);
    const c = (await tx.get(ref)).data() as ComplaintDoc | undefined;
    if (!c) return false;
    try {
      writeTransition(tx, id, c, applyAction(c, action, clock(now)), null, audit);
      return true;
    } catch (e) {
      if (e instanceof LifecycleError) return false; // already handled by another run
      throw e;
    }
  });
}

export async function sweep(now = Date.now()) {
  const due = Timestamp.fromMillis(now);
  const count = async (ids: string[], action: WorkflowAction, audit: AuditAction) =>
    (await Promise.all(ids.map((id) => transition(id, action, audit, now)))).filter(Boolean).length;

  // No documented action by the first-action deadline → escalate (PRD §6.2).
  // Phase 5: notify the designated lead and backup here.
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

  // Keeps the free Supabase project from pausing (D2). A failure here mustn't fail the sweep.
  const storage = await ping().then(
    () => "ok",
    (e) => (console.error("Storage keep-alive failed", e), "failed"),
  );

  await STATE.set({ lastRunAt: due, escalated, closed, storage });
  return { escalated, closed, storage, more: overdue.size === BATCH || expired.size === BATCH };
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
