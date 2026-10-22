// Who hears about what (PRD §13). Pure: the server writes the result in the same transaction as
// the change that caused it. Creation is separate from delivery, so email can be added later.

import type { ComplaintRecord } from "./complaint";
import type { EventType } from "./lifecycle";

export type NotificationType = EventType | "closure_reminder" | "comment";

export type NotificationDraft = {
  recipientUid: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** Needs the recipient's action or is about their complaint's outcome. Muting never hides these. */
  essential: boolean;
};

type Who = "reporter" | "admins";
const RULES: Partial<Record<NotificationType, { to: Who[]; title: string; essential: boolean }>> = {
  created: { to: ["admins"], title: "New complaint {t}", essential: false },
  assigned: { to: ["reporter"], title: "{t} was assigned", essential: false },
  started: { to: ["reporter"], title: "Work started on {t}", essential: false },
  note: { to: ["reporter"], title: "Update on {t}", essential: false },
  resolved: { to: ["reporter"], title: "Is {t} fixed?", essential: true },
  auto_closed: { to: ["reporter"], title: "{t} was closed", essential: false },
  reopened: { to: ["admins"], title: "{t} was reopened", essential: true },
  escalated: { to: ["reporter", "admins"], title: "{t} was escalated", essential: true },
  hidden: { to: ["reporter"], title: "{t} was hidden from the feed", essential: true },
  closure_reminder: { to: ["reporter"], title: "{t} closes soon", essential: true },
  // Admins are only passed in for confidential complaints (the reporter's private thread).
  comment: { to: ["reporter", "admins"], title: "New comment on {t}", essential: false },
};

/**
 * Notifications for one event. Never notifies the person who acted. Confidential complaints get
 * no content in the preview, only the ticket number (PRD §12.4).
 */
export function notificationsFor<T>(
  type: NotificationType,
  c: ComplaintRecord<T>,
  opts: { actorUid: string | null; adminUids: string[]; note?: string | null; critical?: boolean },
): NotificationDraft[] {
  const rule = RULES[type];
  if (!rule) return [];
  const isPublic = c.visibility === "public";
  const essential = rule.essential || (type === "created" && !!opts.critical);
  const title = (type === "created" && opts.critical ? "Critical: {t}" : rule.title).replace(
    "{t}",
    c.ticketId,
  );
  const body = !isPublic
    ? null
    : type === "resolved"
      ? "Confirm it's fixed, or reopen it if it isn't."
      : type === "closure_reminder"
        ? "Reply if it's still a problem, or it closes automatically."
        : (opts.note ?? c.title);

  const uids = new Set<string>();
  if (rule.to.includes("reporter")) uids.add(c.reporterUid);
  if (rule.to.includes("admins")) opts.adminUids.forEach((u) => uids.add(u));
  if (opts.actorUid) uids.delete(opts.actorUid);
  return [...uids].map((recipientUid) => ({ recipientUid, type, title, body, essential }));
}

/** Same type + ticket + person within the bucket collapses to one notification. */
export const dedupeKey = (
  d: Pick<NotificationDraft, "type" | "recipientUid">,
  complaintId: string,
  bucket: string | number,
) => `${d.type}:${complaintId}:${d.recipientUid}:${bucket}`;

export const hourBucket = (ms: number) => Math.floor(ms / 3600_000);
