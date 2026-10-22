import "server-only";
import { FieldValue, type Transaction, type WriteBatch } from "firebase-admin/firestore";
import type { WorkflowInput } from "@/lib/domain/schemas";
import { adminDb } from "./firebase-admin";

export type AuditAction =
  | "account.activate"
  | "account.activate_failed"
  | "account.login_failed"
  | "account.password_change"
  | "account.deactivate"
  | "account.reactivate"
  | "account.reset"
  | "account.room_change"
  | "account.role_change"
  | "account.admin_created"
  | "account.preferences"
  | "activation.issue"
  | "roster.import"
  | "config.seed"
  | "config.update"
  | "complaint.create"
  | "complaint.support"
  | "comment.create"
  | "comment.hide"
  | "report.create"
  | "report.resolve"
  | "export.csv"
  | "complaint.retention_delete"
  | `complaint.${WorkflowInput["type"] | "auto_close" | "reporter_view"}`
  | "attachment.upload";

export type AuditEntry = {
  actorUid: string | null;
  action: AuditAction;
  target: { type: "user" | "roster" | "system" | "config" | "complaint" | "report"; id: string };
  outcome: "success" | "failure";
  /** Minimal, non-sensitive context. Never passwords, codes, tokens or complaint bodies. */
  meta?: Record<string, string | number | boolean | null>;
};

/** Append-only audit record written in the same transaction/batch as the change it describes. */
export function writeAudit(w: Transaction | WriteBatch, e: AuditEntry) {
  const ref = adminDb.collection("auditLogs").doc();
  (w as WriteBatch).set(ref, { ...e, meta: e.meta ?? {}, at: FieldValue.serverTimestamp() });
}

/** Standalone audit write for events with no other state change (e.g. failed logins). */
export async function audit(e: AuditEntry) {
  const b = adminDb.batch();
  writeAudit(b, e);
  await b.commit();
}
