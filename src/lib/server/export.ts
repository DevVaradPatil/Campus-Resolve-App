import "server-only";
import type { Query, Timestamp } from "firebase-admin/firestore";
import { csvRow } from "@/lib/domain/csv";
import { can } from "@/lib/domain/permissions";
import { writeAudit } from "./audit";
import type { SessionUser } from "./auth";
import { loadConfig } from "./config";
import { adminDb } from "./firebase-admin";
import { HttpError } from "./http";
import type { ComplaintDoc } from "./types";

const db = adminDb;
const MAX_ROWS = 2000;

const ist = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const when = (t: Timestamp | null | undefined) =>
  t ? ist.format(t.toDate()).replace(",", "") : "";

/**
 * The allowlist. Never exported: reporter identity, room reference, location note, description,
 * comments, photos, internal notes. Titles of confidential complaints only with explicit
 * authorization (FR-15).
 */
const COLUMNS = [
  "ticket_id",
  "created_at_ist",
  "title",
  "category",
  "subcategory",
  "location",
  "visibility",
  "priority",
  "status",
  "escalated",
  "assignee",
  "first_action_due_ist",
  "first_action_at_ist",
  "handled_on_time",
  "resolved_at_ist",
  "resolution_hours",
  "closed_at_ist",
  "closure_reason",
  "support_count",
  "feedback_rating",
  "merged_into",
] as const;

export async function exportCsv(
  user: SessionUser,
  p: { from: string; to: string; confidential: boolean },
) {
  const withConfidential = p.confidential && can(user, "confidential.view");
  const start = Date.parse(`${p.from}T00:00:00+05:30`);
  const end = Date.parse(`${p.to}T00:00:00+05:30`) + 86_400_000;
  if (!(end > start) || end - start > 366 * 86_400_000)
    throw new HttpError(400, "Pick a range of up to a year.");

  let q: Query = db.collection("complaints");
  if (!withConfidential) q = q.where("visibility", "==", "public");
  const snap = await q
    .where("createdAt", ">=", new Date(start))
    .where("createdAt", "<", new Date(end))
    .orderBy("createdAt")
    .limit(MAX_ROWS + 1)
    .get();
  if (snap.size > MAX_ROWS)
    throw new HttpError(400, `That's more than ${MAX_ROWS} complaints. Pick a shorter range.`);

  const docs = snap.docs.map((d) => ({ id: d.id, c: d.data() as ComplaintDoc }));
  const cfg = await loadConfig();
  const contacts = new Map(cfg.contacts.map((c) => [c.id, c.name]));
  const tickets = new Map(docs.map((d) => [d.id, d.c.ticketId]));
  const visible = new Map(docs.map((d) => [d.id, true]));

  const lines = [COLUMNS.join(",")];
  for (const { c } of docs) {
    const first = c.firstActionAt?.toMillis();
    lines.push(
      csvRow([
        c.ticketId,
        when(c.createdAt),
        c.visibility === "public" || withConfidential ? c.title : "",
        c.categoryLabel,
        c.subcategoryLabel,
        c.locationLabel.join(" / "),
        c.visibility,
        c.priority,
        c.status,
        c.escalated,
        c.assignedContactId ? (contacts.get(c.assignedContactId) ?? c.assignedContactId) : "",
        when(c.firstActionDeadline),
        when(c.firstActionAt),
        first === undefined ? "" : first <= c.firstActionDeadline.toMillis(),
        when(c.resolvedAt),
        c.resolvedAt
          ? Math.round(((c.resolvedAt.toMillis() - c.createdAt.toMillis()) / 3600_000) * 10) / 10
          : "",
        when(c.closedAt),
        c.closureReason,
        c.supportCount,
        c.feedback?.rating,
        // Only name a primary that's in this same export (so it's one the user may see).
        c.duplicateOf
          ? visible.has(c.duplicateOf)
            ? tickets.get(c.duplicateOf)
            : "another report"
          : "",
      ]),
    );
  }

  const b = db.batch();
  writeAudit(b, {
    actorUid: user.uid,
    action: "export.csv",
    target: { type: "system", id: "export" },
    outcome: "success",
    meta: { from: p.from, to: p.to, rows: docs.length, confidential: withConfidential },
  });
  await b.commit();
  // BOM so Excel reads UTF-8 (₹, names in Hindi).
  return { csv: "﻿" + lines.join("\r\n") + "\r\n", rows: docs.length };
}
