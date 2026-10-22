import "server-only";
import { Timestamp, type Query } from "firebase-admin/firestore";
import type { IssueSummary } from "@/lib/domain/complaint";
import { isOverdue } from "@/lib/domain/lifecycle";
import { can } from "@/lib/domain/permissions";
import type { QueueQuery } from "@/lib/domain/schemas";
import type { SessionUser } from "./auth";
import { iso, toSummary } from "./complaints";
import { loadConfig } from "./config";
import { adminDb } from "./firebase-admin";
import type { ComplaintDoc } from "./types";

const db = adminDb;
const PAGE = 20;

export type QueueItem = IssueSummary & {
  deadline: string;
  overdue: boolean;
  assignee: string | null;
  hidden: boolean;
  confirmationDeadline: string | null;
};

async function toItems(docs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const contacts = new Map((await loadConfig()).contacts.map((c) => [c.id, c.name]));
  const now = Date.now();
  return docs.map((d): QueueItem => {
    const c = d.data() as ComplaintDoc;
    return {
      ...toSummary(d.id, c),
      deadline: iso(c.firstActionDeadline),
      overdue: isOverdue(c, now, (t) => t.toMillis()),
      assignee: (c.assignedContactId && contacts.get(c.assignedContactId)) ?? null,
      hidden: c.hidden,
      confirmationDeadline: c.confirmationDeadline ? iso(c.confirmationDeadline) : null,
    };
  });
}

/**
 * Admin queue (PRD §7.2). "Needs action" is ordered by first-action deadline, so overdue items
 * come first. Filters are equality-only and apply to that view (indexes merge per field).
 */
export async function listQueue(user: SessionUser, p: QueueQuery) {
  let q: Query = db.collection("complaints");
  if (!can(user, "confidential.view")) q = q.where("visibility", "==", "public");
  if (p.view === "active") {
    q = q.where("open", "==", true);
    if (p.status) q = q.where("status", "==", p.status);
    if (p.priority) q = q.where("priority", "==", p.priority);
    if (p.categoryId) q = q.where("categoryId", "==", p.categoryId);
    if (p.blockId) q = q.where("location.blockId", "==", p.blockId);
    if (p.assignee)
      q = q.where("assignedContactId", "==", p.assignee === "none" ? null : p.assignee);
    if (p.escalated) q = q.where("escalated", "==", true);
    q = q.orderBy("firstActionDeadline");
  } else if (p.view === "resolved") {
    q = q.where("status", "==", "resolved").orderBy("confirmationDeadline");
  } else {
    q = q.where("status", "==", "closed").orderBy("updatedAt", "desc");
  }
  if (p.after) {
    const cursor = await db.doc(`complaints/${p.after}`).get();
    if (cursor.exists) q = q.startAfter(cursor);
  }
  const docs = (await q.limit(PAGE + 1).get()).docs;
  const page = docs.slice(0, PAGE);
  return { items: await toItems(page), next: docs.length > PAGE ? page[page.length - 1].id : null };
}

/**
 * Committee view: open public complaints that are overdue or escalated. Never confidential ones
 * (a committee role doesn't grant that, PRD §3). Bounded; small enough to merge in memory.
 */
export async function listCommittee() {
  const open = db.collection("complaints").where("open", "==", true);
  const [overdue, escalated] = await Promise.all([
    open
      .where("firstActionDeadline", "<=", Timestamp.now())
      .orderBy("firstActionDeadline")
      .limit(50)
      .get(),
    open.where("escalated", "==", true).orderBy("firstActionDeadline").limit(50).get(),
  ]);
  const seen = new Set<string>();
  const docs = [...escalated.docs, ...overdue.docs].filter((d) => {
    const c = d.data() as ComplaintDoc;
    const keep =
      !seen.has(d.id) &&
      c.visibility === "public" &&
      !c.hidden &&
      (c.escalated || isOverdue(c, Date.now(), (t) => t.toMillis()));
    seen.add(d.id);
    return keep;
  });
  return { items: await toItems(docs) };
}
