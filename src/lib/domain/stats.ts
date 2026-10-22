// Pre-aggregated counters (CLAUDE.md: dashboards read stats docs, never every complaint).
// One doc per day in Asia/Kolkata, `stats/{YYYY-MM-DD}`. `statsDelta()` is pure: given a
// complaint before and after a change, it says which counters move on which day. The server
// applies the result in the same transaction as the change.

import type { ComplaintRecord } from "./complaint";
import type { EventType } from "./lifecycle";

const ist = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
/** Calendar day in India, e.g. "2026-10-22". */
export const dayKey = (ms: number) => ist.format(new Date(ms));

/** Counter paths are dotted ("byCategory.mess"); `set` values replace, `inc` values add. */
export type StatsWrite = { day: string; inc: Record<string, number>; set?: Record<string, number> };

/**
 * Cohort counters live on the complaint's *creation* day so the resolution rate can be reported
 * per cohort (PRD §7.4). Everything else is counted on the day it happens.
 */
export function statsDelta<T>(
  id: string,
  before: ComplaintRecord<T> | null,
  after: ComplaintRecord<T>,
  event: EventType | "feedback",
  nowMs: number,
  toMs: (t: T) => number,
): StatsWrite[] {
  const today: StatsWrite = { day: dayKey(nowMs), inc: {} };
  const out = [today];
  const cohort = (inc: Record<string, number>) =>
    out.push({ day: dayKey(before ? toMs(before.createdAt) : nowMs), inc });
  const add = (k: string, n = 1) => (today.inc[k] = (today.inc[k] ?? 0) + n);

  if (event === "created") {
    add("created");
    add(`byCategory.${after.categoryId}`);
    add(`byBlock.${after.location.blockId ?? "none"}`);
    add(`byPriority.${after.priority}`);
    if (after.visibility === "confidential") add("confidential");
    if (after.priority === "critical") add("escalations.critical");
    // Same day as "today" for a new complaint.
    add("cohort.eligible");
    return out;
  }
  if (!before) return out;

  // First documented action in this cycle: on time or not (on-time handling rate).
  if (!before.firstActionAt && after.firstActionAt)
    add(nowMs <= toMs(before.firstActionDeadline) ? "firstAction.onTime" : "firstAction.late");

  // Staff workload as recorded in the system, never "staff performance" (PRD §7.2).
  const contact = after.assignedContactId;
  if (event === "assigned" && contact) add(`workload.${contact}.assigned`);
  if ((event === "started" || event === "note" || event === "resolved") && contact)
    add(`workload.${contact}.updates`);

  switch (event) {
    case "resolved":
      add("resolved");
      today.set = {
        // Keyed by complaint, so a re-resolution replaces rather than double-counts.
        [`resolutionHours.${id}`]:
          Math.round(((nowMs - toMs(before.createdAt)) / 3600_000) * 10) / 10,
      };
      cohort({ "cohort.resolved": 1 });
      if (before.escalated) add("escalations.resolved"); // escalation outcome (PRD §7.3)
      break;
    case "reopened":
      add("reopened");
      cohort({ "cohort.resolved": -1 });
      break;
    case "confirmed":
      add("closed.student_confirmed");
      break;
    case "auto_closed":
      add("closed.confirmation_window_expired");
      break;
    case "escalated":
      add("escalations.raised");
      break;
    case "duplicate":
      add("duplicates");
      add("closed.duplicate");
      // A merged report no longer counts in its cohort's resolution rate.
      cohort({
        "cohort.eligible": -1,
        ...(before.status === "resolved" ? { "cohort.resolved": -1 } : {}),
      });
      break;
    case "feedback":
      if (after.feedback) {
        add("feedback.count");
        add("feedback.sum", after.feedback.rating);
        add(`feedback.r${after.feedback.rating}`);
      }
      break;
  }
  return out.filter((w) => Object.keys(w.inc).length || w.set);
}

/** A stats doc as stored. Every field is optional: days with nothing in them have no doc. */
export type StatsDoc = {
  created?: number;
  confidential?: number;
  byCategory?: Record<string, number>;
  byBlock?: Record<string, number>;
  byPriority?: Record<string, number>;
  cohort?: { eligible?: number; resolved?: number };
  firstAction?: { onTime?: number; late?: number };
  resolved?: number;
  resolutionHours?: Record<string, number>;
  reopened?: number;
  closed?: Record<string, number>;
  escalations?: Record<string, number>;
  duplicates?: number;
  feedback?: { count?: number; sum?: number } & Record<string, number>;
  workload?: Record<string, { assigned?: number; updates?: number }>;
};
